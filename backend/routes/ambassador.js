const express = require("express");
const { pool } = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");
const { REFERRAL_REWARD } = require("../referrals");

const router = express.Router();
router.use(requireAuth, requireRole("ambassador"));

// No elevated permissions here at all — this is purely a dedicated
// window into the SAME referral mechanism every user already has
// (referrals.js), since "recruit agents in your area" is exactly what
// that system already rewards. An ambassador is just someone whose whole
// job is doing that on purpose, so they get a nicer view of it than
// digging through an agent/customer dashboard would give them.
router.get("/me", async (req, res) => {
  try {
    const { rows: scopeRows } = await pool.query(
      "SELECT state, city FROM location_admins WHERE user_id = $1 AND role = 'ambassador'",
      [req.user.id]
    );
    const { rows: userRows } = await pool.query("SELECT referral_code FROM users WHERE id = $1", [req.user.id]);
    if (!scopeRows[0]) return res.status(404).json({ error: "No ambassador assignment found for this account" });

    res.json({
      referral_code: userRows[0]?.referral_code || null,
      state: scopeRows[0].state,
      city: scopeRows[0].city,
      reward_per_agent: REFERRAL_REWARD.agent,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong loading your ambassador profile" });
  }
});

router.get("/referrals", async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT u.id, u.full_name, u.phone, u.created_at, u.referral_reward_given,
             a.approval_status, a.city, a.state
      FROM users u
      LEFT JOIN agent_profiles a ON a.user_id = u.id
      WHERE u.referred_by = $1 AND u.role = 'agent'
      ORDER BY u.created_at DESC
    `, [req.user.id]);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong loading your referrals" });
  }
});

module.exports = router;
