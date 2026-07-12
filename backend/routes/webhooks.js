const express = require("express");
const { v4: uuidv4 } = require("uuid");
const { pool } = require("../db");
const { verifyWebhookSignature } = require("../paystack");
const { notifyCustomer } = require("../notify");

const router = express.Router();

// This exists as a safety net alongside the /verify/:reference endpoint the
// frontend calls after checkout. If a customer pays but closes the tab
// before the redirect completes, this webhook is what still marks the
// delivery paid — otherwise they'd have paid with nothing to show for it.
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
      const { rows } = await pool.query("SELECT * FROM deliveries WHERE paystack_reference = $1", [reference]);
      const delivery = rows[0];
      if (delivery && delivery.payment_status !== "paid") {
        await pool.query("UPDATE deliveries SET payment_status = 'paid' WHERE id = $1", [delivery.id]);
        await pool.query(
          `INSERT INTO delivery_events (id, delivery_id, status, note) VALUES ($1, $2, $3, $4)`,
          [uuidv4(), delivery.id, "payment_confirmed", "Payment confirmed via Paystack webhook"]
        );
        notifyCustomer(delivery, "payment_confirmed"); // fire-and-forget
      }
    } catch (err) {
      console.error("Paystack webhook processing error:", err);
      // Still acknowledge receipt so Paystack doesn't keep retrying a
      // payload we can't process; the error is logged for investigation.
    }
  }

  res.sendStatus(200);
});

module.exports = router;
