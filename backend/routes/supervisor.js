const express = require("express");
const { pool } = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");
const { chargeUniformKit } = require("../uniform");

const router = express.Router();
router.use(requireAuth, requireRole("supervisor"));

async function getMyScope(userId) {
  const { rows } = await pool.query(
    "SELECT state, city FROM location_admins WHERE user_id = $1 AND role = 'supervisor'",
    [userId]
  );
  return rows[0] || null;
}

router.get("/me", async (req, res) => {
  const scope = await getMyScope(req.user.id);
  if (!scope) return res.status(404).json({ error: "No supervisor assignment found for this account" });
  res.json(scope);
});

// Only agents in this supervisor's exact state+city — not "close enough,"
// since a supervisor for Ota, Ogun shouldn't see or approve agents in
// Abeokuta, Ogun just because the state matches.
router.get("/agents", async (req, res) => {
  const scope = await getMyScope(req.user.id);
  if (!scope) return res.status(404).json({ error: "No supervisor assignment found for this account" });
  try {
    const { rows } = await pool.query(`
      SELECT u.id, u.full_name, u.email, u.phone, u.status, u.created_at, u.profile_photo,
             a.vehicle_type, a.vehicle_make, a.vehicle_plate, a.license_number, a.city, a.state,
             a.approval_status, a.is_online, a.rating, a.total_deliveries, a.total_rides
      FROM users u JOIN agent_profiles a ON a.user_id = u.id
      WHERE u.role = 'agent' AND a.state = $1 AND a.city = $2
      ORDER BY a.approval_status ASC, u.created_at DESC
    `, [scope.state, scope.city]);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong loading agents" });
  }
});

router.patch("/agents/:id/status", async (req, res) => {
  try {
    const { approval_status } = req.body;
    if (!["pending", "approved", "rejected", "suspended"].includes(approval_status)) {
      return res.status(400).json({ error: "Invalid approval status" });
    }

    const scope = await getMyScope(req.user.id);
    if (!scope) return res.status(404).json({ error: "No supervisor assignment found for this account" });

    const { rows } = await pool.query("SELECT * FROM agent_profiles WHERE user_id = $1", [req.params.id]);
    const profile = rows[0];
    if (!profile) return res.status(404).json({ error: "Agent not found" });

    // The actual access-control check — everything above is just setup.
    // A supervisor whose own scope doesn't match this specific agent's
    // location gets a 403, regardless of what the URL says.
    if (profile.state !== scope.state || profile.city !== scope.city) {
      return res.status(403).json({ error: "This agent is outside your assigned area" });
    }

    await pool.query("UPDATE agent_profiles SET approval_status = $1 WHERE user_id = $2", [approval_status, req.params.id]);

    // Same automatic uniform charge as the full-admin approval route —
    // an agent shouldn't get a different onboarding experience depending
    // on whether a supervisor or a full admin happened to approve them.
    if (approval_status === "approved" && profile.approval_status !== "approved") {
      chargeUniformKit(req.params.id).catch((err) =>
        console.error("Uniform kit charge failed (fire-and-forget):", err.message)
      );
    }

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong updating this agent" });
  }
});

module.exports = router;
