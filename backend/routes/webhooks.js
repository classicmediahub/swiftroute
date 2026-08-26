const express = require("express");
const { v4: uuidv4 } = require("uuid");
const { pool } = require("../db");
const { verifyWebhookSignature } = require("../paystack");
const { notifyCustomer, notifyWebhook, notifyRideCustomer } = require("../notify");
const { refundFailedWithdrawal } = require("./withdrawals");

const router = express.Router();

// This exists as a safety net alongside the /verify/:reference endpoints
// the frontend calls after checkout. If a customer pays but closes the tab
// before the redirect completes, this webhook is what still marks the
// delivery/ride paid — otherwise they'd have paid with nothing to show for it.
//
// IMPORTANT: this route needs the raw request body (not JSON-parsed) to
// check the signature, so it's mounted before express.json() in server.js.
router.post("/paystack", async (req, res) => {
  const signature = req.headers["x-paystack-signature"];
  if (!verifyWebhookSignature(req.body, signature)) {
    return res.status(401).send("Invalid signature");
  }

  let event;
  try {
    event = JSON.parse(req.body.toString("utf8"));
  } catch {
    return res.status(400).send("Bad payload");
  }

  if (event.event === "charge.success") {
    const reference = event.data && event.data.reference;
    try {
      if (reference && reference.startsWith("PAEWALLET-")) {
        await confirmWalletTopup(reference);
      } else if (reference && reference.startsWith("PAERIDE-")) {
        await confirmRidePayment(reference);
      } else {
        await confirmDeliveryPayment(reference);
      }
    } catch (err) {
      console.error("Paystack webhook processing error:", err);
      // Still acknowledge receipt so Paystack doesn't keep retrying a
      // payload we can't process; the error is logged for investigation.
    }
  } else if (event.event === "transfer.success") {
    try {
      await confirmWithdrawalPaid(event.data && event.data.reference);
    } catch (err) {
      console.error("Paystack transfer.success webhook error:", err);
    }
  } else if (event.event === "transfer.failed" || event.event === "transfer.reversed") {
    // Same handling either way: money never reached (or was reversed back
    // from) the agent's bank, so refund their in-app balance. This is the
    // ONLY place a withdrawal that needed OTP approval, or that Paystack
    // rejected after the fact, gets resolved — the admin-approve route
    // only handles the immediate "failed to even initiate" case.
    try {
      await failOrReverseWithdrawal(event.data && event.data.reference);
    } catch (err) {
      console.error(`Paystack ${event.event} webhook error:`, err);
    }
  }

  res.sendStatus(200);
});

async function confirmDeliveryPayment(reference) {
  const { rows } = await pool.query("SELECT * FROM deliveries WHERE paystack_reference = $1", [reference]);
  const delivery = rows[0];
  if (delivery && delivery.payment_status !== "paid") {
    await pool.query("UPDATE deliveries SET payment_status = 'paid' WHERE id = $1", [delivery.id]);
    await pool.query(
      `INSERT INTO delivery_events (id, delivery_id, status, note) VALUES ($1, $2, $3, $4)`,
      [uuidv4(), delivery.id, "payment_confirmed", "Payment confirmed via Paystack webhook"]
    );
    notifyCustomer(delivery, "payment_confirmed"); // fire-and-forget
    notifyWebhook(delivery, "payment_confirmed"); // fire-and-forget
  }
}

// No delivery_events-equivalent table for rides — the frontend's "My
// rides" list polls the ride row directly, so status history isn't
// separately logged anywhere. Notifications ARE wired (notifyRideCustomer,
// see notify.js) — this webhook path covers the case where the customer
// closes the tab before the frontend's own verify call fires.
async function confirmRidePayment(reference) {
  const { rows } = await pool.query("SELECT * FROM rides WHERE paystack_reference = $1", [reference]);
  const ride = rows[0];
  if (ride && ride.payment_status !== "paid") {
    await pool.query("UPDATE rides SET payment_status = 'paid' WHERE id = $1", [ride.id]);
    const { rows: updated } = await pool.query("SELECT * FROM rides WHERE id = $1", [ride.id]);
    notifyRideCustomer(updated[0], "payment_confirmed"); // fire-and-forget
  }
}

async function confirmWalletTopup(reference) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query("SELECT * FROM wallet_transactions WHERE reference = $1 FOR UPDATE", [reference]);
    const txn = rows[0];
    if (txn && txn.status === "pending") {
      const { rows: userRows } = await client.query("SELECT wallet_balance FROM users WHERE id = $1 FOR UPDATE", [txn.user_id]);
      const newBalance = Number(userRows[0].wallet_balance) + Number(txn.amount);
      await client.query("UPDATE users SET wallet_balance = $1 WHERE id = $2", [newBalance, txn.user_id]);
      await client.query("UPDATE wallet_transactions SET status = 'success', balance_after = $1 WHERE id = $2", [newBalance, txn.id]);
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// ---------- AGENT WITHDRAWALS (Paystack Transfers) ----------
// These two cover the async/OTP cases that routes/withdrawals.js's
// admin-approve route can't resolve synchronously — see the note at the
// bottom of that file. Both are idempotent against repeat webhook
// deliveries: they only act when the withdrawal is still 'processing'.

async function confirmWithdrawalPaid(reference) {
  if (!reference) return;
  const { rows } = await pool.query("SELECT * FROM agent_withdrawals WHERE paystack_reference = $1", [reference]);
  const withdrawal = rows[0];
  if (withdrawal && withdrawal.status === "processing") {
    await pool.query("UPDATE agent_withdrawals SET status = 'paid', paid_at = now() WHERE id = $1", [withdrawal.id]);
  }
}

async function failOrReverseWithdrawal(reference) {
  if (!reference) return;
  const { rows } = await pool.query("SELECT * FROM agent_withdrawals WHERE paystack_reference = $1", [reference]);
  const withdrawal = rows[0];
  if (withdrawal && withdrawal.status === "processing") {
    await refundFailedWithdrawal(withdrawal);
  }
}

module.exports = router;
