// Wraps Youverify's NIN lookup + match check, mirroring face.js's pattern:
// one function that does the external call and returns a simple
// { matched, reason } result, so auth.js doesn't need to know
// provider-specific request/response details.
//
// IMPORTANT: this was written from Youverify's published documentation,
// not a live tested account. Before going to production, log into your
// actual Youverify dashboard and confirm the exact endpoint path, the auth
// header name, and the request body shape still match what's below —
// provider API contracts do shift over time.

const YOUVERIFY_API_KEY = process.env.YOUVERIFY_API_KEY;
const YOUVERIFY_BASE_URL = process.env.YOUVERIFY_BASE_URL || "https://api.sandbox.youverify.co";

function normalize(value) {
  return (value || "").trim().toLowerCase();
}

// firstName/lastName/dateOfBirth are what the agent typed in the signup
// form; dateOfBirth is expected as "YYYY-MM-DD" (what an <input type="date">
// sends). Throws on a provider/network failure; returns a plain result
// object for an actual verification outcome (found-but-mismatched, or
// not-found), so the caller can tell "couldn't check" apart from "checked,
// and it doesn't match."
async function verifyNIN({ nin, firstName, lastName, dateOfBirth }) {
  if (!YOUVERIFY_API_KEY) {
    throw new Error("YOUVERIFY_API_KEY is not set");
  }
  if (!nin || !firstName || !lastName || !dateOfBirth) {
    throw new Error("nin, firstName, lastName, and dateOfBirth are all required");
  }

  const res = await fetch(`${YOUVERIFY_BASE_URL}/v2/api/identity/ng/nin`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      token: YOUVERIFY_API_KEY,
    },
    body: JSON.stringify({
      id: nin,
      isSubjectConsent: true,
    }),
  });

  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error("Unexpected response from the NIN verification provider");
  }

  if (!res.ok || data.success === false) {
    throw new Error(data?.message || "NIN verification request failed");
  }

  const record = data.data;
  if (!record || record.status !== "found") {
    return { matched: false, reason: "No record was found for that NIN" };
  }

  const nameMatches =
    normalize(record.firstName) === normalize(firstName) &&
    normalize(record.lastName) === normalize(lastName);
  const dobMatches = record.dateOfBirth ? record.dateOfBirth.slice(0, 10) === dateOfBirth : false;

  if (!nameMatches) return { matched: false, reason: "The name entered does not match the NIN record" };
  if (!dobMatches) return { matched: false, reason: "The date of birth entered does not match the NIN record" };

  return { matched: true, reason: null };
}

module.exports = { verifyNIN };
