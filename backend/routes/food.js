const express = require("express");
const { v4: uuidv4 } = require("uuid");
const { pool } = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");
const { getFoodQuote } = require("../food-quote");
const { initializeTransaction, verifyTransaction } = require("../paystack");
const { trackingCode } = require("../pricing");
const { checkReferralReward } = require("../referrals");
const { recordStreakActivity } = require("../streaks");

const router = express.Router();

function paymentReference() {
  return `PAEFOOD-${uuidv4().replace(/-/g, "").slice(0, 20).toUpperCase()}`;
}
function callbackUrl() {
  const base = process.env.FRONTEND_URL || "http://localhost:5173";
  return `${base.replace(/\/$/, "")}/food/payment/callback`;
}

async function loadApprovedOutlet(outletId) {
  const { rows } = await pool.query("SELECT * FROM outlet_profiles WHERE user_id = $1 AND approval_status = 'approved'", [outletId]);
  return rows[0] || null;
}

// ---------- ESTIMATE (customer) ----------
router.post("/estimate", requireAuth, async (req, res) => {
  try {
    const { outlet_id, items, delivery_address, city, address_lat, address_lng } = req.body;
    const outlet = await loadApprovedOutlet(outlet_id);
    if (!outlet) return res.status(404).json({ error: "Outlet not found" });

    const address_coords = address_lat != null && address_lng != null ? { lat: address_lat, lng: address_lng } : null;
    const quote = await getFoodQuote({ outlet, items, delivery_address, city: city || outlet.city, address_coords });
    res.json(quote);
  } catch (err) {
    res.status(400).json({ error: err.message || "Couldn't calculate a price for this order" });
  }
});

