const express = require("express");
const { v4: uuidv4 } = require("uuid");
const { pool } = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");
const {
  listBanks,
  resolveAccountNumber,
  createTransferRecipient,
  initiateTransfer,
} = require("../paystack");

const router = express.Router();

const MIN_WITHDRAWAL = 1000; // ₦1,000 — tune freely, same spirit as REFERRAL_REWARD in referrals.js

// Withdrawals are only allowed on these two days a week (Nigeria time),
// per how the business wants this to work — not a rolling "any 2 times in
// 7 days" window. Checked both here (for the friendly error message) and
// implicitly enforced by only exposing the days at all.
const WITHDRAWAL_DAYS = ["Monday", "Thursday"];

function lagosDayName(date = new Date()) {
  return date.toLocaleString("en-US", { timeZone: "Africa/Lagos", weekday: "long" });
}

function isWithdrawalDayToday() {
  return WITHDRAWAL_DAYS.includes(lagosDayName());
}

function withdrawalReference() {
  return `PAEWD-${uuidv4().replace(/-/g, "").slice(0, 20).toUpperCase()}`;
}

// ---------- LIST BANKS (agent) — for the bank-selection dropdown ----------
router.get("/banks", requireAuth, requireRole("agent"), async (req, res) => {
  try {
    const banks = await listBanks();
    res.json(banks.map((b) => ({ name: b.name, code: b.code })));
  } catch (err) {
    console.error("List banks failed:", err.message);
    res.status(502).json({ error: "Could not load the list of banks right now. Try again shortly." });
  }
});

// ---------- RESOLVE ACCOUNT NAME (agent) — confirms the account before saving ----------
router.post("/resolve-account", requireAuth, requireRole("agent"), async (req, res) => {
  try {
    const { account_number, bank_code } = req.body;
    if (!account_number || !bank_code) {
      return res.status(400).json({ error: "Account number and bank are required" });
    }
    const resolved = await resolveAccountNumber(account_number, bank_code);
    res.json({ account_name: resolved.account_name });
  } catch (err) {
    console.error("Resolve account failed:", err.message);
    res.status(400).json({ error: "Couldn't verify that account number. Double-check it and try again." });
  }
});

// ---------- SAVE BANK DETAILS (agent) — creates/replaces their Paystack recipient ----------
router.post("/bank-details", requireAuth, requireRole("agent"), async (req, res) => {
  try {
    const { account_number, bank_code, bank_name } = req.body;
    if (!account_number || !bank_code || !bank_name) {
      return res.status(400).json({ error: "Account number, bank code, and bank name are required" });
    }

    // Re-resolve server-side rather than trusting whatever account_name the
    // client sends — the client only ever SAW a name from /resolve-account,
    // it shouldn't get to assert an arbitrary one back to us.
    const resolved = await resolveAccountNumber(account_number, bank_code);

    const recipient = await createTransferRecipient({
      name: resolved.account_name,
      accountNumber: account_number,
      bankCode: bank_code,
    });

    await pool.query(
      `UPDATE agent_profiles
       SET bank_code = $1, bank_name = $2, account_number = $3, account_name = $4, paystack_recipient_code = $5
       WHERE user_id = $6`,
      [bank_code, bank_name, account_number, resolved.account_name, recipient.recipient_code, req.user.id]
    );

    res.json({ account_name: resolved.account_name, bank_name });
  } catch (err) {
    console.error("Save bank details failed:", err.message);
    res.status(400).json({ error: "Couldn't save that bank account. Double-check the details and try again." });
  }
});

