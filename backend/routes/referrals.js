const express = require("express");
const { pool } = require("../db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

function referralLink(code) {
  const base = process.env.FRONTEND_URL || "http://localhost:5173";
  return `${base.replace(/\/$/, "")}/signup?ref=${code}`;
}

// ---------- MY REFERRAL INFO (any role) ----------
// Everything the frontend needs to show a shareable code/link and simple
// stats — how many people signed up with it, and how much has actually
// been earned so far (only referrals that completed their first job pay
// out, per checkReferralReward in ../referrals.js).
router.get("/me", requireAuth, async (req, res) => {
  try {
    const { rows: userRows } = await pool.query("SELECT referral_code FROM users WHERE id = $1", [req.user.id]);
    const code = userRows[0]?.referral_code;

    const { rows: countRows } = await pool.query(
      "SELECT COUNT(*)::int AS referred_count FROM users WHERE referred_by = $1",
      [req.user.id]
    );
    const { rows: earnedRows } = await pool.query(
      `SELECT COUNT(*)::int AS rewarded_count, COALESCE(SUM(amount), 0) AS total_earned
       FROM wallet_transactions WHERE user_id = $1 AND type = 'referral_reward' AND status = 'success'`,
      [req.user.id]
    );

    res.json({
      referral_code: code,
      referral_link: code ? referralLink(code) : null,
      referred_count: countRows[0].referred_count,
      rewarded_count: earnedRows[0].rewarded_count,
      total_earned: Number(earnedRows[0].total_earned),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong loading your referral info" });
  }
});

module.exports = router;
