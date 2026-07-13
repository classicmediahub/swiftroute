const express = require("express");
const { v4: uuidv4 } = require("uuid");
const { pool } = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");
const { trackingCode } = require("../pricing");
const { getQuote } = require("../quote");
const { initializeTransaction, verifyTransaction } = require("../paystack");
const { notifyCustomer, notifyBulkUpload } = require("../notify");

const router = express.Router();

async function logEvent(deliveryId, status, note) {
  await pool.query(
    `INSERT INTO delivery_events (id, delivery_id, status, note) VALUES ($1, $2, $3, $4)`,
    [uuidv4(), deliveryId, status, note || null]
  );
}

function paymentReference() {
  return `PAEPAY-${uuidv4().replace(/-/g, "").slice(0, 20).toUpperCase()}`;
}

function callbackUrl() {
  const base = process.env.FRONTEND_URL || "http://localhost:5173";
  return `${base.replace(/\/$/, "")}/payment/callback`;
}

// ---------- PRICE ESTIMATE ----------
router.post("/estimate", requireAuth, async (req, res) => {
  const { pickup_city, dropoff_city, pickup_address, dropoff_address, preferred_vehicle } = req.body;
  if (!pickup_city || !dropoff_city) {
    return res.status(400).json({ error: "pickup_city and dropoff_city are required" });
  }
  const quote = await getQuote({ pickup_address, pickup_city, dropoff_address, dropoff_city, vehicle_type: preferred_vehicle || "any" });
  res.json(quote);
});

