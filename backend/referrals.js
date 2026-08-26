const { v4: uuidv4 } = require("uuid");
const { pool } = require("./db");

// ---------- REFERRALS — only the referrer ever earns (see streaks.js for
// the sibling feature this mirrors: same "shared logic, role decides when
// it fires" shape). Two independent reward paths share one function
// (checkReferralReward), both triggered from the same "delivered"
// transition in routes/deliveries.js:
//   - customer: referred customer's first COMPLETED delivery
//   - agent:    referred agent's first COMPLETED job
// A referred agent who also refers other agents, or a referred customer
// who also refers other customers, is handled fine — referred_by only
// ever points one level up, so reward chains don't cascade or loop.

const REFERRAL_REWARD = { customer: 500, agent: 800 }; // starting numbers — tune freely, same spirit as pricing.js/streaks.js

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I — avoids codes that are easy to misread when shared verbally

function generateReferralCode() {
  let code = "";
  for (let i = 0; i < 7; i++) code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return code;
}

// Call once at signup (any role) to give the new user their own shareable
// code. Retries on the astronomically unlikely chance of a collision
// (36^7 possible codes) rather than trusting uniqueness blindly.
async function assignUniqueReferralCode(userId) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateReferralCode();
    try {
      await pool.query("UPDATE users SET referral_code = $1 WHERE id = $2", [code, userId]);
      return code;
    } catch (err) {
      if (err.code === "23505") continue; // unique_violation — try another code
      throw err;
    }
  }
  throw new Error("Could not generate a unique referral code after 5 attempts");
}

// Call once at signup, right after the new user's row exists, passing
// whatever referral code (if any) came in with the signup request — e.g.
// from a `?ref=CODE` link. Silently no-ops on a missing/unknown/self code
// rather than failing signup over it; a mistyped code shouldn't block
// someone from creating an account.
async function attachReferrer(userId, referralCodeInput) {
  if (!referralCodeInput) return;
  const code = String(referralCodeInput).trim().toUpperCase();
  if (!code) return;
  const { rows } = await pool.query("SELECT id FROM users WHERE referral_code = $1", [code]);
  const referrer = rows[0];
  if (!referrer || referrer.id === userId) return; // unknown code, or someone trying to refer themselves
  await pool.query("UPDATE users SET referred_by = $1 WHERE id = $2", [referrer.id, userId]);
}

// Call whenever completedUserId's job (delivery or, once rides.js is
// wired in, a ride) reaches its terminal completed state. role is
// "customer" or "agent" — decides both the reward amount and the note
// text, not the trigger logic itself, which is identical either way.
// Safe to call on every completion, forever — after the first payout,
// referral_reward_given permanently short-circuits this to a no-op for
// that referred user, so it costs one indexed SELECT per call and nothing
// more once already paid.
async function checkReferralReward(completedUserId, role) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      "SELECT referred_by, referral_reward_given FROM users WHERE id = $1 FOR UPDATE",
      [completedUserId]
    );
    const user = rows[0];
    if (!user || !user.referred_by || user.referral_reward_given) {
      await client.query("ROLLBACK");
      return null;
    }

    const reward = REFERRAL_REWARD[role] || REFERRAL_REWARD.customer;

    // IMPORTANT: which table actually holds the referrer's spendable
    // balance depends on the REFERRER's own role, not the referred
    // user's role — an agent's real balance lives in
    // agent_profiles.wallet_balance everywhere else in this codebase
    // (deliveries.js, rides.js), never users.wallet_balance. Crediting
    // the wrong table here would make the reward invisible on the
    // agent's dashboard/withdrawals even though the money "exists".
    const { rows: referrerRows } = await client.query("SELECT role FROM users WHERE id = $1", [user.referred_by]);
    const referrerRole = referrerRows[0]?.role;

    let newBalance;
    if (referrerRole === "agent") {
      const { rows: agentRows } = await client.query(
        "UPDATE agent_profiles SET wallet_balance = wallet_balance + $1 WHERE user_id = $2 RETURNING wallet_balance",
        [reward, user.referred_by]
      );
      newBalance = agentRows[0]?.wallet_balance;
    } else {
      const { rows: walletRows } = await client.query(
        "UPDATE users SET wallet_balance = wallet_balance + $1 WHERE id = $2 RETURNING wallet_balance",
        [reward, user.referred_by]
      );
      newBalance = walletRows[0]?.wallet_balance;
    }

    await client.query(
      `INSERT INTO wallet_transactions (id, user_id, type, amount, balance_after, status, note)
       VALUES ($1, $2, 'referral_reward', $3, $4, 'success', $5)`,
      [
        uuidv4(), user.referred_by, reward, newBalance,
        `Referral reward — your referral completed their first ${role === "agent" ? "job" : "delivery"}`,
      ]
    );
    await client.query("UPDATE users SET referral_reward_given = true WHERE id = $1", [completedUserId]);

    await client.query("COMMIT");
    return { referrerId: user.referred_by, reward };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Referral reward check failed:", err.message);
    return null; // never throws — a referral-check failure should never break the actual delivery/ride completion calling it
  } finally {
    client.release();
  }
}

module.exports = { generateReferralCode, assignUniqueReferralCode, attachReferrer, checkReferralReward, REFERRAL_REWARD };