// ---------- CREATE + PAY (customer) ----------
router.post("/", requireAuth, requireRole("customer"), async (req, res) => {
  try {
    const { outlet_id, items, delivery_address, city, address_lat, address_lng, landmark, contact_phone, note, payment_method } = req.body;
    if (!delivery_address || !city || !contact_phone) {
      return res.status(400).json({ error: "Delivery address, city, and a contact phone number are required" });
    }
    if (payment_method !== "wallet" && payment_method !== "paystack") {
      return res.status(400).json({ error: "Choose a payment method" });
    }

    const outlet = await loadApprovedOutlet(outlet_id);
    if (!outlet) return res.status(404).json({ error: "Outlet not found" });
    if (!outlet.is_open) return res.status(409).json({ error: `${outlet.business_name} is currently closed` });

    // Re-check every item against the live menu server-side — never trust
    // prices the client sends back, same principle as withdrawals.js
    // re-resolving the bank account name instead of trusting the client.
    const itemIds = (items || []).map((i) => i.id);
    if (itemIds.length === 0) return res.status(400).json({ error: "Your cart is empty" });
    const { rows: menuRows } = await pool.query(
      "SELECT * FROM menu_items WHERE id = ANY($1) AND outlet_id = $2",
      [itemIds, outlet_id]
    );
    const menuById = Object.fromEntries(menuRows.map((m) => [m.id, m]));
    const verifiedItems = [];
    for (const cartItem of items) {
      const menuItem = menuById[cartItem.id];
      if (!menuItem) return res.status(400).json({ error: "One of the items in your cart no longer exists" });
      if (!menuItem.is_available) return res.status(409).json({ error: `${menuItem.name} is currently unavailable` });
      const qty = Number(cartItem.quantity);
      if (!Number.isFinite(qty) || qty <= 0) return res.status(400).json({ error: "Invalid quantity" });
      verifiedItems.push({ id: menuItem.id, name: menuItem.name, price: Number(menuItem.price), quantity: qty });
    }

    const address_coords = address_lat != null && address_lng != null ? { lat: address_lat, lng: address_lng } : null;
    const quote = await getFoodQuote({ outlet, items: verifiedItems, delivery_address, city, address_coords });
    const resolvedLat = quote.destination?.lat ?? address_lat ?? null;
    const resolvedLng = quote.destination?.lng ?? address_lng ?? null;

    const id = uuidv4();
    const code = trackingCode();
    const itemsJson = JSON.stringify(verifiedItems);

    if (payment_method === "wallet") {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const { rows: userRows } = await client.query("SELECT wallet_balance FROM users WHERE id = $1 FOR UPDATE", [req.user.id]);
        const balance = Number(userRows[0]?.wallet_balance ?? 0);
        if (balance < quote.price) {
          await client.query("ROLLBACK");
          return res.status(402).json({
            error: `Insufficient wallet balance. You have ₦${balance.toLocaleString()}, this order costs ₦${quote.price.toLocaleString()}.`,
          });
        }

        await client.query(
          `INSERT INTO food_orders (
            id, customer_id, outlet_id, items, subtotal, platform_commission, delivery_fee, distance_km, price,
            delivery_address, city, address_lat, address_lng, landmark, contact_phone, note, tracking_code,
            status, payment_status, payment_method, placed_at
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,'placed','paid','wallet', now())`,
          [id, req.user.id, outlet_id, itemsJson, quote.subtotal, quote.platformCommission, quote.deliveryFee, quote.distanceKm, quote.price,
           delivery_address, city, resolvedLat, resolvedLng, landmark ?? null, contact_phone, note ?? null, code]
        );

        const newBalance = balance - quote.price;
        await client.query("UPDATE users SET wallet_balance = $1 WHERE id = $2", [newBalance, req.user.id]);
        await client.query(
          `INSERT INTO wallet_transactions (id, user_id, type, amount, balance_after, status, note)
           VALUES ($1,$2,'food_payment',$3,$4,'success',$5)`,
          [uuidv4(), req.user.id, -quote.price, newBalance, `Food order ${code} — ${outlet.business_name}`]
        );
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        throw err;
      } finally {
        client.release();
      }

      await recordStreakActivity(req.user.id).catch(() => {});
      const { rows } = await pool.query("SELECT * FROM food_orders WHERE id = $1", [id]);
      return res.status(201).json({ order: rows[0], authorization_url: null });
    }

    // paystack
    const reference = paymentReference();
    await pool.query(
      `INSERT INTO food_orders (
        id, customer_id, outlet_id, items, subtotal, platform_commission, delivery_fee, distance_km, price,
        delivery_address, city, address_lat, address_lng, landmark, contact_phone, note, tracking_code,
        status, payment_status, payment_method, paystack_reference
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,'pending','unpaid','paystack',$18)`,
      [id, req.user.id, outlet_id, itemsJson, quote.subtotal, quote.platformCommission, quote.deliveryFee, quote.distanceKm, quote.price,
       delivery_address, city, resolvedLat, resolvedLng, landmark ?? null, contact_phone, note ?? null, code, reference]
    );

    const paystackData = await initializeTransaction({
      email: req.user.email,
      amountNaira: quote.price,
      reference,
      callback_url: callbackUrl(),
      metadata: { type: "food_order", order_id: id },
    });

    res.status(201).json({ order_id: id, authorization_url: paystackData.authorization_url });
  } catch (err) {
    console.error("Food order creation failed:", err.message);
    res.status(500).json({ error: "Something went wrong placing your order" });
  }
});

// ---------- VERIFY A PAYSTACK PAYMENT (customer) ----------
router.get("/verify/:reference", requireAuth, requireRole("customer"), async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM food_orders WHERE paystack_reference = $1", [req.params.reference]);
    const order = rows[0];
    if (!order) return res.status(404).json({ error: "No order found for this reference" });
    if (order.customer_id !== req.user.id) return res.status(403).json({ error: "Not your order" });

    if (order.payment_status === "paid") return res.json({ status: "paid", order });
    if (order.payment_status === "failed") return res.json({ status: "failed" });

    const paystackTxn = await verifyTransaction(req.params.reference);
    if (paystackTxn.status === "success") {
      await pool.query("UPDATE food_orders SET payment_status = 'paid', status = 'placed', placed_at = now() WHERE id = $1", [order.id]);
      await recordStreakActivity(req.user.id).catch(() => {});
      const { rows: updated } = await pool.query("SELECT * FROM food_orders WHERE id = $1", [order.id]);
      return res.json({ status: "paid", order: updated[0] });
    }
    await pool.query("UPDATE food_orders SET payment_status = 'failed' WHERE id = $1", [order.id]);
    res.json({ status: "failed" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong verifying your payment" });
  }
});

