const express = require("express");
const { v4: uuidv4 } = require("uuid");
const { pool } = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");
const { priceForGasOrder, STANDARD_CYLINDER_SIZES_KG } = require("../gas-pricing");
const { initializeTransaction, verifyTransaction } = require("../paystack");
const { trackingCode } = require("../pricing");
const { checkReferralReward } = require("../referrals");
const { recordStreakActivity } = require("../streaks");

const router = express.Router();

const STATUS_ORDER = ["accepted", "en_route", "filling", "completed"];

function paymentReference() {
  // Distinct prefix from deliveries' "PAEPAY-", wallet's "PAEWALLET-", and
  // rides' "PAERIDE-" — routes/webhooks.js uses this prefix to tell a gas
  // payment apart from the others when Paystack's webhook fires.
  return `PAEGAS-${uuidv4().replace(/-/g, "").slice(0, 20).toUpperCase()}`;
}

function callbackUrl() {
  const base = process.env.FRONTEND_URL || "http://localhost:5173";
  return `${base.replace(/\/$/, "")}/gas/payment/callback`;
}

// Confirms the requesting agent actually registered specifically as a gas
// agent and is approved — handling LPG isn't the same equipment/skill as
// a delivery bike or passenger cab, so this is checked on every agent
// route below rather than just relying on requireRole("agent").
async function requireApprovedGasAgent(req, res) {
  const { rows } = await pool.query("SELECT vehicle_type, approval_status FROM agent_profiles WHERE user_id = $1", [req.user.id]);
  const profile = rows[0];
  if (!profile || profile.vehicle_type !== "gas") {
    res.status(403).json({ error: "Only agents registered as gas agents can access this" });
    return null;
  }
  if (profile.approval_status !== "approved") {
    res.status(403).json({ error: "Your gas agent account is not yet approved" });
    return null;
  }
  return profile;
}

// ---------- ESTIMATE (customer) ----------
router.post("/estimate", requireAuth, async (req, res) => {
  try {
    const quote = priceForGasOrder(req.body.cylinder_size_kg);
    res.json(quote);
  } catch (err) {
    res.status(400).json({ error: "Enter a valid cylinder size" });
  }
});

router.get("/cylinder-sizes", requireAuth, (req, res) => {
  res.json({ sizes_kg: STANDARD_CYLINDER_SIZES_KG });
});

// ---------- CREATE + PAY (customer) — combined in one call, same as
// deliveries: gas pricing is fully determined upfront (kg × rate + a flat
// callout fee), so unlike a ride there's no reason to defer payment to
// after the job. ----------
router.post("/", requireAuth, requireRole("customer"), async (req, res) => {
  try {
    const { address, address_lat, address_lng, landmark, contact_phone, cylinder_size_kg, note, payment_method } = req.body;
    if (!address || !contact_phone) {
      return res.status(400).json({ error: "Address and a contact phone number are required" });
    }
    if (payment_method !== "wallet" && payment_method !== "paystack") {
      return res.status(400).json({ error: "Choose a payment method" });
    }

    let quote;
    try {
      quote = priceForGasOrder(cylinder_size_kg);
    } catch {
      return res.status(400).json({ error: "Enter a valid cylinder size" });
    }

    const id = uuidv4();
    const code = trackingCode();

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
          `INSERT INTO gas_orders (
            id, customer_id, address, address_lat, address_lng, landmark, contact_phone,
            cylinder_size_kg, price_per_kg, price, note, tracking_code, payment_status, payment_method
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'paid','wallet')`,
          [id, req.user.id, address, address_lat ?? null, address_lng ?? null, landmark ?? null, contact_phone,
           quote.cylinderSizeKg, quote.pricePerKg, quote.price, note ?? null, code]
        );

        const newBalance = balance - quote.price;
        await client.query("UPDATE users SET wallet_balance = $1 WHERE id = $2", [newBalance, req.user.id]);
        await client.query(
          `INSERT INTO wallet_transactions (id, user_id, type, amount, balance_after, status, note)
           VALUES ($1,$2,'gas_payment',$3,$4,'success',$5)`,
          [uuidv4(), req.user.id, -quote.price, newBalance, `Gas order ${code}`]
        );
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        throw err;
      } finally {
        client.release();
      }

      await recordStreakActivity(req.user.id).catch(() => {});
      const { rows } = await pool.query("SELECT * FROM gas_orders WHERE id = $1", [id]);
      return res.status(201).json({ order: rows[0], authorization_url: null });
    }

    // paystack
    const reference = paymentReference();
    await pool.query(
      `INSERT INTO gas_orders (
        id, customer_id, address, address_lat, address_lng, landmark, contact_phone,
        cylinder_size_kg, price_per_kg, price, note, tracking_code, payment_status, payment_method, paystack_reference
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'unpaid','paystack',$13)`,
      [id, req.user.id, address, address_lat ?? null, address_lng ?? null, landmark ?? null, contact_phone,
       quote.cylinderSizeKg, quote.pricePerKg, quote.price, note ?? null, code, reference]
    );

    const paystackData = await initializeTransaction({
      email: req.user.email,
      amountNaira: quote.price,
      reference,
      callback_url: callbackUrl(),
      metadata: { type: "gas_order", order_id: id },
    });

    res.status(201).json({ order_id: id, authorization_url: paystackData.authorization_url });
  } catch (err) {
    console.error("Gas order creation failed:", err.message);
    res.status(500).json({ error: "Something went wrong placing your gas order" });
  }
});

