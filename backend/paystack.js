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

function requireKey() {
  if (!PAYSTACK_SECRET_KEY) throw new Error("PAYSTACK_SECRET_KEY is not set on the server");
}

// ---------- AGENT WITHDRAWALS (Paystack Transfers) ----------

// List of Nigerian banks Paystack supports, for the bank-selection dropdown
// on the "add withdrawal account" screen. Paystack caches this well, so it's
// safe to call on page load rather than hardcoding a bank list that goes
// stale.
async function listBanks() {
  requireKey();
  const res = await fetch(`${PAYSTACK_BASE}/bank?country=nigeria&currency=NGN`, {
    headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` },
  });
  const data = await res.json();
  if (!data.status) throw new Error(data.message || "Failed to load bank list from Paystack");
  return data.data; // [{ name, code, ... }]
}

// Confirms an account number is real and returns the account's registered
// name, so the agent (and later, the reviewing admin) can see whose account
// this actually is BEFORE any money moves — this is the standard
// name-verification step, not optional.
async function resolveAccountNumber(accountNumber, bankCode) {
  requireKey();
  const res = await fetch(
    `${PAYSTACK_BASE}/bank/resolve?account_number=${encodeURIComponent(accountNumber)}&bank_code=${encodeURIComponent(bankCode)}`,
    { headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` } }
  );
  const data = await res.json();
  if (!data.status) throw new Error(data.message || "Could not verify this account number");
  return data.data; // { account_number, account_name }
}

// A "transfer recipient" is Paystack's stored representation of a
// destination bank account. Created once per agent (or re-created if they
// change their bank details) and reused on every future transfer, rather
// than recreated per withdrawal.
async function createTransferRecipient({ name, accountNumber, bankCode }) {
  requireKey();
  const res = await fetch(`${PAYSTACK_BASE}/transferrecipient`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type: "nuban",
      name,
      account_number: accountNumber,
      bank_code: bankCode,
      currency: "NGN",
    }),
  });
  const data = await res.json();
  if (!data.status) throw new Error(data.message || "Could not save this bank account with Paystack");
  return data.data; // { recipient_code, ... }
}

// Sends money out to a previously-created recipient. Only call this AFTER
// an admin has approved the withdrawal — see routes/withdrawals.js.
// Note: depending on your Paystack account settings, transfers above a
// certain threshold may come back with status "otp" (requiring a one-time
// PIN entered in the Paystack dashboard) instead of completing immediately.
// Disable "OTP for transfers" in Paystack's dashboard settings if you want
// admin-approved transfers to go out without a second manual step.
async function initiateTransfer({ amountNaira, recipientCode, reason, reference }) {
  requireKey();
  const res = await fetch(`${PAYSTACK_BASE}/transfer`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      source: "balance",
      amount: Math.round(amountNaira * 100), // kobo
      recipient: recipientCode,
      reason,
      reference,
    }),
  });
  const data = await res.json();
  if (!data.status) throw new Error(data.message || "Failed to initiate transfer with Paystack");
  return data.data; // { transfer_code, status: 'success'|'otp'|'pending', reference, ... }
}

module.exports = {
  initializeTransaction,
  verifyTransaction,
  verifyWebhookSignature,
  listBanks,
  resolveAccountNumber,
  createTransferRecipient,
  initiateTransfer,
};