// ---------- MY ORDERS (customer) ----------
router.get("/mine", requireAuth, requireRole("customer"), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT f.*, o.business_name AS outlet_name, u.full_name AS agent_name, u.phone AS agent_phone
       FROM food_orders f
       JOIN outlet_profiles o ON o.user_id = f.outlet_id
       LEFT JOIN users u ON u.id = f.agent_id
       WHERE f.customer_id = $1 ORDER BY f.created_at DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong loading your orders" });
  }
});

// ---------- CANCEL (customer) — only before the outlet has started
// preparing it. Once they're cooking, cancelling wastes real food and
// their time, same reasoning as gas/delivery cancel windows elsewhere. ----------
router.patch("/:id/cancel", requireAuth, requireRole("customer"), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query("SELECT * FROM food_orders WHERE id = $1 FOR UPDATE", [req.params.id]);
    const order = rows[0];
    if (!order) { await client.query("ROLLBACK"); return res.status(404).json({ error: "Order not found" }); }
    if (order.customer_id !== req.user.id) { await client.query("ROLLBACK"); return res.status(403).json({ error: "Not your order" }); }
    if (order.status !== "placed") {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "This order can no longer be cancelled — the outlet has already started on it" });
    }

    await client.query("UPDATE food_orders SET status = 'cancelled', cancelled_at = now() WHERE id = $1", [order.id]);

    if (order.payment_status === "paid" && order.payment_method === "wallet") {
      const { rows: userRows } = await client.query("UPDATE users SET wallet_balance = wallet_balance + $1 WHERE id = $2 RETURNING wallet_balance", [order.price, req.user.id]);
      await client.query(
        `INSERT INTO wallet_transactions (id, user_id, type, amount, balance_after, status, note)
         VALUES ($1,$2,'refund',$3,$4,'success',$5)`,
        [uuidv4(), req.user.id, order.price, userRows[0].wallet_balance, `Refund — food order ${order.tracking_code} cancelled`]
      );
    }

    await client.query("COMMIT");
    res.json({ status: "cancelled" });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(err);
    res.status(500).json({ error: "Something went wrong cancelling this order" });
  } finally {
    client.release();
  }
});

// Shared refund helper — used by both the outlet-reject path below and
// could be reused anywhere else an order needs unwinding after payment.
async function refundOrder(order, reason) {
  if (!(order.payment_status === "paid" && order.payment_method === "wallet")) return;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      "UPDATE users SET wallet_balance = wallet_balance + $1 WHERE id = $2 RETURNING wallet_balance",
      [order.price, order.customer_id]
    );
    await client.query(
      `INSERT INTO wallet_transactions (id, user_id, type, amount, balance_after, status, note)
       VALUES ($1,$2,'refund',$3,$4,'success',$5)`,
      [uuidv4(), order.customer_id, order.price, rows[0].wallet_balance, reason]
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Refund failed:", err.message);
  } finally {
    client.release();
  }
}

// ================= OUTLET SIDE =================

router.get("/outlet/incoming", requireAuth, requireRole("outlet"), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT f.*, u.full_name AS customer_name, u.phone AS customer_phone
       FROM food_orders f JOIN users u ON u.id = f.customer_id
       WHERE f.outlet_id = $1 AND f.status IN ('placed','preparing','ready_for_pickup')
       ORDER BY f.created_at ASC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong loading your orders" });
  }
});

