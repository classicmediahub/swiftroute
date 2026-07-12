const express = require("express");
const { pool } = require("../db");
const { getQuote } = require("../quote");

const router = express.Router();

// ---------- PLATFORM STATS (for the landing page trust bar) ----------
// Real numbers only — no invented stats. Early on these will be small or
// zero, and the frontend is built to handle that honestly rather than
// hide behind a fabricated "12,000+ deliveries" style claim.
router.get("/stats", async (req, res) => {
  try {
    const completedDeliveries = (await pool.query(
      "SELECT COUNT(*) c FROM deliveries WHERE status = 'delivered'"
    )).rows[0].c;
    const citiesCovered = (await pool.query(
      "SELECT COUNT(DISTINCT city) c FROM agent_profiles WHERE approval_status = 'approved'"
    )).rows[0].c;
    const activeAgents = (await pool.query(
      "SELECT COUNT(*) c FROM agent_profiles WHERE approval_status = 'approved'"
    )).rows[0].c;

    res.json({
      completedDeliveries: Number(completedDeliveries),
      citiesCovered: Number(citiesCovered),
      activeAgents: Number(activeAgents),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong loading stats" });
  }
});

// ---------- PRICE ESTIMATE (landing page calculator — no login required) ----------
router.post("/estimate", async (req, res) => {
  const { pickup_city, dropoff_city, preferred_vehicle } = req.body;
  if (!pickup_city || !dropoff_city) {
    return res.status(400).json({ error: "pickup_city and dropoff_city are required" });
  }
  const quote = await getQuote({ pickup_city, dropoff_city, vehicle_type: preferred_vehicle || "any" });
  res.json(quote);
});

// ---------- TRACK A DELIVERY BY CODE (no login required — the tracking
// code itself is the access key, the same model most courier sites use) ----------
router.get("/track/:code", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM deliveries WHERE tracking_code = $1", [req.params.code.toUpperCase()]);
    const delivery = rows[0];
    if (!delivery) return res.status(404).json({ error: "No delivery found with that tracking code" });

    const { rows: events } = await pool.query(
      "SELECT * FROM delivery_events WHERE delivery_id = $1 ORDER BY created_at ASC",
      [delivery.id]
    );

    // Strip anything an anonymous tracker shouldn't see — the customer's
    // account id and the recipient's phone number aren't needed to show
    // delivery progress.
    const { customer_id, recipient_phone, ...safeDelivery } = delivery;
    res.json({ delivery: safeDelivery, events });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong looking up this delivery" });
  }
});

// ---------- RECENT CUSTOMER REVIEWS (for the landing page — only real,
// commented reviews are shown; nothing fabricated) ----------
router.get("/reviews", async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT r.rating, r.comment, r.created_at, c.full_name AS customer_name
      FROM reviews r
      JOIN users c ON c.id = r.customer_id
      WHERE r.comment IS NOT NULL AND r.comment != ''
      ORDER BY r.created_at DESC
      LIMIT 6
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong loading reviews" });
  }
});

module.exports = router;
