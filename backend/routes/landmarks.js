const express = require("express");
const { requireAuth, requireRole } = require("../middleware/auth");
const {
  submitLandmark, listPendingSubmissions, confirmLandmark, reviewSubmission,
  adminCreateLandmark, listAllLandmarks,
} = require("../landmarks");

const router = express.Router();

// Any logged-in role (customer or agent) can submit — agents in particular
// often know a campus better than the person who originally seeded it.
router.post("/submit", requireAuth, async (req, res) => {
  const { institution_id, name, zone, latitude, longitude, note } = req.body;
  if (!institution_id || !name) {
    return res.status(400).json({ error: "institution_id and name are required" });
  }
  try {
    const id = await submitLandmark({
      institutionId: institution_id, submittedBy: req.user.id, name, zone, latitude, longitude, note,
    });
    res.status(201).json({ id, message: "Thanks! Your landmark is pending confirmation from other users." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Couldn't submit this landmark right now" });
  }
});

router.get("/pending/:institutionId", requireAuth, async (req, res) => {
  try {
    res.json(await listPendingSubmissions(req.params.institutionId));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Couldn't load pending landmarks right now" });
  }
});

router.post("/:submissionId/confirm", requireAuth, async (req, res) => {
  const result = await confirmLandmark(req.params.submissionId, req.user.id);
  if (!result.confirmed) return res.status(400).json({ error: result.reason || "Couldn't confirm this landmark" });
  res.json(result);
});

router.patch("/:submissionId/review", requireAuth, requireRole("admin"), async (req, res) => {
  const { status } = req.body;
  const ok = await reviewSubmission(req.params.submissionId, req.user.id, status);
  if (!ok) return res.status(400).json({ error: "Couldn't review this submission — check it's still pending" });
  res.json({ success: true });
});

// Admin: full list across every institution, for the "Landmarks" tab table.
router.get("/admin/all", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    res.json(await listAllLandmarks());
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Couldn't load landmarks right now" });
  }
});

// Admin: place a landmark directly (map click or address search already
// resolved to lat/lng on the frontend) — saved as verified immediately,
// no peer confirmation needed.
router.post("/admin", requireAuth, requireRole("admin"), async (req, res) => {
  const { institution_id, name, zone, latitude, longitude } = req.body;
  if (!institution_id || !name || latitude == null || longitude == null) {
    return res.status(400).json({ error: "institution_id, name, latitude and longitude are required" });
  }
  try {
    const id = await adminCreateLandmark({ institutionId: institution_id, name, zone, latitude, longitude });
    res.status(201).json({ id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "Couldn't create this landmark right now" });
  }
});

module.exports = router;
