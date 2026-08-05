const express = require("express");
const { getAgentReputation } = require("../reputation");

const router = express.Router();

// Public on purpose — a customer should be able to see an agent's
// reputation before or during a match, the same way tracking a delivery
// by code doesn't require login (see routes/public.js). Nothing sensitive
// is returned — see getAgentReputation's shape for exactly what's exposed.
router.get("/:agentId", async (req, res) => {
  try {
    const profile = await getAgentReputation(req.params.agentId);
    if (!profile) return res.status(404).json({ error: "Agent not found" });
    res.json(profile);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Couldn't load this agent's profile right now" });
  }
});

module.exports = router;