// ---------- CREATE DELIVERY (customer) — creates the delivery as unpaid,
// then starts a Paystack transaction and hands back the checkout URL.
// The delivery only becomes visible to agents once payment is confirmed. ----------
router.post("/", requireAuth, requireRole("customer"), async (req, res) => {
  try {
    const {
      package_type, package_note,
      pickup_address, pickup_city,
      dropoff_address, dropoff_city,
      recipient_name, recipient_phone,
      preferred_vehicle, payment_method
    } = req.body;

    if (!package_type || !pickup_address || !pickup_city || !dropoff_address || !dropoff_city || !recipient_name || !recipient_phone) {
      return res.status(400).json({ error: "Missing required delivery details" });
    }

    const vehicle = preferred_vehicle && ["self", "bike", "cab", "any"].includes(preferred_vehicle) ? preferred_vehicle : "any";
    const quote = await getQuote({ pickup_address, pickup_city, dropoff_address, dropoff_city, vehicle_type: vehicle });
    const price = quote.price;
    const id = uuidv4();
    const code = trackingCode();

    const commonFields = [
      id, req.user.id, package_type, package_note || null,
      pickup_address, pickup_city, dropoff_address, dropoff_city,
      recipient_name, recipient_phone, vehicle, price, code, quote.distanceKm,
      quote.origin?.lat ?? null, quote.origin?.lng ?? null, quote.destination?.lat ?? null, quote.destination?.lng ?? null,
    ];

    if (payment_method === "wallet") {
      // Pay instantly from wallet balance — no redirect, no Paystack call.
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const { rows: userRows } = await client.query("SELECT wallet_balance FROM users WHERE id = $1 FOR UPDATE", [req.user.id]);
        const balance = Number(userRows[0].wallet_balance);
        if (balance < price) {
          await client.query("ROLLBACK");
          return res.status(402).json({ error: `Insufficient wallet balance. You have ₦${balance.toLocaleString()}, this delivery costs ₦${price.toLocaleString()}.` });
        }

        await client.query(
          `INSERT INTO deliveries (
            id, customer_id, package_type, package_note,
            pickup_address, pickup_city, dropoff_address, dropoff_city,
            recipient_name, recipient_phone, preferred_vehicle, price, tracking_code, distance_km,
            pickup_lat, pickup_lng, dropoff_lat, dropoff_lng,
            payment_status, payment_method
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,'paid','wallet')`,
          commonFields
        );

        const newBalance = balance - price;
        await client.query("UPDATE users SET wallet_balance = $1 WHERE id = $2", [newBalance, req.user.id]);
        await client.query(
          `INSERT INTO wallet_transactions (id, user_id, type, amount, balance_after, status, delivery_id, note)
           VALUES ($1, $2, 'delivery_payment', $3, $4, 'success', $5, $6)`,
          [uuidv4(), req.user.id, -price, newBalance, id, `Paid for delivery ${code}`]
        );
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        throw err;
      } finally {
        client.release();
      }

      await logEvent(id, "pending", "Delivery request created and paid from wallet");
      await logEvent(id, "payment_confirmed", "Paid instantly from wallet balance");
      const { rows } = await pool.query("SELECT * FROM deliveries WHERE id = $1", [id]);
      notifyCustomer(rows[0], "payment_confirmed"); // fire-and-forget
      return res.status(201).json({ delivery: rows[0], authorization_url: null });
    }

    // Default: pay via Paystack checkout.
    const reference = paymentReference();
    await pool.query(
      `INSERT INTO deliveries (
        id, customer_id, package_type, package_note,
        pickup_address, pickup_city, dropoff_address, dropoff_city,
        recipient_name, recipient_phone, preferred_vehicle, price, tracking_code, distance_km,
        pickup_lat, pickup_lng, dropoff_lat, dropoff_lng,
        payment_status, paystack_reference, payment_method
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,'unpaid',$19,'paystack')`,
      [...commonFields, reference]
    );

    await logEvent(id, "pending", "Delivery request created — awaiting payment");

    let authorization_url;
    try {
      const paystackData = await initializeTransaction({
        email: req.user.email,
        amountNaira: price,
        reference,
        callback_url: callbackUrl(),
        metadata: { delivery_id: id, tracking_code: code },
      });
      authorization_url = paystackData.authorization_url;
    } catch (err) {
      console.error("Paystack initialize failed:", err.message);
      // The delivery row exists but is unpaid — the customer can retry
      // payment from their dashboard via /retry-payment below.
      const { rows } = await pool.query("SELECT * FROM deliveries WHERE id = $1", [id]);
      return res.status(502).json({
        error: "We couldn't start payment right now. Your delivery was saved — try paying again from your dashboard.",
        delivery: rows[0],
      });
    }

    const { rows } = await pool.query("SELECT * FROM deliveries WHERE id = $1", [id]);
    res.status(201).json({ delivery: rows[0], authorization_url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong creating the delivery" });
  }
});

// ---------- BULK UPLOAD (customer, business accounts) — creates many
// deliveries at once, paid entirely from wallet balance. Wallet-only
// because there's no sane way to send someone through N separate Paystack
// checkouts for N deliveries in one upload. ----------
const MAX_BULK_ROWS = 100;

router.post("/bulk", requireAuth, requireRole("customer"), async (req, res) => {
  try {
    const rowsIn = Array.isArray(req.body.deliveries) ? req.body.deliveries : null;
    if (!rowsIn || rowsIn.length === 0) {
      return res.status(400).json({ error: "No deliveries provided" });
    }
    if (rowsIn.length > MAX_BULK_ROWS) {
      return res.status(400).json({ error: `A single upload can't exceed ${MAX_BULK_ROWS} deliveries — split it into smaller batches.` });
    }

    // Validate every row up front so we don't quote/charge for a batch
    // that's going to partially fail. Report every problem at once rather
    // than one at a time.
    const required = ["package_type", "pickup_address", "pickup_city", "dropoff_address", "dropoff_city", "recipient_name", "recipient_phone"];
    const rowErrors = [];
    rowsIn.forEach((row, i) => {
      const missing = required.filter((f) => !row[f] || !String(row[f]).trim());
      if (missing.length) rowErrors.push({ row: i + 1, error: `Missing: ${missing.join(", ")}` });
    });
    if (rowErrors.length) {
      return res.status(400).json({ error: "Some rows are missing required fields", rowErrors });
    }

    // Quote every row concurrently — this can involve real geocoding calls,
    // so it's done before opening a database transaction to avoid holding
    // a lock while waiting on an external API.
    const quotes = await Promise.all(
      rowsIn.map((row) => {
        const vehicle = row.preferred_vehicle && ["self", "bike", "cab", "any"].includes(row.preferred_vehicle) ? row.preferred_vehicle : "any";
        return getQuote({
          pickup_address: row.pickup_address, pickup_city: row.pickup_city,
          dropoff_address: row.dropoff_address, dropoff_city: row.dropoff_city,
          vehicle_type: vehicle,
        });
      })
    );

    const totalPrice = quotes.reduce((sum, q) => sum + q.price, 0);

    const client = await pool.connect();
    let created = [];
    try {
      await client.query("BEGIN");
      const { rows: userRows } = await client.query("SELECT wallet_balance FROM users WHERE id = $1 FOR UPDATE", [req.user.id]);
      const balance = Number(userRows[0].wallet_balance);
      if (balance < totalPrice) {
        await client.query("ROLLBACK");
        return res.status(402).json({
          error: `Insufficient wallet balance. This batch of ${rowsIn.length} deliveries costs ₦${totalPrice.toLocaleString()}, you have ₦${balance.toLocaleString()}.`,
          totalPrice,
          balance,
        });
      }

      let runningBalance = balance;
      for (let i = 0; i < rowsIn.length; i++) {
        const row = rowsIn[i];
        const quote = quotes[i];
        const vehicle = row.preferred_vehicle && ["self", "bike", "cab", "any"].includes(row.preferred_vehicle) ? row.preferred_vehicle : "any";
        const id = uuidv4();
        const code = trackingCode();

        await client.query(
          `INSERT INTO deliveries (
            id, customer_id, package_type, package_note,
            pickup_address, pickup_city, dropoff_address, dropoff_city,
            recipient_name, recipient_phone, preferred_vehicle, price, tracking_code, distance_km,
            pickup_lat, pickup_lng, dropoff_lat, dropoff_lng,
            payment_status, payment_method
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,'paid','wallet')`,
          [id, req.user.id, row.package_type, row.package_note || null,
           row.pickup_address, row.pickup_city, row.dropoff_address, row.dropoff_city,
           row.recipient_name, row.recipient_phone, vehicle, quote.price, code, quote.distanceKm,
           quote.origin?.lat ?? null, quote.origin?.lng ?? null, quote.destination?.lat ?? null, quote.destination?.lng ?? null]
        );

        runningBalance -= quote.price;
        await client.query(
          `INSERT INTO wallet_transactions (id, user_id, type, amount, balance_after, status, delivery_id, note)
           VALUES ($1, $2, 'delivery_payment', $3, $4, 'success', $5, $6)`,
          [uuidv4(), req.user.id, -quote.price, runningBalance, id, `Paid for delivery ${code} (bulk upload)`]
        );

        created.push({ id, tracking_code: code, price: quote.price });
      }

      await client.query("UPDATE users SET wallet_balance = $1 WHERE id = $2", [runningBalance, req.user.id]);
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      client.release();
    }

    // Log events for each delivery, but send ONE notification for the whole
    // batch rather than spamming N separate emails/SMS for a 50-row upload.
    for (const d of created) {
      logEvent(d.id, "pending", "Delivery created via bulk upload, paid from wallet");
      logEvent(d.id, "payment_confirmed", "Paid instantly from wallet balance");
    }
    notifyBulkUpload(req.user, created.length, totalPrice); // fire-and-forget

    res.status(201).json({ created, totalCharged: totalPrice, count: created.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong processing this batch" });
  }
});

// ---------- RETRY PAYMENT (customer) — for deliveries stuck unpaid/failed,
// e.g. the customer closed the Paystack tab before finishing. ----------
router.post("/:id/retry-payment", requireAuth, requireRole("customer"), async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM deliveries WHERE id = $1", [req.params.id]);
    const delivery = rows[0];
    if (!delivery) return res.status(404).json({ error: "Delivery not found" });
    if (delivery.customer_id !== req.user.id) return res.status(403).json({ error: "Not your delivery" });
    if (delivery.payment_status === "paid") return res.status(409).json({ error: "This delivery is already paid for" });

    const reference = paymentReference();
    await pool.query("UPDATE deliveries SET paystack_reference = $1, payment_status = 'unpaid' WHERE id = $2", [reference, delivery.id]);

    const paystackData = await initializeTransaction({
      email: req.user.email,
      amountNaira: delivery.price,
      reference,
      callback_url: callbackUrl(),
      metadata: { delivery_id: delivery.id, tracking_code: delivery.tracking_code },
    });

    res.json({ authorization_url: paystackData.authorization_url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not restart payment. Please try again." });
  }
});

// ---------- VERIFY PAYMENT (customer) — called by the frontend when
// Paystack redirects back after checkout. Always re-checks with Paystack's
// API using our secret key rather than trusting the URL parameters. ----------
router.get("/verify/:reference", requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM deliveries WHERE paystack_reference = $1", [req.params.reference]);
    const delivery = rows[0];
    if (!delivery) return res.status(404).json({ error: "No delivery found for this payment reference" });
    if (delivery.customer_id !== req.user.id) return res.status(403).json({ error: "Not your delivery" });

    if (delivery.payment_status === "paid") {
      return res.json({ delivery, payment_status: "paid" });
    }

    const txn = await verifyTransaction(req.params.reference);
    if (txn.status === "success") {
      await pool.query("UPDATE deliveries SET payment_status = 'paid' WHERE id = $1", [delivery.id]);
      await logEvent(delivery.id, "payment_confirmed", "Payment verified via Paystack");
      notifyCustomer(delivery, "payment_confirmed"); // fire-and-forget
    } else {
      await pool.query("UPDATE deliveries SET payment_status = 'failed' WHERE id = $1", [delivery.id]);
    }

    const { rows: updated } = await pool.query("SELECT * FROM deliveries WHERE id = $1", [delivery.id]);
    res.json({ delivery: updated[0], payment_status: updated[0].payment_status });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong verifying payment" });
  }
});

// ---------- UPDATE LIVE LOCATION (agent, own delivery, active states only) ----------
const ACTIVE_STATUSES = ["accepted", "picked_up", "in_transit"];

router.patch("/:id/location", requireAuth, requireRole("agent"), async (req, res) => {
  try {
    const lat = Number(req.body.lat);
    const lng = Number(req.body.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return res.status(400).json({ error: "Invalid coordinates" });
    }

    const { rows } = await pool.query("SELECT * FROM deliveries WHERE id = $1", [req.params.id]);
    const delivery = rows[0];
    if (!delivery) return res.status(404).json({ error: "Delivery not found" });
    if (delivery.agent_id !== req.user.id) return res.status(403).json({ error: "Not your delivery" });
    if (!ACTIVE_STATUSES.includes(delivery.status)) {
      return res.status(409).json({ error: "Location can only be shared on an active delivery" });
    }

    await pool.query(
      "UPDATE deliveries SET current_lat = $1, current_lng = $2, location_updated_at = now() WHERE id = $3",
      [lat, lng, delivery.id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong updating location" });
  }
});

// ---------- LIST MY DELIVERIES (customer) ----------
router.get("/mine", requireAuth, requireRole("customer"), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT d.*, u.full_name AS agent_name, u.phone AS agent_phone,
              r.rating AS review_rating, r.comment AS review_comment
       FROM deliveries d
       LEFT JOIN users u ON u.id = d.agent_id
       LEFT JOIN reviews r ON r.delivery_id = d.id
       WHERE d.customer_id = $1 ORDER BY d.created_at DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong loading your deliveries" });
  }
});

// ---------- LEAVE A REVIEW (customer, delivered deliveries only, one per delivery) ----------
router.post("/:id/review", requireAuth, requireRole("customer"), async (req, res) => {
  try {
    const ratingNum = Number(req.body.rating);
    if (!Number.isInteger(ratingNum) || ratingNum < 1 || ratingNum > 5) {
      return res.status(400).json({ error: "Rating must be a whole number from 1 to 5" });
    }
    const comment = (req.body.comment || "").trim().slice(0, 500) || null;

    const { rows } = await pool.query("SELECT * FROM deliveries WHERE id = $1", [req.params.id]);
    const delivery = rows[0];
    if (!delivery) return res.status(404).json({ error: "Delivery not found" });
    if (delivery.customer_id !== req.user.id) return res.status(403).json({ error: "Not your delivery" });
    if (delivery.status !== "delivered") {
      return res.status(409).json({ error: "You can only review a delivery after it's been delivered" });
    }
    if (!delivery.agent_id) return res.status(409).json({ error: "This delivery has no agent to review" });

    const existing = await pool.query("SELECT id FROM reviews WHERE delivery_id = $1", [delivery.id]);
    if (existing.rows.length) return res.status(409).json({ error: "You've already reviewed this delivery" });

    const id = uuidv4();
    await pool.query(
      `INSERT INTO reviews (id, delivery_id, customer_id, agent_id, rating, comment) VALUES ($1,$2,$3,$4,$5,$6)`,
      [id, delivery.id, req.user.id, delivery.agent_id, ratingNum, comment]
    );

    // Recompute the agent's overall rating from all their reviews.
    await pool.query(
      `UPDATE agent_profiles SET rating = (SELECT ROUND(AVG(rating)::numeric, 2) FROM reviews WHERE agent_id = $1) WHERE user_id = $1`,
      [delivery.agent_id]
    );

    res.status(201).json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong submitting your review" });
  }
});

// ---------- AVAILABLE DELIVERIES FOR AGENTS — paid only ----------
router.get("/available", requireAuth, requireRole("agent"), async (req, res) => {
  try {
    const { rows: profileRows } = await pool.query("SELECT * FROM agent_profiles WHERE user_id = $1", [req.user.id]);
    const profile = profileRows[0];
    if (!profile) return res.status(400).json({ error: "Agent profile not found" });
    if (profile.approval_status !== "approved") {
      return res.status(403).json({ error: "Your agent account is pending admin approval" });
    }

    const { rows } = await pool.query(
      `SELECT d.*, u.full_name AS customer_name, u.phone AS customer_phone
       FROM deliveries d JOIN users u ON u.id = d.customer_id
       WHERE d.status = 'pending'
         AND d.payment_status = 'paid'
         AND (d.preferred_vehicle = 'any' OR d.preferred_vehicle = $1)
       ORDER BY d.created_at ASC`,
      [profile.vehicle_type]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong loading available deliveries" });
  }
});

// ---------- MY ASSIGNED DELIVERIES (agent) ----------
router.get("/assigned", requireAuth, requireRole("agent"), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT d.*, u.full_name AS customer_name, u.phone AS customer_phone
       FROM deliveries d JOIN users u ON u.id = d.customer_id
       WHERE d.agent_id = $1 ORDER BY d.created_at DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong loading your deliveries" });
  }
});

