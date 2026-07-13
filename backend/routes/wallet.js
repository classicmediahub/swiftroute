const express = require("express");
const { v4: uuidv4 } = require("uuid");
const { pool } = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");
const { initializeTransaction, verifyTransaction } = require("../paystack");

const router = express.Router();

function walletReference() {
  return `PAEWALLET-${uuidv4().replace(/-/g, "").slice(0, 20).toUpperCase()}`;
}

function callbackUrl() {
  const base = process.env.FRONTEND_URL || "http://localhost:5173";
  return `${base.replace(/\/$/, "")}/wallet/callback`;
}

// ---------- WALLET OVERVIEW (balance + recent history) ----------
router.get("/", requireAuth, requireRole("customer"), async (req, res) => {
  try {
    const { rows: userRows } = await pool.query("SELECT wallet_balance FROM users WHERE id = $1", [req.user.id]);
    const { rows: transactions } = await pool.query(
      `SELECT * FROM wallet_transactions WHERE user_id = $1 AND status != 'pending' ORDER BY created_at DESC LIMIT 50`,
      [req.user.id]
    );
    res.json({ balance: userRows[0].wallet_balance, transactions });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong loading your wallet" });
  }
});

// ---------- FUND WALLET (start a Paystack top-up) ----------
router.post("/fund", requireAuth, requireRole("customer"), async (req, res) => {
  try {
    const amount = Number(req.body.amount);
    if (!Number.isFinite(amount) || amount < 100) {
      return res.status(400).json({ error: "Enter a valid amount (minimum ₦100)" });
    }

    const reference = walletReference();
    const id = uuidv4();
    await pool.query(
      `INSERT INTO wallet_transactions (id, user_id, type, amount, balance_after, status, reference)
       VALUES ($1, $2, 'topup', $3, 0, 'pending', $4)`,
      [id, req.user.id, amount, reference]
    );

    const paystackData = await initializeTransaction({
      email: req.user.email,
      amountNaira: amount,
      reference,
      callback_url: callbackUrl(),
      metadata: { type: "wallet_topup", user_id: req.user.id },
    });

    res.json({ authorization_url: paystackData.authorization_url });
  } catch (err) {
    console.error("Wallet fund init failed:", err.message);
    res.status(502).json({ error: "We couldn't start the top-up right now. Please try again." });
  }
});

// ---------- VERIFY A TOP-UP (called by the frontend after Paystack redirects back) ----------
router.get("/verify/:reference", requireAuth, requireRole("customer"), async (req, res) => {
  const client = await pool.connect();
  try {
    const { rows } = await client.query("SELECT * FROM wallet_transactions WHERE reference = $1", [req.params.reference]);
    const txn = rows[0];
    if (!txn) return res.status(404).json({ error: "No top-up found for this reference" });
    if (txn.user_id !== req.user.id) return res.status(403).json({ error: "Not your transaction" });

    if (txn.status === "success") {
      const { rows: userRows } = await pool.query("SELECT wallet_balance FROM users WHERE id = $1", [req.user.id]);
      return res.json({ status: "success", balance: userRows[0].wallet_balance });
    }
    if (txn.status === "failed") {
      return res.json({ status: "failed" });
    }

    const paystackTxn = await verifyTransaction(req.params.reference);

    if (paystackTxn.status === "success") {
      await client.query("BEGIN");
      const { rows: userRows } = await client.query("SELECT wallet_balance FROM users WHERE id = $1 FOR UPDATE", [req.user.id]);
      const newBalance = Number(userRows[0].wallet_balance) + Number(txn.amount);
      await client.query("UPDATE users SET wallet_balance = $1 WHERE id = $2", [newBalance, req.user.id]);
      await client.query(
        "UPDATE wallet_transactions SET status = 'success', balance_after = $1 WHERE id = $2 AND status = 'pending'",
        [newBalance, txn.id]
      );
      await client.query("COMMIT");
      return res.json({ status: "success", balance: newBalance });
    } else {
      await client.query("UPDATE wallet_transactions SET status = 'failed' WHERE id = $1", [txn.id]);
      return res.json({ status: "failed" });
    }
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(err);
    res.status(500).json({ error: "Something went wrong verifying your top-up" });
  } finally {
    client.release();
  }
});

module.exports = router;
