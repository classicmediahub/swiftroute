const express = require("express");
const { requireAuth, requireRole } = require("../middleware/auth");
const { submitLandmark, listPendingSubmissions, confirmLandmark, reviewSubmission } = require("../landmarks");

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

module.exports = router;