// ---------- ACCEPT DELIVERY (agent) ----------
router.post("/:id/accept", requireAuth, requireRole("agent"), async (req, res) => {
  const client = await pool.connect();
  try {
    const { rows: profileRows } = await client.query("SELECT * FROM agent_profiles WHERE user_id = $1", [req.user.id]);
    const profile = profileRows[0];
    if (!profile || profile.approval_status !== "approved") {
      return res.status(403).json({ error: "Your agent account is pending admin approval" });
    }

    await client.query("BEGIN");
    // Lock the row so two agents can't accept the same job at once.
    const { rows: deliveryRows } = await client.query("SELECT * FROM deliveries WHERE id = $1 FOR UPDATE", [req.params.id]);
    const delivery = deliveryRows[0];
    if (!delivery) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Delivery not found" });
    }
    if (delivery.payment_status !== "paid") {
      await client.query("ROLLBACK");
      return res.status(402).json({ error: "This delivery hasn't been paid for yet" });
    }
    if (delivery.status !== "pending") {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "This delivery has already been accepted by another agent" });
    }

    await client.query(
      `UPDATE deliveries SET status = 'accepted', agent_id = $1, accepted_at = now() WHERE id = $2`,
      [req.user.id, delivery.id]
    );
    await client.query("COMMIT");

    await logEvent(delivery.id, "accepted", `Accepted by agent ${req.user.full_name}`);

    const { rows: updatedRows } = await pool.query("SELECT * FROM deliveries WHERE id = $1", [delivery.id]);
    notifyCustomer(updatedRows[0], "accepted"); // fire-and-forget
    res.json(updatedRows[0]);
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(err);
    res.status(500).json({ error: "Something went wrong accepting this delivery" });
  } finally {
    client.release();
  }
});

