const express = require("express");
const { pool } = require("../db");
const { getQuote } = require("../quote");
const { suggest } = require("../maps");

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

// ---------- ADDRESS AUTOCOMPLETE (hero pickup/drop-off fields — no login
// required). Each suggestion already carries its coordinates, so selecting
// one skips a redundant geocoding call when pricing the trip afterward. ----------
router.post("/autocomplete", async (req, res) => {
  const query = (req.body.query || "").trim();
  if (query.length < 3) return res.json({ suggestions: [] });
  if (!process.env.MAPBOX_ACCESS_TOKEN) return res.json({ suggestions: [] });

  try {
    const suggestions = await suggest(query);
    res.json({ suggestions });
  } catch (err) {
    console.error("Autocomplete failed:", err.message);
    res.json({ suggestions: [] }); // typing still works as free text either way
  }
});

// ---------- PRICE ESTIMATE (landing page — no login required). Accepts
// either city names (older/simple usage) or confirmed coordinates from an
// autocomplete selection (pickup_coords/dropoff_coords), which skip
// re-geocoding and are more accurate. ----------
router.post("/estimate", async (req, res) => {
  const { pickup_city, dropoff_city, preferred_vehicle, pickup_coords, dropoff_coords } = req.body;
  if (!pickup_city && !pickup_coords) {
    return res.status(400).json({ error: "pickup_city or pickup_coords is required" });
  }
  if (!dropoff_city && !dropoff_coords) {
    return res.status(400).json({ error: "dropoff_city or dropoff_coords is required" });
  }
  const quote = await getQuote({
    pickup_city: pickup_city || "Lagos", // only used by the flat fallback if distance calc also fails
    dropoff_city: dropoff_city || "Lagos",
    vehicle_type: preferred_vehicle || "any",
    pickup_coords: pickup_coords || null,
    dropoff_coords: dropoff_coords || null,
  });
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
