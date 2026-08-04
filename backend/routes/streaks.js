const express = require("express");
const { pool } = require("../db");
const { requireAuth } = require("../middleware/auth");
const { STREAK_MILESTONES } = require("../streaks");

const router = express.Router();

// Works for either role — current_streak/longest_streak/last_streak_date
// live on `users` regardless of whether the caller is a customer or agent
// (see db.js / streaks.js). Also returns the milestone table so the
// frontend can show "3 more days to ₦500" style messaging without
// hardcoding the reward schedule in two places.
router.get("/me", requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT current_streak, longest_streak, last_streak_date FROM users WHERE id = $1",
      [req.user.id]
    );
    const user = rows[0];
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json({
      current_streak: user.current_streak,
      longest_streak: user.longest_streak,
      last_streak_date: user.last_streak_date,
      milestones: STREAK_MILESTONES,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Couldn't load streak info right now" });
  }
});

module.exports = router;