// ---------- VERIFY A PAYSTACK PAYMENT (customer) ----------
router.get("/verify/:reference", requireAuth, requireRole("customer"), async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM gas_orders WHERE paystack_reference = $1", [req.params.reference]);
    const order = rows[0];
    if (!order) return res.status(404).json({ error: "No gas order found for this reference" });
    if (order.customer_id !== req.user.id) return res.status(403).json({ error: "Not your order" });

    if (order.payment_status === "paid") return res.json({ status: "paid", order });
    if (order.payment_status === "failed") return res.json({ status: "failed" });

    const paystackTxn = await verifyTransaction(req.params.reference);
    if (paystackTxn.status === "success") {
      await pool.query("UPDATE gas_orders SET payment_status = 'paid' WHERE id = $1", [order.id]);
      await recordStreakActivity(req.user.id).catch(() => {});
      const { rows: updated } = await pool.query("SELECT * FROM gas_orders WHERE id = $1", [order.id]);
      return res.json({ status: "paid", order: updated[0] });
    }
    await pool.query("UPDATE gas_orders SET payment_status = 'failed' WHERE id = $1", [order.id]);
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
      `SELECT g.*, u.full_name AS agent_name, u.phone AS agent_phone
       FROM gas_orders g LEFT JOIN users u ON u.id = g.agent_id
       WHERE g.customer_id = $1 ORDER BY g.created_at DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong loading your gas orders" });
  }
});

// ---------- CANCEL (customer) — only before an agent starts en route,
// and only auto-refunds wallet payments; a Paystack payment isn't
// reversed automatically (same conservative behavior as elsewhere in
// this codebase — a card refund isn't something to fire off silently). ----------
router.patch("/:id/cancel", requireAuth, requireRole("customer"), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query("SELECT * FROM gas_orders WHERE id = $1 FOR UPDATE", [req.params.id]);
    const order = rows[0];
    if (!order) { await client.query("ROLLBACK"); return res.status(404).json({ error: "Order not found" }); }
    if (order.customer_id !== req.user.id) { await client.query("ROLLBACK"); return res.status(403).json({ error: "Not your order" }); }
    if (!["pending", "accepted"].includes(order.status)) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "This order can no longer be cancelled — the agent is already on the way" });
    }

    await client.query("UPDATE gas_orders SET status = 'cancelled', cancelled_at = now() WHERE id = $1", [order.id]);

    if (order.payment_status === "paid" && order.payment_method === "wallet") {
      const { rows: userRows } = await client.query("UPDATE users SET wallet_balance = wallet_balance + $1 WHERE id = $2 RETURNING wallet_balance", [order.price, req.user.id]);
      await client.query(
        `INSERT INTO wallet_transactions (id, user_id, type, amount, balance_after, status, note)
         VALUES ($1,$2,'refund',$3,$4,'success',$5)`,
        [uuidv4(), req.user.id, order.price, userRows[0].wallet_balance, `Refund — gas order ${order.tracking_code} cancelled`]
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

// ================= AGENT (gas-registered only) =================

router.get("/available", requireAuth, requireRole("agent"), async (req, res) => {
  const profile = await requireApprovedGasAgent(req, res);
  if (!profile) return;
  try {
    const { rows } = await pool.query(
      `SELECT * FROM gas_orders WHERE status = 'pending' AND payment_status = 'paid' AND agent_id IS NULL ORDER BY created_at ASC`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong loading available orders" });
  }
});

router.get("/assigned", requireAuth, requireRole("agent"), async (req, res) => {
  const profile = await requireApprovedGasAgent(req, res);
  if (!profile) return;
  try {
    const { rows } = await pool.query(
      `SELECT g.*, u.full_name AS customer_name, u.phone AS customer_phone
       FROM gas_orders g JOIN users u ON u.id = g.customer_id
       WHERE g.agent_id = $1 ORDER BY g.created_at DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong loading your jobs" });
  }
});

