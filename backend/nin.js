// Format-only NIN validation — no external provider, no API key, no
// per-call cost.
//
// IMPORTANT — read before relying on this: this does NOT confirm a NIN is
// real, active, or belongs to the person entering it. It only confirms the
// number is well-formed and rejects obviously-fake patterns. Actual identity
// confirmation against Nigeria's national ID database only exists through
// NIMC directly or a NIMC-licensed reseller (Prembly, Youverify, VerifyMe,
// Smile ID, Dojah, etc.) — there is no independent way to check a NIN is
// real. If PickAndEarn ever needs that stronger guarantee (e.g. after an
// incident, or once volume justifies the per-call cost), swap this module
// out — the { matched, reason } return shape is designed to make that a
// drop-in change in routes/auth.js, no caller changes needed.

// Catches lazy fake entries like "00000000000" or "11111111111".
function isRepeatedDigit(nin) {
  return /^(\d)\1{10}$/.test(nin);
}

// Catches "01234567891" / "98765432109" style keyboard-mashed sequences.
// Checks both ascending and descending runs, wrapping 9->0 and 0->9 since
// that's still an obviously-fake pattern, not a coincidence.
function isSequential(nin) {
  const digits = nin.split("").map(Number);
  let ascending = true;
  let descending = true;
  for (let i = 1; i < digits.length; i++) {
    if (digits[i] !== (digits[i - 1] + 1) % 10) ascending = false;
    if (digits[i] !== (digits[i - 1] + 9) % 10) descending = false;
  }
  return ascending || descending;
}

// Kept async and kept the same argument names as the old Prembly-backed
// version so routes/auth.js doesn't need to change at all. firstName/
// lastName are accepted but unused now — there's no record to match a name
// against without an external data source.
async function verifyNIN({ nin, dateOfBirth }) {
  if (!nin) {
    return { matched: false, reason: "NIN is required" };
  }
  const cleaned = String(nin).trim();

  if (!/^\d{11}$/.test(cleaned)) {
    return { matched: false, reason: "NIN must be exactly 11 digits" };
  }
  if (isRepeatedDigit(cleaned) || isSequential(cleaned)) {
    return { matched: false, reason: "That doesn't look like a valid NIN" };
  }

  if (dateOfBirth) {
    const dob = new Date(dateOfBirth);
    const ageYears = (Date.now() - dob.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
    if (Number.isNaN(dob.getTime()) || ageYears < 16 || ageYears > 110) {
      return { matched: false, reason: "Date of birth doesn't look valid" };
    }
  }

  return { matched: true, reason: null, verificationMethod: "format_only" };
}

module.exports = { verifyNIN };
