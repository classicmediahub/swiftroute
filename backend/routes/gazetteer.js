const express = require("express");
const { requireAuth, requireRole } = require("../middleware/auth");
const { createGazetteerPoint, listGazetteerPoints, getPinningQueue } = require("../gazetteer");

const router = express.Router();

// All routes here are admin-only — this directly affects what coordinates
// real customer bookings resolve to, unlike the crowdsourced landmark
// submissions flow which anyone can contribute to pending confirmation.

router.get("/admin/all", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    res.json(await listGazetteerPoints());
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Couldn't load gazetteer points right now" });
  }
});

// The names still needing a manual pin (see check-gazetteer.js) that
// haven't been resolved yet — powers the admin "pinning queue" UI.
router.get("/admin/queue", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    res.json(await getPinningQueue());
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Couldn't load the pinning queue right now" });
  }
});

router.post("/admin", requireAuth, requireRole("admin"), async (req, res) => {
  const { name, type, city, latitude, longitude } = req.body;
  if (!name || latitude == null || longitude == null) {
    return res.status(400).json({ error: "name, latitude and longitude are required" });
  }
  try {
    const id = await createGazetteerPoint({ name, type, city, latitude, longitude, createdBy: req.user.id });
    res.status(201).json({ id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "Couldn't save this point right now" });
  }
});

module.exports = router;
