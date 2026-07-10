const crypto = require("crypto");

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
const PAYSTACK_BASE = "https://api.paystack.co";

async function initializeTransaction({ email, amountNaira, reference, callback_url, metadata }) {
  if (!PAYSTACK_SECRET_KEY) {
    throw new Error("PAYSTACK_SECRET_KEY is not set on the server");
  }
  const res = await fetch(`${PAYSTACK_BASE}/transaction/initialize`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      amount: Math.round(amountNaira * 100), // Paystack expects kobo, not naira
      reference,
      callback_url,
      currency: "NGN",
      metadata,
    }),
  });
  const data = await res.json();
  if (!data.status) {
    throw new Error(data.message || "Failed to initialize payment with Paystack");
  }
  return data.data; // { authorization_url, access_code, reference }
}

async function verifyTransaction(reference) {
  if (!PAYSTACK_SECRET_KEY) {
    throw new Error("PAYSTACK_SECRET_KEY is not set on the server");
  }
  const res = await fetch(`${PAYSTACK_BASE}/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` },
  });
  const data = await res.json();
  if (!data.status) {
    throw new Error(data.message || "Failed to verify payment with Paystack");
  }
  return data.data; // { status: 'success' | 'failed' | 'abandoned', amount, reference, ... }
}

// Confirms a webhook request really came from Paystack by recomputing the
// signature with our secret key and comparing it to the one they sent.
function verifyWebhookSignature(rawBody, signature) {
  if (!PAYSTACK_SECRET_KEY || !signature) return false;
  const hash = crypto.createHmac("sha512", PAYSTACK_SECRET_KEY).update(rawBody).digest("hex");
  return hash === signature;
}

module.exports = { initializeTransaction, verifyTransaction, verifyWebhookSignature };
