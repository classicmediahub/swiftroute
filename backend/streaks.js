const { v4: uuidv4 } = require("uuid");
const { pool } = require("./db");

// ---------- STREAKS — one shared implementation for both customer and
// agent streaks, since they use identical storage (users.current_streak /
// longest_streak / last_streak_date) and identical milestone logic. What
// differs per role is WHEN the caller invokes recordStreakActivity(), not
// how it behaves once called:
//   - customer: called from routes/deliveries.js / routes/rides.js right
//     after an order is successfully created ("placing an order" is the
//     agreed streak-day trigger — not payment confirmation, since a
//     pending Paystack order still counts as "placed").
//   - agent: called from the same two files, at the moment a job's status
//     becomes "delivered" / "completed" — not on accept, since the agreed
//     trigger is COMPLETING a job that day, not just picking one up.
//
// Dates are compared in Africa/Lagos time (UTC+1, no DST) rather than
// server-local time — Render's servers don't run in Nigeria, so using
// server-local dates would silently disagree with what "today" means to
// an actual person here, especially right around midnight.
const LAGOS_OFFSET_MS = 60 * 60 * 1000;

function lagosDateString(date = new Date()) {
  return new Date(date.getTime() + LAGOS_OFFSET_MS).toISOString().slice(0, 10); // "YYYY-MM-DD"
}

function daysBetween(isoDateA, isoDateB) {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((new Date(`${isoDateB}T00:00:00Z`) - new Date(`${isoDateA}T00:00:00Z`)) / msPerDay);
}

// Reward milestones — starting numbers, not researched ones, same spirit
// as pricing.js's tunable constants. Adjust freely; nothing else needs to
// change when you do, since the exact-equality check below (not a
// >= check) means each milestone only ever fires once per streak run.
const STREAK_MILESTONES = [
  { days: 3, reward: 200 },
  { days: 7, reward: 500 },
  { days: 14, reward: 1200 },
  { days: 30, reward: 3000 },
];

// Safe to call more than once for the same user on the same Lagos date —
// a repeat call is a no-op, so callers never need to worry about
// double-counting (e.g. a customer placing two orders in one day only
// advances the streak once).
async function recordStreakActivity(userId) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      "SELECT current_streak, longest_streak, last_streak_date FROM users WHERE id = $1 FOR UPDATE",
      [userId]
    );
    const user = rows[0];
    if (!user) { await client.query("ROLLBACK"); return null; }

    const today = lagosDateString();
    const lastDate = user.last_streak_date ? lagosDateString(new Date(user.last_streak_date)) : null;

    if (lastDate === today) {
      await client.query("ROLLBACK"); // already counted today
      return { current_streak: user.current_streak, longest_streak: user.longest_streak, milestoneReached: null };
    }

    const gap = lastDate ? daysBetween(lastDate, today) : null;
    const newStreak = gap === 1 ? user.current_streak + 1 : 1; // gap>1 or first-ever activity both start fresh at 1
    const newLongest = Math.max(user.longest_streak, newStreak);

    await client.query(
      "UPDATE users SET current_streak = $1, longest_streak = $2, last_streak_date = $3 WHERE id = $4",
      [newStreak, newLongest, today, userId]
    );

    const milestone = STREAK_MILESTONES.find((m) => m.days === newStreak);
    if (milestone) {
      const { rows: walletRows } = await client.query(
        "UPDATE users SET wallet_balance = wallet_balance + $1 WHERE id = $2 RETURNING wallet_balance",
        [milestone.reward, userId]
      );
      await client.query(
        `INSERT INTO wallet_transactions (id, user_id, type, amount, balance_after, status, note)
         VALUES ($1, $2, 'streak_reward', $3, $4, 'success', $5)`,
        [uuidv4(), userId, milestone.reward, walletRows[0].wallet_balance, `${newStreak}-day streak reward`]
      );
    }

    await client.query("COMMIT");
    return { current_streak: newStreak, longest_streak: newLongest, milestoneReached: milestone ? milestone.reward : null };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Streak update failed:", err.message);
    return null; // never throws — a streak-tracking failure should never break the actual order/delivery flow calling it
  } finally {
    client.release();
  }
}

module.exports = { recordStreakActivity, STREAK_MILESTONES, lagosDateString };