router.get("/outlet/history", requireAuth, requireRole("outlet"), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT f.*, u.full_name AS customer_name, u.phone AS customer_phone
       FROM food_orders f JOIN users u ON u.id = f.customer_id
       WHERE f.outlet_id = $1 AND f.status IN ('picked_up','delivered','cancelled','rejected')
       ORDER BY f.created_at DESC LIMIT 100`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong loading your order history" });
  }
});

router.patch("/:id/accept", requireAuth, requireRole("outlet"), async (req, res) => {
  try {
    const { rows } = await pool.query(
      "UPDATE food_orders SET status = 'preparing', accepted_at = now() WHERE id = $1 AND outlet_id = $2 AND status = 'placed' RETURNING *",
      [req.params.id, req.user.id]
    );
    if (!rows[0]) return res.status(409).json({ error: "This order can't be accepted right now" });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong accepting this order" });
  }
});

router.patch("/:id/reject", requireAuth, requireRole("outlet"), async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT * FROM food_orders WHERE id = $1 AND outlet_id = $2 AND status = 'placed'",
      [req.params.id, req.user.id]
    );
    const order = rows[0];
    if (!order) return res.status(409).json({ error: "This order can't be rejected right now" });

    const reason = (req.body.reason || "").trim() || null;
    await pool.query(
      "UPDATE food_orders SET status = 'rejected', rejection_reason = $1 WHERE id = $2",
      [reason, order.id]
    );
    await refundOrder(order, reason ? `Order rejected by outlet: ${reason}` : "Order rejected by outlet — refunded");
    res.json({ status: "rejected" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong rejecting this order" });
  }
});

router.patch("/:id/ready", requireAuth, requireRole("outlet"), async (req, res) => {
  try {
    const { rows } = await pool.query(
      "UPDATE food_orders SET status = 'ready_for_pickup', ready_at = now() WHERE id = $1 AND outlet_id = $2 AND status = 'preparing' RETURNING *",
      [req.params.id, req.user.id]
    );
    if (!rows[0]) return res.status(409).json({ error: "This order isn't ready to be marked as such" });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong updating this order" });
  }
});

// ================= AGENT SIDE (bike/self agents — see decision to
// reuse the existing delivery agent pool rather than a dedicated food
// agent type) =================

async function requireBikeOrSelfAgent(req, res) {
  const { rows } = await pool.query("SELECT vehicle_type, approval_status FROM agent_profiles WHERE user_id = $1", [req.user.id]);
  const profile = rows[0];
  if (!profile || !["bike", "self"].includes(profile.vehicle_type)) {
    res.status(403).json({ error: "Only bike and self agents can access food deliveries" });
    return null;
  }
  if (profile.approval_status !== "approved") {
    res.status(403).json({ error: "Your agent account is not yet approved" });
    return null;
  }
  return profile;
}

// Available from 'preparing' onward — an agent can head to the outlet
// and wait for the food, same as a real courier would, rather than only
// seeing jobs once food is already sitting ready.
router.get("/available", requireAuth, requireRole("agent"), async (req, res) => {
  const profile = await requireBikeOrSelfAgent(req, res);
  if (!profile) return;
  try {
    const { rows } = await pool.query(
      `SELECT f.*, o.business_name AS outlet_name, o.address AS outlet_address
       FROM food_orders f JOIN outlet_profiles o ON o.user_id = f.outlet_id
       WHERE f.status IN ('preparing','ready_for_pickup') AND f.agent_id IS NULL
       ORDER BY f.created_at ASC`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong loading available orders" });
  }
});

router.get("/assigned", requireAuth, requireRole("agent"), async (req, res) => {
  const profile = await requireBikeOrSelfAgent(req, res);
  if (!profile) return;
  try {
    const { rows } = await pool.query(
      `SELECT f.*, o.business_name AS outlet_name, o.address AS outlet_address, u.full_name AS customer_name, u.phone AS customer_phone
       FROM food_orders f
       JOIN outlet_profiles o ON o.user_id = f.outlet_id
       JOIN users u ON u.id = f.customer_id
       WHERE f.agent_id = $1 ORDER BY f.created_at DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong loading your jobs" });
  }
});