// ---------- REQUEST A WITHDRAWAL (agent) ----------
// Deducts from the agent's balance IMMEDIATELY on request (not on payout),
// so the same money can't be requested twice while awaiting admin review.
// A rejection refunds it (see the admin reject route below).
router.post("/", requireAuth, requireRole("agent"), async (req, res) => {
  const client = await pool.connect();
  try {
    if (!isWithdrawalDayToday()) {
      client.release();
      return res.status(403).json({
        error: `Withdrawals can only be requested on ${WITHDRAWAL_DAYS.join(" and ")}. Please check back then.`,
      });
    }

    const amount = Number(req.body.amount);
    if (!Number.isFinite(amount) || amount < MIN_WITHDRAWAL) {
      client.release();
      return res.status(400).json({ error: `Enter a valid amount (minimum ₦${MIN_WITHDRAWAL.toLocaleString()})` });
    }

    await client.query("BEGIN");
    const { rows: profileRows } = await client.query(
      "SELECT * FROM agent_profiles WHERE user_id = $1 FOR UPDATE",
      [req.user.id]
    );
    const profile = profileRows[0];
    if (!profile) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Agent profile not found" });
    }
    if (!profile.paystack_recipient_code || !profile.account_number) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Add your bank details before requesting a withdrawal" });
    }
    if (Number(profile.wallet_balance) < amount) {
      await client.query("ROLLBACK");
      return res.status(402).json({
        error: `Insufficient balance. You have ₦${Number(profile.wallet_balance).toLocaleString()}.`,
      });
    }

    // One pending/approved/processing withdrawal at a time — stops an
    // agent stacking several requests before an admin has looked at the
    // first one.
    const { rows: openRows } = await client.query(
      `SELECT id FROM agent_withdrawals WHERE agent_id = $1 AND status IN ('pending','approved','processing')`,
      [req.user.id]
    );
    if (openRows.length > 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "You already have a withdrawal awaiting review" });
    }

    const newBalance = Number(profile.wallet_balance) - amount;
    await client.query("UPDATE agent_profiles SET wallet_balance = $1 WHERE user_id = $2", [newBalance, req.user.id]);

    const id = uuidv4();
    await client.query(
      `INSERT INTO agent_withdrawals (id, agent_id, amount, status, bank_name, account_number, account_name)
       VALUES ($1, $2, $3, 'pending', $4, $5, $6)`,
      [id, req.user.id, amount, profile.bank_name, profile.account_number, profile.account_name]
    );
    await client.query(
      `INSERT INTO wallet_transactions (id, user_id, type, amount, balance_after, status, note)
       VALUES ($1, $2, 'withdrawal', $3, $4, 'pending', $5)`,
      [uuidv4(), req.user.id, -amount, newBalance, `Withdrawal requested — pending admin review (${id})`]
    );

    await client.query("COMMIT");
    res.status(201).json({ id, amount, status: "pending", balance: newBalance });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Withdrawal request failed:", err.message);
    res.status(500).json({ error: "Something went wrong requesting your withdrawal" });
  } finally {
    client.release();
  }
});

// ---------- MY WITHDRAWAL HISTORY (agent) ----------
router.get("/", requireAuth, requireRole("agent"), async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT * FROM agent_withdrawals WHERE agent_id = $1 ORDER BY requested_at DESC LIMIT 50",
      [req.user.id]
    );
    res.json({
      withdrawals: rows,
      next_withdrawal_day: isWithdrawalDayToday() ? "today" : WITHDRAWAL_DAYS.join(" or "),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong loading your withdrawals" });
  }
});

// ================= ADMIN =================

