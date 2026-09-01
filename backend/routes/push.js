const express = require("express");
const { requireAuth } = require("../middleware/auth");
const { saveSubscription, removeSubscription, VAPID_PUBLIC_KEY } = require("../push");

const router = express.Router();

// Public — the frontend needs this to call pushManager.subscribe(). Not a
// secret; VAPID's whole design is that only the *private* key matters.
router.get("/vapid-public-key", (req, res) => {
  if (!VAPID_PUBLIC_KEY) return res.status(503).json({ error: "Push notifications aren't configured on this server" });
  res.json({ publicKey: VAPID_PUBLIC_KEY });
});

router.post("/subscribe", requireAuth, async (req, res) => {
  try {
    await saveSubscription(req.user.id, req.body.subscription);
    res.status(201).json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message || "Couldn't save this subscription" });
  }
});

router.post("/unsubscribe", requireAuth, async (req, res) => {
  try {
    const { endpoint } = req.body;
    if (!endpoint) return res.status(400).json({ error: "endpoint is required" });
    await removeSubscription(endpoint);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Couldn't remove this subscription" });
  }
});

module.exports = router;