router.post("/:id/accept-delivery", requireAuth, requireRole("agent"), async (req, res) => {
  const profile = await requireBikeOrSelfAgent(req, res);
  if (!profile) return;
  try {
    const { rows } = await pool.query(
      `UPDATE food_orders SET agent_id = $1
       WHERE id = $2 AND status IN ('preparing','ready_for_pickup') AND agent_id IS NULL RETURNING *`,
      [req.user.id, req.params.id]
    );
    if (!rows[0]) return res.status(409).json({ error: "This order was just taken by another agent, or is no longer available" });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong accepting this order" });
  }
});

router.patch("/:id/agent-cancel", requireAuth, requireRole("agent"), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `UPDATE food_orders SET agent_id = NULL
       WHERE id = $1 AND agent_id = $2 AND status IN ('preparing','ready_for_pickup') RETURNING *`,
      [req.params.id, req.user.id]
    );
    if (!rows[0]) return res.status(409).json({ error: "Can't back out of this job at this stage" });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong" });
  }
});

// ---------- MARK PICKED UP — only succeeds once the outlet has actually
// marked the food ready; an agent who arrives early just has to wait,
// same as in real life. Outlet gets paid HERE, not at final delivery —
// their part of the job (cooking, handing it over) is done the moment
// the agent has it in hand, and what happens after that is out of their
// control. ----------
router.patch("/:id/picked-up", requireAuth, requireRole("agent"), async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM food_orders WHERE id = $1", [req.params.id]);
    const order = rows[0];
    if (!order) return res.status(404).json({ error: "Order not found" });
    if (order.agent_id !== req.user.id) return res.status(403).json({ error: "Not your job" });
    if (order.status !== "ready_for_pickup") {
      return res.status(409).json({ error: "This order isn't ready for pickup yet — check back shortly" });
    }

    await pool.query("UPDATE food_orders SET status = 'picked_up', picked_up_at = now() WHERE id = $1", [order.id]);

    const outletPayout = Number(order.subtotal) - Number(order.platform_commission);
    await pool.query(
      "UPDATE outlet_profiles SET wallet_balance = wallet_balance + $1, total_orders = total_orders + 1 WHERE user_id = $2",
      [outletPayout, order.outlet_id]
    );

    const { rows: updated } = await pool.query("SELECT * FROM food_orders WHERE id = $1", [order.id]);
    res.json(updated[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong updating this job" });
  }
});

// ---------- MARK DELIVERED — agent gets paid here, their job is now done. ----------
router.patch("/:id/delivered", requireAuth, requireRole("agent"), async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM food_orders WHERE id = $1", [req.params.id]);
    const order = rows[0];
    if (!order) return res.status(404).json({ error: "Order not found" });
    if (order.agent_id !== req.user.id) return res.status(403).json({ error: "Not your job" });
    if (order.status !== "picked_up") return res.status(409).json({ error: "This order hasn't been picked up yet" });

    await pool.query("UPDATE food_orders SET status = 'delivered', delivered_at = now() WHERE id = $1", [order.id]);
    await pool.query(
      "UPDATE agent_profiles SET wallet_balance = wallet_balance + $1, total_food_jobs = total_food_jobs + 1 WHERE user_id = $2",
      [order.delivery_fee * 0.8, req.user.id]
    );
    await checkReferralReward(req.user.id, "agent").catch(() => {});
    await checkReferralReward(order.customer_id, "customer").catch(() => {});

    const { rows: updated } = await pool.query("SELECT * FROM food_orders WHERE id = $1", [order.id]);
    res.json(updated[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong updating this job" });
  }
});

module.exports = router;
