const express = require("express");
const { v4: uuidv4 } = require("uuid");
const { pool } = require("../db");
const { requireApiKey } = require("../apiKeyAuth");
const { getQuote } = require("../quote");
const { trackingCode } = require("../pricing");
const { notifyWebhook } = require("../notify");

const router = express.Router();
router.use(requireApiKey);

async function logEvent(deliveryId, status, note) {
  await pool.query(
    `INSERT INTO delivery_events (id, delivery_id, status, note) VALUES ($1, $2, $3, $4)`,
    [uuidv4(), deliveryId, status, note || null]
  );
}

// ---------- POST /v1/estimate — price a delivery before creating it ----------
router.post("/estimate", async (req, res) => {
  const { pickup_address, pickup_city, dropoff_address, dropoff_city, preferred_vehicle } = req.body;
  if (!pickup_city || !dropoff_city) {
    return res.status(400).json({ error: "pickup_city and dropoff_city are required" });
  }
  const quote = await getQuote({
    pickup_address, pickup_city, dropoff_address, dropoff_city,
    vehicle_type: preferred_vehicle || "any",
  });
  res.json({ price: quote.price, distance_km: quote.distanceKm, method: quote.method });
});

// ---------- POST /v1/deliveries — create a delivery, paid from wallet ----------
router.post("/deliveries", async (req, res) => {
  try {
    const {
      package_type, package_note,
      pickup_address, pickup_city, pickup_landmark,
      dropoff_address, dropoff_city, dropoff_landmark,
      recipient_name, recipient_phone, preferred_vehicle,
      order_reference, // optional: the merchant's own order ID, echoed back for their bookkeeping
    } = req.body;

    if (!package_type || !pickup_address || !pickup_city || !dropoff_address || !dropoff_city || !recipient_name || !recipient_phone) {
      return res.status(400).json({ error: "Missing required delivery details" });
    }

    const vehicle = preferred_vehicle && ["self", "bike", "cab", "any"].includes(preferred_vehicle) ? preferred_vehicle : "any";
    const quote = await getQuote({ pickup_address, pickup_city, dropoff_address, dropoff_city, vehicle_type: vehicle });

    const client = await pool.connect();
    let delivery;
    try {
      await client.query("BEGIN");
      const { rows: userRows } = await client.query("SELECT wallet_balance FROM users WHERE id = $1 FOR UPDATE", [req.merchant.id]);
      const balance = Number(userRows[0].wallet_balance);
      if (balance < quote.price) {
        await client.query("ROLLBACK");
        return res.status(402).json({
          error: `Insufficient wallet balance. This delivery costs ₦${quote.price.toLocaleString()}, you have ₦${balance.toLocaleString()}.`,
          price: quote.price,
          balance,
        });
      }

      const id = uuidv4();
      const code = trackingCode();

      await client.query(
        `INSERT INTO deliveries (
          id, customer_id, package_type, package_note,
          pickup_address, pickup_city, dropoff_address, dropoff_city,
          recipient_name, recipient_phone, preferred_vehicle, price, tracking_code, distance_km,
          pickup_lat, pickup_lng, dropoff_lat, dropoff_lng,
          pickup_landmark, dropoff_landmark,
          payment_status, payment_method
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,'paid','wallet')`,
        [id, req.merchant.id, package_type, package_note || (order_reference ? `Order ref: ${order_reference}` : null),
         pickup_address, pickup_city, dropoff_address, dropoff_city,
         recipient_name, recipient_phone, vehicle, quote.price, code, quote.distanceKm,
         quote.origin?.lat ?? null, quote.origin?.lng ?? null, quote.destination?.lat ?? null, quote.destination?.lng ?? null,
         pickup_landmark || null, dropoff_landmark || null]
      );

      const newBalance = balance - quote.price;
      await client.query("UPDATE users SET wallet_balance = $1 WHERE id = $2", [newBalance, req.merchant.id]);
      await client.query(
        `INSERT INTO wallet_transactions (id, user_id, type, amount, balance_after, status, delivery_id, note)
         VALUES ($1, $2, 'delivery_payment', $3, $4, 'success', $5, $6)`,
        [uuidv4(), req.merchant.id, -quote.price, newBalance, id, `Paid for delivery ${code} (API)`]
      );

      await client.query("COMMIT");

      const { rows } = await pool.query("SELECT * FROM deliveries WHERE id = $1", [id]);
      delivery = rows[0];
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      client.release();
    }

    logEvent(delivery.id, "pending", "Delivery created via public API, paid from wallet");
    logEvent(delivery.id, "payment_confirmed", "Paid instantly from wallet balance");
    notifyWebhook(delivery, "payment_confirmed"); // fire-and-forget

    res.status(201).json({
      tracking_code: delivery.tracking_code,
      status: delivery.status,
      price: delivery.price,
      distance_km: delivery.distance_km,
      order_reference: order_reference || null,
      tracking_url: `${(process.env.FRONTEND_URL || "").replace(/\/$/, "")}/track?code=${delivery.tracking_code}`,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong creating this delivery" });
  }
});

// ---------- GET /v1/deliveries/:tracking_code — check status of one of YOUR deliveries ----------
router.get("/deliveries/:tracking_code", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM deliveries WHERE tracking_code = $1", [req.params.tracking_code.toUpperCase()]);
    const delivery = rows[0];
    if (!delivery || delivery.customer_id !== req.merchant.id) {
      // Same error for "not found" and "not yours" — don't reveal that a
      // tracking code exists but belongs to someone else.
      return res.status(404).json({ error: "No delivery found with that tracking code" });
    }

    res.json({
      tracking_code: delivery.tracking_code,
      status: delivery.status,
      payment_status: delivery.payment_status,
      price: delivery.price,
      distance_km: delivery.distance_km,
      pickup_city: delivery.pickup_city,
      dropoff_city: delivery.dropoff_city,
      recipient_name: delivery.recipient_name,
      created_at: delivery.created_at,
      delivered_at: delivery.delivered_at,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong looking up this delivery" });
  }
});

module.exports = router;