router.post("/:id/accept", requireAuth, requireRole("agent"), async (req, res) => {
  const profile = await requireApprovedGasAgent(req, res);
  if (!profile) return;
  try {
    const { rows } = await pool.query(
      `UPDATE gas_orders SET agent_id = $1, status = 'accepted', accepted_at = now()
       WHERE id = $2 AND status = 'pending' AND payment_status = 'paid' AND agent_id IS NULL
       RETURNING *`,
      [req.user.id, req.params.id]
    );
    if (!rows[0]) return res.status(409).json({ error: "This order was just taken by another agent, or is no longer available" });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong accepting this order" });
  }
});

// An agent backing out after accepting but before starting the job —
// reopens it for other gas agents rather than leaving the customer stuck
// with an agent who never showed up.
router.patch("/:id/agent-cancel", requireAuth, requireRole("agent"), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `UPDATE gas_orders SET agent_id = NULL, status = 'pending', accepted_at = NULL
       WHERE id = $1 AND agent_id = $2 AND status = 'accepted' RETURNING *`,
      [req.params.id, req.user.id]
    );
    if (!rows[0]) return res.status(409).json({ error: "Can't back out of this job at this stage" });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong" });
  }
});

// ---------- ADVANCE STATUS (agent) — accepted → en_route → filling →
// completed. Proof photo is optional but, if sent on the final step,
// stored the same way deliveries store proof-of-delivery. ----------
router.patch("/:id/advance", requireAuth, requireRole("agent"), async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM gas_orders WHERE id = $1", [req.params.id]);
    const order = rows[0];
    if (!order) return res.status(404).json({ error: "Order not found" });
    if (order.agent_id !== req.user.id) return res.status(403).json({ error: "Not your job" });

    const currentIndex = STATUS_ORDER.indexOf(order.status);
    if (currentIndex === -1 || currentIndex === STATUS_ORDER.length - 1) {
      return res.status(409).json({ error: "This job can't be advanced any further" });
    }
    const nextStatus = STATUS_ORDER[currentIndex + 1];
    const { proof_photo } = req.body;

    if (nextStatus === "completed") {
      await pool.query(
        "UPDATE gas_orders SET status = 'completed', completed_at = now(), proof_photo = COALESCE($1, proof_photo) WHERE id = $2",
        [proof_photo ?? null, order.id]
      );
      await pool.query(
        `UPDATE agent_profiles SET wallet_balance = wallet_balance + $1, total_gas_jobs = total_gas_jobs + 1 WHERE user_id = $2`,
        [order.price * 0.8, req.user.id]
      );
      await checkReferralReward(req.user.id, "agent").catch(() => {});
      await checkReferralReward(order.customer_id, "customer").catch(() => {});
    } else {
      await pool.query("UPDATE gas_orders SET status = $1 WHERE id = $2", [nextStatus, order.id]);
    }

    const { rows: updated } = await pool.query("SELECT * FROM gas_orders WHERE id = $1", [order.id]);
    res.json(updated[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong updating this job" });
  }
});

module.exports = router;
