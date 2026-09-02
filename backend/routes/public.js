const express = require("express");
const { pool } = require("../db");
const { getQuote, getRideQuote } = require("../quote");
const { getGasQuote } = require("../gas-quote");
const { suggest } = require("../maps");

const router = express.Router();

// Must match routes/agent.js's STALE_AFTER_SECONDS — an agent whose last
// location ping is older than this is treated as offline even if
// is_online is still 1 in the DB (covers the tab-closed-without-cleanup case).
const STALE_AFTER_SECONDS = 30;

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

// ---------- RIDE PRICE ESTIMATE (landing page — no login required). Same
// public-preview role as /estimate above, but for passenger rides. Coords
// are required (not optional the way delivery's city-name fallback is) —
// the hero widget's AddressAutocomplete always returns coordinates on
// selection, so this is never actually a limitation in practice; it's
// only stricter here because a ride fare with no real route genuinely
// isn't a fare (see quote.js's getRideQuote for the full reasoning). ----------
router.post("/estimate-ride", async (req, res) => {
  const { pickup_coords, dropoff_coords } = req.body;
  if (!pickup_coords || !dropoff_coords) {
    return res.status(400).json({ error: "pickup_coords and dropoff_coords are required" });
  }
  const quote = await getRideQuote({ pickup_coords, dropoff_coords });
  if (!quote) {
    return res.status(502).json({ error: "Couldn't calculate a fare for this route right now" });
  }
  res.json(quote);
});

// ---------- GAS PRICE ESTIMATE (landing page — no login required). Same
// public-preview role as /estimate and /estimate-ride above, calling the
// exact same getGasQuote() used by the authenticated version in
// routes/gas.js — this never re-implements the pricing logic, just skips
// the login requirement so a first-time visitor can see a real number
// before signing up. ----------
router.post("/estimate-gas", async (req, res) => {
  const { city, address, address_coords, cylinder_size_kg } = req.body;
  if (!city) return res.status(400).json({ error: "city is required" });
  if (!cylinder_size_kg) return res.status(400).json({ error: "cylinder_size_kg is required" });
  try {
    const quote = await getGasQuote({ city, address, address_coords: address_coords || null, cylinder_size_kg });
    res.json(quote);
  } catch (err) {
    res.status(400).json({ error: "Enter a valid cylinder size" });
  }
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

// ---------- NEARBY CAB DRIVERS (Bolt-style live map — no login required) ----------
// Phase 1: rides don't have a booking flow yet, this just powers the "see
// cars near you" home-screen map. Only approved, currently-online cab
// agents are returned, and only their coordinates + vehicle info — no
// name, phone, or photo, since this is a public, unauthenticated endpoint.
//
// Optional ?lat & ?lng center the search and sort by distance; without
// them, every online cab agent is returned (fine at current scale — add a
// city filter or PostGIS/earthdistance if this ever needs to scale past a
// few hundred concurrent online agents).
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

router.get("/nearby-drivers", async (req, res) => {
  try {
    const lat = req.query.lat ? Number(req.query.lat) : null;
    const lng = req.query.lng ? Number(req.query.lng) : null;
    const radiusKm = req.query.radius_km ? Number(req.query.radius_km) : 8;

    const { rows } = await pool.query(
      `SELECT user_id, vehicle_type, vehicle_make, current_lat, current_lng
       FROM agent_profiles
       WHERE approval_status = 'approved'
         AND vehicle_type = 'cab'
         AND is_online = 1
         AND current_lat IS NOT NULL
         AND current_lng IS NOT NULL
         AND location_updated_at > now() - ($1 || ' seconds')::interval`,
      [STALE_AFTER_SECONDS]
    );

    let drivers = rows.map((r) => ({
      id: r.user_id,
      vehicle_type: r.vehicle_type,
      vehicle_make: r.vehicle_make,
      lat: r.current_lat,
      lng: r.current_lng,
    }));

    if (lat !== null && lng !== null && !Number.isNaN(lat) && !Number.isNaN(lng)) {
      drivers = drivers
        .map((d) => ({ ...d, distance_km: Number(haversineKm(lat, lng, d.lat, d.lng).toFixed(2)) }))
        .filter((d) => d.distance_km <= radiusKm)
        .sort((a, b) => a.distance_km - b.distance_km);
    }

    res.json({ drivers });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong loading nearby drivers" });
  }
});

module.exports = router;
