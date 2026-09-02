// ---------- VTPASS INTEGRATION — airtime and data bundle purchases.
// Docs: https://vtpass.com/documentation/
//
// Auth: POST requests need `api-key` + `secret-key` headers; GET requests
// need `api-key` + `public-key` — different key pairs per VTpass's own
// design, not a typo. Sandbox and live are entirely separate accounts
// with separate keys, switched here via VTPASS_ENV so you can test safely
// before pointing this at real money.
const VTPASS_ENV = process.env.VTPASS_ENV === "live" ? "live" : "sandbox";
const VTPASS_BASE = VTPASS_ENV === "live" ? "https://vtpass.com/api" : "https://sandbox.vtpass.com/api";

const VTPASS_API_KEY = process.env.VTPASS_API_KEY;
const VTPASS_SECRET_KEY = process.env.VTPASS_SECRET_KEY;
const VTPASS_PUBLIC_KEY = process.env.VTPASS_PUBLIC_KEY;

// Networks VTpass recognizes as distinct serviceIDs — the customer picks
// one explicitly in the UI rather than us guessing from phone prefix,
// since number portability makes prefix-based network detection
// unreliable (someone can carry an old MTN number onto Glo, etc.).
const NETWORKS = {
  mtn: { label: "MTN", airtimeServiceId: "mtn", dataServiceId: "mtn-data" },
  glo: { label: "Glo", airtimeServiceId: "glo", dataServiceId: "glo-data" },
  airtel: { label: "Airtel", airtimeServiceId: "airtel", dataServiceId: "airtel-data" },
  "9mobile": { label: "9mobile", airtimeServiceId: "etisalat", dataServiceId: "etisalat-data" },
};

function isValidNetwork(network) {
  return Object.prototype.hasOwnProperty.call(NETWORKS, network);
}

// VTpass requires: 12+ chars, first 12 numeric, and those first 12 must
// be today's date+time (YYYYMMDDHHII) in Africa/Lagos time — not just any
// timestamp. Built directly from Intl parts rather than toISOString()
// (which is always UTC) to avoid a subtle off-by-one-hour bug around
// midnight Lagos time on a server running in a different timezone.
function generateRequestId() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Lagos",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const get = (type) => parts.find((p) => p.type === type).value;
  const stamp = `${get("year")}${get("month")}${get("day")}${get("hour")}${get("minute")}`;
  const suffix = Math.random().toString(36).slice(2, 10);
  return `${stamp}${suffix}`;
}

function requireKeysConfigured() {
  if (!VTPASS_API_KEY || !VTPASS_SECRET_KEY || !VTPASS_PUBLIC_KEY) {
    throw new Error("VTPASS_API_KEY, VTPASS_SECRET_KEY and VTPASS_PUBLIC_KEY must all be set");
  }
}

async function vtpassGet(path) {
  requireKeysConfigured();
  const res = await fetch(`${VTPASS_BASE}${path}`, {
    headers: { "api-key": VTPASS_API_KEY, "public-key": VTPASS_PUBLIC_KEY },
  });
  if (!res.ok) throw new Error(`VTpass request failed: ${res.status}`);
  return res.json();
}

async function vtpassPost(path, body) {
  requireKeysConfigured();
  const res = await fetch(`${VTPASS_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": VTPASS_API_KEY,
      "secret-key": VTPASS_SECRET_KEY,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`VTpass request failed: ${res.status}`);
  return res.json();
}

// Returns the data bundle plans VTpass currently offers for a network,
// with prices exactly as VTpass defines them — never hardcoded here,
// since these change over time and a stale local copy would eventually
// quote a wrong price.
async function getDataVariations(network) {
  if (!isValidNetwork(network)) throw new Error("Unknown network");
  const data = await vtpassGet(`/service-variations?serviceID=${NETWORKS[network].dataServiceId}`);
  const variations = data?.content?.variations || [];
  return variations.map((v) => ({
    code: v.variation_code,
    name: v.name,
    amount: Number(v.variation_amount),
  }));
}

// A transaction can come back as delivered, pending (needs a later
// requery — see queryTransactionStatus), or failed. Callers must branch
// on this rather than assuming a 200-ish HTTP response means success;
// VTpass returns 200 for pending and some failure cases too.
function interpretResult(result) {
  const status = result?.content?.transactions?.status;
  if (status === "delivered") return "delivered";
  if (status === "pending") return "pending";
  return "failed";
}

async function buyAirtime({ network, phone, amount, requestId }) {
  if (!isValidNetwork(network)) throw new Error("Unknown network");
  const result = await vtpassPost("/pay", {
    request_id: requestId || generateRequestId(),
    serviceID: NETWORKS[network].airtimeServiceId,
    amount,
    phone,
  });
  return { result, status: interpretResult(result) };
}

async function buyData({ network, phone, variationCode, requestId }) {
  if (!isValidNetwork(network)) throw new Error("Unknown network");
  const result = await vtpassPost("/pay", {
    request_id: requestId || generateRequestId(),
    serviceID: NETWORKS[network].dataServiceId,
    billersCode: phone,
    variation_code: variationCode,
    phone,
  });
  return { result, status: interpretResult(result) };
}

// For a transaction that came back "pending" — check back later to find
// out whether it actually delivered or ultimately failed, per VTpass's
// own documented flow. Not wired into an automatic retry loop here; see
// routes/bills.js's note on where this would plug in.
async function queryTransactionStatus(requestId) {
  const result = await vtpassPost("/requery", { request_id: requestId });
  return { result, status: interpretResult(result) };
}

module.exports = {
  NETWORKS, isValidNetwork, generateRequestId,
  getDataVariations, buyAirtime, buyData, queryTransactionStatus,
  VTPASS_ENV,
};