// ---------- UPDATE STATUS (agent, own delivery only) ----------
const NEXT_STATUS = {
  accepted: "picked_up",
  picked_up: "in_transit",
  in_transit: "delivered",
};

router.patch("/:id/advance", requireAuth, requireRole("agent"), async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM deliveries WHERE id = $1", [req.params.id]);
    const delivery = rows[0];
    if (!delivery) return res.status(404).json({ error: "Delivery not found" });
    if (delivery.agent_id !== req.user.id) return res.status(403).json({ error: "Not your delivery" });

    const next = NEXT_STATUS[delivery.status];
    if (!next) return res.status(409).json({ error: `Cannot advance a delivery from status '${delivery.status}'` });

    const timestampCol = next === "picked_up" ? "picked_up_at" : next === "delivered" ? "delivered_at" : null;
    if (timestampCol) {
      await pool.query(`UPDATE deliveries SET status = $1, ${timestampCol} = now() WHERE id = $2`, [next, delivery.id]);
    } else {
      await pool.query(`UPDATE deliveries SET status = $1 WHERE id = $2`, [next, delivery.id]);
    }

    if (next === "delivered") {
      await pool.query(
        `UPDATE agent_profiles SET total_deliveries = total_deliveries + 1, wallet_balance = wallet_balance + $1 WHERE user_id = $2`,
        [delivery.price * 0.8, req.user.id]
      );
    }

    await logEvent(delivery.id, next);
    const { rows: updatedRows } = await pool.query("SELECT * FROM deliveries WHERE id = $1", [delivery.id]);
    notifyCustomer(updatedRows[0], next); // fire-and-forget
    res.json(updatedRows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong updating this delivery" });
  }
});

