const express = require("express");
const { pool } = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");
const { getMyUniformOrder, submitUniformSize } = require("../uniform");

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

// Free to flip on/off anytime — turning it on doesn't cost anything by
// itself. See boost.js: the actual fee is only ever charged at the
// moment an agent successfully claims a job before its public window
// opens, not for having this switched on.
router.patch("/boost", async (req, res) => {
  const { enabled } = req.body;
  if (typeof enabled !== "boolean") {
    return res.status(400).json({ error: "enabled must be true or false" });
  }
  try {
    await pool.query("UPDATE agent_profiles SET boost_enabled = $1 WHERE user_id = $2", [enabled, req.user.id]);
    res.json({ boost_enabled: enabled });
  } catch (err) {
    console.error("Boost toggle failed:", err);
    res.status(500).json({ error: "Couldn't update your Job Boost setting" });
  }
});

// Photo is resized client-side to a small JPEG before it ever reaches
// here (see AgentDashboard.jsx) — this same photo string gets embedded in
// every delivery/ride row returned to every customer this agent has ever
// worked with, so keeping it small matters far more than for a one-off
// upload.
router.patch("/profile-photo", async (req, res) => {
  const { photo } = req.body;
  if (!photo || typeof photo !== "string") {
    return res.status(400).json({ error: "photo is required" });
  }
  try {
    await pool.query("UPDATE users SET profile_photo = $1 WHERE id = $2", [photo, req.user.id]);
    res.json({ profile_photo: photo });
  } catch (err) {
    console.error("Profile photo update failed:", err);
    res.status(500).json({ error: "Couldn't update your profile photo" });
  }
});

router.get("/uniform", async (req, res) => {
  try {
    const order = await getMyUniformOrder(req.user.id);
    res.json(order); // null if not yet approved/charged — frontend treats that as "nothing to show"
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Couldn't load your uniform order" });
  }
});

router.patch("/uniform/size", async (req, res) => {
  const { cloth_size } = req.body;
  if (!["S", "M", "L", "XL", "XXL"].includes(cloth_size)) {
    return res.status(400).json({ error: "Select a valid size" });
  }
  try {
    const updated = await submitUniformSize(req.user.id, cloth_size);
    if (!updated) {
      return res.status(409).json({ error: "Your size has already been submitted, or there's no uniform order to update" });
    }
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Couldn't save your size" });
  }
});

module.exports = router;
module.exports.STALE_AFTER_SECONDS = STALE_AFTER_SECONDS;
