// Wraps Prembly's "NIN Basic" verification. Written against a real,
// confirmed sandbox response (2026-07-25) — not guessed from docs alone.
//
// COST NOTE: that real sandbox call showed billing_info.was_charged: true,
// amount 50.00 NGN — every single call to this endpoint costs money on your
// Prembly account, whether or not the NIN ends up matching. Worth factoring
// into rate-limiting / abuse-prevention decisions later.

const PREMBLY_API_KEY = process.env.PREMBLY_API_KEY;
const PREMBLY_BASE_URL = process.env.PREMBLY_BASE_URL || "https://api.prembly.com";

function normalize(value) {
  return (value || "").trim().toLowerCase();
}

// Prembly returns birthdate as "DD-MM-YYYY" (confirmed from a real
// response: "23-05-1999"), not "YYYY-MM-DD". Converts it to YYYY-MM-DD so
// it compares directly against the string an HTML <input type="date">
// sends (which is what date_of_birth is, coming from the signup form).
function toIsoDate(ddmmyyyy) {
  const parts = (ddmmyyyy || "").split("-");
  if (parts.length !== 3) return null;
  const [dd, mm, yyyy] = parts;
  return `${yyyy}-${mm}-${dd}`;
}

// firstName/lastName/dateOfBirth are what the agent typed in the signup
// form. Throws on a provider/network failure; returns a plain result
// object for an actual verification outcome, so the caller can tell
// "couldn't check" apart from "checked, and it doesn't match."
async function verifyNIN({ nin, firstName, lastName, dateOfBirth }) {
  if (!PREMBLY_API_KEY) {
    throw new Error("PREMBLY_API_KEY is not set");
  }
  if (!nin || !firstName || !lastName || !dateOfBirth) {
    throw new Error("nin, firstName, lastName, and dateOfBirth are all required");
  }

  const res = await fetch(`${PREMBLY_BASE_URL}/verification/vnin-basic`, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "x-api-key": PREMBLY_API_KEY,
    },
    body: JSON.stringify({ number: nin }),
  });

  let payload;
  try {
    payload = await res.json();
  } catch {
    throw new Error("Unexpected response from the NIN verification provider");
  }

  if (!res.ok || payload.status !== true) {
    throw new Error((payload && payload.message) || "NIN verification request failed");
  }

  const record = payload.data;
  if (!record) {
    return { matched: false, reason: "No record was found for that NIN" };
  }

  const nameMatches =
    normalize(record.firstname) === normalize(firstName) &&
    normalize(record.surname) === normalize(lastName);

  const recordDob = toIsoDate(record.birthdate);
  const dobMatches = recordDob === dateOfBirth;

  if (!nameMatches) return { matched: false, reason: "The name entered does not match the NIN record" };
  if (!dobMatches) return { matched: false, reason: "The date of birth entered does not match the NIN record" };

  return { matched: true, reason: null };
}

module.exports = { verifyNIN };