// ---------- PENDING WITHDRAWALS (admin) ----------
router.get("/admin/pending", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT w.*, u.full_name AS agent_name, u.email AS agent_email, u.phone AS agent_phone
       FROM agent_withdrawals w
       JOIN users u ON u.id = w.agent_id
       WHERE w.status = 'pending'
       ORDER BY w.requested_at ASC`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong loading pending withdrawals" });
  }
});

// ---------- APPROVE (admin) — triggers the actual Paystack transfer ----------
router.post("/admin/:id/approve", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM agent_withdrawals WHERE id = $1", [req.params.id]);
    const withdrawal = rows[0];
    if (!withdrawal) return res.status(404).json({ error: "Withdrawal not found" });
    if (withdrawal.status !== "pending") {
      return res.status(409).json({ error: `This withdrawal is already '${withdrawal.status}'` });
    }

    const { rows: profileRows } = await pool.query(
      "SELECT paystack_recipient_code FROM agent_profiles WHERE user_id = $1",
      [withdrawal.agent_id]
    );
    const recipientCode = profileRows[0]?.paystack_recipient_code;
    if (!recipientCode) {
      return res.status(400).json({ error: "This agent has no saved bank recipient on Paystack" });
    }

    const reference = withdrawalReference();
    await pool.query(
      `UPDATE agent_withdrawals SET status = 'approved', reviewed_by = $1, reviewed_at = now(), paystack_reference = $2 WHERE id = $3`,
      [req.user.id, reference, withdrawal.id]
    );

    try {
      const transfer = await initiateTransfer({
        amountNaira: withdrawal.amount,
        recipientCode,
        reason: "Pick and Earn agent withdrawal",
        reference,
      });

      // Paystack may return 'success' immediately, or 'otp'/'pending' if
      // it needs a one-time PIN entered in the Paystack dashboard before
      // it actually completes — see the note in paystack.js. Either way
      // we mark it 'processing' here; the definitive final state ('paid'
      // or 'failed') should come from your Paystack transfer webhook.
      await pool.query(
        `UPDATE agent_withdrawals SET status = 'processing', paystack_transfer_code = $1 WHERE id = $2`,
        [transfer.transfer_code, withdrawal.id]
      );
      res.json({ status: "processing", transfer_code: transfer.transfer_code });
    } catch (transferErr) {
      console.error("Paystack transfer failed:", transferErr.message);
      // Transfer call itself failed outright — refund the agent immediately
      // rather than leaving them short with no explanation.
      await refundFailedWithdrawal(withdrawal);
      res.status(502).json({ error: "The transfer failed to initiate. The agent has been refunded." });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong approving this withdrawal" });
  }
});

// ---------- REJECT (admin) — refunds the agent's balance ----------
router.post("/admin/:id/reject", requireAuth, requireRole("admin"), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query("SELECT * FROM agent_withdrawals WHERE id = $1 FOR UPDATE", [req.params.id]);
    const withdrawal = rows[0];
    if (!withdrawal) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Withdrawal not found" });
    }
    if (withdrawal.status !== "pending") {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: `This withdrawal is already '${withdrawal.status}'` });
    }

    const reason = (req.body.reason || "").trim() || null;
    await client.query(
      `UPDATE agent_withdrawals SET status = 'rejected', reviewed_by = $1, reviewed_at = now(), rejection_reason = $2 WHERE id = $3`,
      [req.user.id, reason, withdrawal.id]
    );

    const { rows: agentRows } = await client.query(
      "UPDATE agent_profiles SET wallet_balance = wallet_balance + $1 WHERE user_id = $2 RETURNING wallet_balance",
      [withdrawal.amount, withdrawal.agent_id]
    );
    await client.query(
      `INSERT INTO wallet_transactions (id, user_id, type, amount, balance_after, status, note)
       VALUES ($1, $2, 'withdrawal_refund', $3, $4, 'success', $5)`,
      [
        uuidv4(), withdrawal.agent_id, withdrawal.amount, agentRows[0].wallet_balance,
        reason ? `Withdrawal rejected: ${reason}` : "Withdrawal rejected — refunded",
      ]
    );

    await client.query("COMMIT");
    res.json({ status: "rejected" });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(err);
    res.status(500).json({ error: "Something went wrong rejecting this withdrawal" });
  } finally {
    client.release();
  }
});

// Shared refund helper for when an approved transfer fails to even
// initiate with Paystack (network error, bad recipient, etc.) — distinct
// from a webhook-reported transfer FAILURE after it was already
// 'processing', which you should also wire up (see note at bottom of file).
async function refundFailedWithdrawal(withdrawal) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("UPDATE agent_withdrawals SET status = 'failed' WHERE id = $1", [withdrawal.id]);
    const { rows } = await client.query(
      "UPDATE agent_profiles SET wallet_balance = wallet_balance + $1 WHERE user_id = $2 RETURNING wallet_balance",
      [withdrawal.amount, withdrawal.agent_id]
    );
    await client.query(
      `INSERT INTO wallet_transactions (id, user_id, type, amount, balance_after, status, note)
       VALUES ($1, $2, 'withdrawal_refund', $3, $4, 'success', $5)`,
      [uuidv4(), withdrawal.agent_id, withdrawal.amount, rows[0].wallet_balance, "Withdrawal failed to process — refunded"]
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Refund after failed transfer failed:", err.message);
  } finally {
    client.release();
  }
}

// NOTE: for full correctness you should also handle Paystack's
// `transfer.success` / `transfer.failed` webhook events in your existing
// webhooks.js, updating agent_withdrawals.status to 'paid' (set paid_at)
// or calling refundFailedWithdrawal on 'transfer.failed' / 'transfer.reversed'.
// Without that, a withdrawal that Paystack requires OTP for (status
// 'processing' here) will sit in 'processing' until you check it manually
// on the Paystack dashboard.

module.exports = router;
