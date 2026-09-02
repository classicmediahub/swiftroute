const express = require("express");
const { v4: uuidv4 } = require("uuid");
const { pool } = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");
const { NETWORKS, isValidNetwork, generateRequestId, getDataVariations, buyAirtime, buyData } = require("../vtpass");

const router = express.Router();

const MIN_AIRTIME = 50;
const MAX_AIRTIME = 50000; // starting ceiling, tune freely — guards against a fat-finger amount before it ever reaches VTpass

router.get("/networks", requireAuth, requireRole("customer"), (req, res) => {
  res.json(Object.entries(NETWORKS).map(([id, n]) => ({ id, label: n.label })));
});

router.get("/data-plans/:network", requireAuth, requireRole("customer"), async (req, res) => {
  if (!isValidNetwork(req.params.network)) return res.status(400).json({ error: "Unknown network" });
  try {
    res.json(await getDataVariations(req.params.network));
  } catch (err) {
    console.error("Load data plans failed:", err.message);
    res.status(502).json({ error: "Couldn't load data plans right now. Try again shortly." });
  }
});

router.get("/mine", requireAuth, requireRole("customer"), async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT * FROM bill_payments WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50",
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong loading your purchase history" });
  }
});

// ---------- BUY AIRTIME ----------
// Same deduct-immediately, refund-on-failure shape as
// routes/withdrawals.js's approve route — the wallet debit and the
// bill_payments row are written BEFORE calling VTpass (inside one
// transaction) so there's always a durable record even if the network
// call to VTpass itself times out or errors before returning.
router.post("/airtime", requireAuth, requireRole("customer"), async (req, res) => {
  const { network, phone, amount } = req.body;
  if (!isValidNetwork(network)) return res.status(400).json({ error: "Select a valid network" });
  if (!phone || !/^\d{11}$/.test(phone)) return res.status(400).json({ error: "Enter a valid 11-digit phone number" });
  const naira = Number(amount);
  if (!Number.isFinite(naira) || naira < MIN_AIRTIME || naira > MAX_AIRTIME) {
    return res.status(400).json({ error: `Enter an amount between ₦${MIN_AIRTIME} and ₦${MAX_AIRTIME.toLocaleString()}` });
  }

  const client = await pool.connect();
  let paymentId, requestId, newBalance, walletTxnId;
  try {
    await client.query("BEGIN");
    const { rows: userRows } = await client.query("SELECT wallet_balance FROM users WHERE id = $1 FOR UPDATE", [req.user.id]);
    const balance = Number(userRows[0].wallet_balance);
    if (balance < naira) {
      await client.query("ROLLBACK");
      return res.status(402).json({ error: `Insufficient balance. You have ₦${balance.toLocaleString()}.` });
    }

    newBalance = balance - naira;
    requestId = generateRequestId();
    paymentId = uuidv4();
    walletTxnId = uuidv4();
    await client.query("UPDATE users SET wallet_balance = $1 WHERE id = $2", [newBalance, req.user.id]);
    await client.query(
      `INSERT INTO bill_payments (id, user_id, type, network, phone, amount, vtpass_request_id, status)
       VALUES ($1,$2,'airtime',$3,$4,$5,$6,'pending')`,
      [paymentId, req.user.id, network, phone, naira, requestId]
    );
    await client.query(
      `INSERT INTO wallet_transactions (id, user_id, type, amount, balance_after, status, note)
       VALUES ($1,$2,'airtime_purchase',$3,$4,'pending',$5)`,
      [walletTxnId, req.user.id, -naira, newBalance, `₦${naira} ${NETWORKS[network].label} airtime to ${phone}`]
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Airtime request setup failed:", err.message);
    return res.status(500).json({ error: "Something went wrong starting this purchase" });
  } finally {
    client.release();
  }

  try {
    const { status } = await buyAirtime({ network, phone, amount: naira, requestId });
    await pool.query("UPDATE bill_payments SET status = $1 WHERE id = $2", [status === "delivered" ? "delivered" : status, paymentId]);
    if (status === "delivered") {
      await pool.query("UPDATE wallet_transactions SET status = 'success' WHERE id = $1", [walletTxnId]);
      return res.json({ status: "delivered", balance: newBalance });
    }
    if (status === "pending") {
      // Stays 'pending' in both tables — VTpass itself hasn't confirmed
      // either way yet. See vtpass.js's queryTransactionStatus for how a
      // background job could later resolve this; not wired up
      // automatically here to keep this change scoped to the purchase
      // flow itself.
      return res.json({ status: "pending", balance: newBalance, message: "Your purchase is processing — check back shortly." });
    }
    throw new Error("VTpass reported this purchase failed");
  } catch (err) {
    console.error("VTpass airtime purchase failed:", err.message);
    await refundBillPayment(paymentId, req.user.id, naira, `Airtime purchase failed \u2014 refunded (${phone})`);
    return res.status(502).json({ error: "The airtime purchase failed. You've been refunded." });
  }
});

// ---------- BUY DATA ----------
// Same shape as airtime above, except the amount is never trusted from
// the client — it's re-derived from a fresh getDataVariations() call
// using the submitted variation_code, so a tampered or stale client-side
// price can never be charged.
router.post("/data", requireAuth, requireRole("customer"), async (req, res) => {
  const { network, phone, variation_code } = req.body;
  if (!isValidNetwork(network)) return res.status(400).json({ error: "Select a valid network" });
  if (!phone || !/^\d{11}$/.test(phone)) return res.status(400).json({ error: "Enter a valid 11-digit phone number" });
  if (!variation_code) return res.status(400).json({ error: "Select a data plan" });

  let plan;
  try {
    const plans = await getDataVariations(network);
    plan = plans.find((p) => p.code === variation_code);
    if (!plan) return res.status(400).json({ error: "That plan isn't available right now — refresh and try again." });
  } catch (err) {
    console.error("Load data plans failed:", err.message);
    return res.status(502).json({ error: "Couldn't verify this plan's price right now. Try again shortly." });
  }

  const client = await pool.connect();
  let paymentId, requestId, newBalance, walletTxnId;
  try {
    await client.query("BEGIN");
    const { rows: userRows } = await client.query("SELECT wallet_balance FROM users WHERE id = $1 FOR UPDATE", [req.user.id]);
    const balance = Number(userRows[0].wallet_balance);
    if (balance < plan.amount) {
      await client.query("ROLLBACK");
      return res.status(402).json({ error: `Insufficient balance. You have ₦${balance.toLocaleString()}.` });
    }

    newBalance = balance - plan.amount;
    requestId = generateRequestId();
    paymentId = uuidv4();
    walletTxnId = uuidv4();
    await client.query("UPDATE users SET wallet_balance = $1 WHERE id = $2", [newBalance, req.user.id]);
    await client.query(
      `INSERT INTO bill_payments (id, user_id, type, network, phone, amount, variation_code, variation_name, vtpass_request_id, status)
       VALUES ($1,$2,'data',$3,$4,$5,$6,$7,$8,'pending')`,
      [paymentId, req.user.id, network, phone, plan.amount, plan.code, plan.name, requestId]
    );
    await client.query(
      `INSERT INTO wallet_transactions (id, user_id, type, amount, balance_after, status, note)
       VALUES ($1,$2,'data_purchase',$3,$4,'pending',$5)`,
      [walletTxnId, req.user.id, -plan.amount, newBalance, `${plan.name} (${NETWORKS[network].label}) to ${phone}`]
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Data purchase setup failed:", err.message);
    return res.status(500).json({ error: "Something went wrong starting this purchase" });
  } finally {
    client.release();
  }

  try {
    const { status } = await buyData({ network, phone, variationCode: variation_code, requestId });
    await pool.query("UPDATE bill_payments SET status = $1 WHERE id = $2", [status === "delivered" ? "delivered" : status, paymentId]);
    if (status === "delivered") {
      await pool.query("UPDATE wallet_transactions SET status = 'success' WHERE id = $1", [walletTxnId]);
      return res.json({ status: "delivered", balance: newBalance });
    }
    if (status === "pending") {
      return res.json({ status: "pending", balance: newBalance, message: "Your purchase is processing — check back shortly." });
    }
    throw new Error("VTpass reported this purchase failed");
  } catch (err) {
    console.error("VTpass data purchase failed:", err.message);
    await refundBillPayment(paymentId, req.user.id, plan.amount, `Data purchase failed \u2014 refunded (${phone})`);
    return res.status(502).json({ error: "The data purchase failed. You've been refunded." });
  }
});

async function refundBillPayment(paymentId, userId, amount, note) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("UPDATE bill_payments SET status = 'failed' WHERE id = $1", [paymentId]);
    const { rows } = await client.query(
      "UPDATE users SET wallet_balance = wallet_balance + $1 WHERE id = $2 RETURNING wallet_balance",
      [amount, userId]
    );
    await client.query(
      `INSERT INTO wallet_transactions (id, user_id, type, amount, balance_after, status, note)
       VALUES ($1,$2,'refund',$3,$4,'success',$5)`,
      [uuidv4(), userId, amount, rows[0].wallet_balance, note]
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Bill payment refund failed:", err.message);
  } finally {
    client.release();
  }
}

module.exports = router;
