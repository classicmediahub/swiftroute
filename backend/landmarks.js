const { v4: uuidv4 } = require("uuid");
const { pool } = require("./db");

// ---------- CROWDSOURCED LANDMARKS — see db.js's landmark_submissions
// comment for the shape. A submission is invisible to the real delivery
// picker until CONFIRMATION_THRESHOLD independent users confirm it's
// real, at which point it's promoted into the actual `landmarks` table
// and the original submitter is paid — once, regardless of how many
// confirmations came in beyond the threshold.
const CONFIRMATION_THRESHOLD = 3;
const SUBMISSION_REWARD = 300; // starting number, tune freely — same spirit as pricing.js/streaks.js/referrals.js

async function submitLandmark({ institutionId, submittedBy, name, zone, latitude, longitude, note }) {
  const id = uuidv4();
  await pool.query(
    `INSERT INTO landmark_submissions (id, institution_id, submitted_by, name, zone, latitude, longitude, note)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [id, institutionId, submittedBy, name, zone || null, latitude ?? null, longitude ?? null, note || null]
  );
  return id;
}

async function listPendingSubmissions(institutionId) {
  const { rows } = await pool.query(
    `SELECT id, name, zone, latitude, longitude, note, confirmation_count, created_at
     FROM landmark_submissions
     WHERE institution_id = $1 AND status = 'pending'
     ORDER BY created_at DESC`,
    [institutionId]
  );
  return rows;
}

// Inserts the real landmark row, marks the submission approved, and pays
// the submitter. Must run inside the caller's existing transaction/client
// — this function never opens or commits its own.
async function promoteSubmission(client, submission) {
  const landmarkId = uuidv4();
  await client.query(
    `INSERT INTO landmarks (id, institution_id, name, zone, latitude, longitude, is_verified)
     VALUES ($1,$2,$3,$4,$5,$6,false)
     ON CONFLICT (institution_id, name) DO NOTHING`,
    [landmarkId, submission.institution_id, submission.name, submission.zone, submission.latitude, submission.longitude]
  );
  await client.query(
    "UPDATE landmark_submissions SET status = 'approved', reviewed_at = now() WHERE id = $1",
    [submission.id]
  );

  if (!submission.reward_given) {
    const { rows: walletRows } = await client.query(
      "UPDATE users SET wallet_balance = wallet_balance + $1 WHERE id = $2 RETURNING wallet_balance",
      [SUBMISSION_REWARD, submission.submitted_by]
    );
    await client.query(
      `INSERT INTO wallet_transactions (id, user_id, type, amount, balance_after, status, note)
       VALUES ($1,$2,'landmark_reward',$3,$4,'success',$5)`,
      [uuidv4(), submission.submitted_by, SUBMISSION_REWARD, walletRows[0].wallet_balance, `Landmark verified: "${submission.name}"`]
    );
    await client.query("UPDATE landmark_submissions SET reward_given = true WHERE id = $1", [submission.id]);
  }
}

// Returns { confirmed, promoted?, confirmation_count?, reason? }
async function confirmLandmark(submissionId, confirmedBy) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: subRows } = await client.query(
      "SELECT * FROM landmark_submissions WHERE id = $1 FOR UPDATE",
      [submissionId]
    );
    const submission = subRows[0];
    if (!submission || submission.status !== "pending") {
      await client.query("ROLLBACK");
      return { confirmed: false, reason: "This landmark isn't awaiting confirmation" };
    }
    if (submission.submitted_by === confirmedBy) {
      await client.query("ROLLBACK");
      return { confirmed: false, reason: "You can't confirm your own submission" };
    }

    try {
      await client.query(
        "INSERT INTO landmark_confirmations (id, submission_id, confirmed_by) VALUES ($1,$2,$3)",
        [uuidv4(), submissionId, confirmedBy]
      );
    } catch (err) {
      if (err.code === "23505") {
        await client.query("ROLLBACK");
        return { confirmed: false, reason: "You already confirmed this one" };
      }
      throw err;
    }

    const { rows: countRows } = await client.query(
      "UPDATE landmark_submissions SET confirmation_count = confirmation_count + 1 WHERE id = $1 RETURNING confirmation_count",
      [submissionId]
    );
    const newCount = countRows[0].confirmation_count;

    let promoted = false;
    if (newCount >= CONFIRMATION_THRESHOLD) {
      await promoteSubmission(client, submission);
      promoted = true;
    }

    await client.query("COMMIT");
    return { confirmed: true, promoted, confirmation_count: newCount };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Landmark confirmation failed:", err.message);
    return { confirmed: false, reason: "Something went wrong" };
  } finally {
    client.release();
  }
}

// Admin manual override — 'approved' fast-tracks promotion regardless of
// confirmation count (e.g. an admin who personally knows the campus);
// 'rejected' kills it dead, no landmark created, nothing paid.
async function reviewSubmission(submissionId, adminId, decision) {
  if (!["approved", "rejected"].includes(decision)) throw new Error("decision must be 'approved' or 'rejected'");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query("SELECT * FROM landmark_submissions WHERE id = $1 FOR UPDATE", [submissionId]);
    const submission = rows[0];
    if (!submission || submission.status !== "pending") {
      await client.query("ROLLBACK");
      return false;
    }
    if (decision === "approved") {
      await promoteSubmission(client, submission);
    } else {
      await client.query(
        "UPDATE landmark_submissions SET status = 'rejected', reviewed_at = now(), reviewed_by = $2 WHERE id = $1",
        [submissionId, adminId]
      );
    }
    await client.query("COMMIT");
    return true;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Landmark review failed:", err.message);
    return false;
  } finally {
    client.release();
  }
}

module.exports = {
  submitLandmark, listPendingSubmissions, confirmLandmark, reviewSubmission,
  CONFIRMATION_THRESHOLD, SUBMISSION_REWARD,
};
