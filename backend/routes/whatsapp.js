const express = require("express");
const twilio = require("twilio");
const { handleIncomingMessage } = require("../whatsapp");

const router = express.Router();
const AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;

// Twilio POSTs application/x-www-form-urlencoded, not JSON — server.js's
// global express.json() only acts on matching Content-Type and leaves
// this alone, so a route-local urlencoded parser here is enough (no need
// for the raw-body special case webhooks.js uses for Paystack, since this
// doesn't need exact original bytes — just correctly parsed fields).
router.post("/webhook", express.urlencoded({ extended: false }), async (req, res) => {
  // Confirms the request genuinely came from Twilio, not a spoofed POST to
  // this public URL. Skipped only when TWILIO_AUTH_TOKEN isn't set yet —
  // lets the bot be tested end-to-end before that env var is configured,
  // rather than blocking setup on it from day one. Add TWILIO_AUTH_TOKEN
  // as soon as convenient; this check activates itself automatically.
  if (AUTH_TOKEN) {
    const signature = req.headers["x-twilio-signature"];
    const url = `${req.protocol}://${req.get("host")}${req.originalUrl}`;
    const valid = twilio.validateRequest(AUTH_TOKEN, signature, url, req.body);
    if (!valid) return res.status(403).send("Invalid signature");
  }

  let replyText;
  try {
    replyText = await handleIncomingMessage(req.body.From, req.body.Body);
  } catch (err) {
    console.error("WhatsApp webhook handler failed:", err);
    replyText = "Sorry, something went wrong. Please try again in a moment.";
  }

  const twiml = new twilio.twiml.MessagingResponse();
  twiml.message(replyText);
  res.type("text/xml").send(twiml.toString());
});

module.exports = router;