// ---------- CANCEL (customer, only if still pending/accepted) ----------
router.patch("/:id/cancel", requireAuth, requireRole("customer"), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query("SELECT * FROM deliveries WHERE id = $1 FOR UPDATE", [req.params.id]);
    const delivery = rows[0];
    if (!delivery) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Delivery not found" });
    }
    if (delivery.customer_id !== req.user.id) {
      await client.query("ROLLBACK");
      return res.status(403).json({ error: "Not your delivery" });
    }
    if (!["pending", "accepted"].includes(delivery.status)) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "This delivery can no longer be cancelled" });
    }

    await client.query(`UPDATE deliveries SET status = 'cancelled', cancelled_at = now() WHERE id = $1`, [delivery.id]);

    // Wallet-paid deliveries can be refunded instantly since it's just an
    // internal balance adjustment. Paystack-paid deliveries aren't
    // auto-refunded here — that needs a real refund through Paystack,
    // which is a manual step for now (see README).
    if (delivery.payment_method === "wallet" && delivery.payment_status === "paid") {
      const { rows: userRows } = await client.query("SELECT wallet_balance FROM users WHERE id = $1 FOR UPDATE", [delivery.customer_id]);
      const newBalance = Number(userRows[0].wallet_balance) + Number(delivery.price);
      await client.query("UPDATE users SET wallet_balance = $1 WHERE id = $2", [newBalance, delivery.customer_id]);
      await client.query(
        `INSERT INTO wallet_transactions (id, user_id, type, amount, balance_after, status, delivery_id, note)
         VALUES ($1, $2, 'refund', $3, $4, 'success', $5, $6)`,
        [uuidv4(), delivery.customer_id, delivery.price, newBalance, delivery.id, `Refund for cancelled delivery ${delivery.tracking_code}`]
      );
    }

    await client.query("COMMIT");

    await logEvent(delivery.id, "cancelled", "Cancelled by customer");
    const { rows: updatedRows } = await pool.query("SELECT * FROM deliveries WHERE id = $1", [delivery.id]);
    notifyCustomer(updatedRows[0], "cancelled"); // fire-and-forget
    res.json(updatedRows[0]);
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(err);
    res.status(500).json({ error: "Something went wrong cancelling this delivery" });
  } finally {
    client.release();
  }
});

// ---------- TRACK BY CODE ----------
router.get("/track/:code", requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM deliveries WHERE tracking_code = $1", [req.params.code.toUpperCase()]);
    const delivery = rows[0];
    if (!delivery) return res.status(404).json({ error: "No delivery found with that tracking code" });
    const { rows: events } = await pool.query(
      "SELECT * FROM delivery_events WHERE delivery_id = $1 ORDER BY created_at ASC",
      [delivery.id]
    );
    res.json({ delivery, events });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong looking up this delivery" });
  }
});

module.exports = router;
