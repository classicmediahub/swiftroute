const express = require("express");
const { pool } = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth, requireRole("agent"));

// How stale a position can be before the public map (and this endpoint's
// own is_online read) should stop trusting it. Kept in one place so
// public.js's query and this file agree on the same number.
const STALE_AFTER_SECONDS = 30;

// Called every ~12s from AgentDashboard while it's mounted and the browser
// has location permission — see frontend's useLiveLocation hook. Each call
// both updates position AND (re)confirms the agent is online; there's no
// separate "go online" step; being on the dashboard with permission
// granted *is* being online, per how this was scoped.
//
// Phase 1 scope: only cab agents show up on the public rides map, but this
// endpoint itself doesn't hard-block bike/self agents from calling it —
// keeps the door open for bike-taxi rides later without a backend change,
// the filtering happens in public.js instead.
router.patch("/location", async (req, res) => {
  try {
    const { lat, lng } = req.body;
    if (typeof lat !== "number" || typeof lng !== "number") {
      return res.status(400).json({ error: "lat and lng must be numbers" });
    }
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return res.status(400).json({ error: "lat/lng out of range" });
    }

    const { rows } = await pool.query(
      `UPDATE agent_profiles
       SET current_lat = $1, current_lng = $2, location_updated_at = now(), is_online = 1
       WHERE user_id = $3
       RETURNING user_id`,
      [lat, lng, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: "Agent profile not found" });

    res.json({ success: true });
  } catch (err) {
    console.error("Agent location update failed:", err);
    res.status(500).json({ error: "Couldn't update your location" });
  }
});

// Best-effort "I'm closing the dashboard" signal — sent from a
// beforeunload/unmount handler, which browsers don't guarantee will fire
// (closing a laptop lid, a crash, losing signal). That's fine: the public
// query's staleness filter (location_updated_at within STALE_AFTER_SECONDS)
// is what actually guarantees a gone agent disappears from the map, this
// endpoint just makes the common case (closing the tab normally) instant
// instead of waiting ~30s.
router.post("/offline", async (req, res) => {
  try {
    await pool.query(`UPDATE agent_profiles SET is_online = 0 WHERE user_id = $1`, [req.user.id]);
    res.json({ success: true });
  } catch (err) {
    console.error("Agent offline update failed:", err);
    res.status(500).json({ error: "Couldn't update your status" });
  }
});

module.exports = router;
module.exports.STALE_AFTER_SECONDS = STALE_AFTER_SECONDS;
