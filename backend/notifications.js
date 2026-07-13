const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RESEND_FROM = process.env.RESEND_FROM_EMAIL || "PickAndEarn <onboarding@resend.dev>";

const TERMII_API_KEY = process.env.TERMII_API_KEY;
const TERMII_SENDER_ID = process.env.TERMII_SENDER_ID || "Termii";
const TERMII_BASE = "https://api.ng.termii.com/api";

// Converts common Nigerian phone formats ("0801...", "+234801...", "234801...",
// with or without spaces/dashes) into the "234801..." shape Termii expects.
function normalizeNigerianPhone(raw) {
  if (!raw) return null;
  const digits = raw.replace(/[^\d]/g, "");
  if (digits.startsWith("234")) return digits;
  if (digits.startsWith("0")) return "234" + digits.slice(1);
  if (digits.length === 10) return "234" + digits;
  return digits;
}

async function sendEmail({ to, subject, html }) {
  if (!RESEND_API_KEY) {
    console.warn("RESEND_API_KEY not set — skipping email notification");
    return;
  }
  if (!to) return;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: RESEND_FROM, to: [to], subject, html }),
    });
    if (!res.ok) {
      console.error("Resend email failed:", res.status, await res.text());
    }
  } catch (err) {
    console.error("Resend email error:", err.message);
  }
}

async function sendSMS({ to, message }) {
  if (!TERMII_API_KEY) {
    console.warn("TERMII_API_KEY not set — skipping SMS notification");
    return;
  }
  const phone = normalizeNigerianPhone(to);
  if (!phone) return;
  try {
    const res = await fetch(`${TERMII_BASE}/sms/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: TERMII_API_KEY,
        to: phone,
        from: TERMII_SENDER_ID,
        sms: message,
        type: "plain",
        // "dnd" is Termii's transactional route — required for non-promotional
        // messages like delivery updates, and bypasses Nigeria's Do-Not-Disturb
        // registry that would otherwise silently drop the generic route.
        channel: "dnd",
      }),
    });
    const data = await res.json();
    if (data.code !== "ok") {
      console.error("Termii SMS failed:", data);
    }
  } catch (err) {
    console.error("Termii SMS error:", err.message);
  }
}

module.exports = { sendEmail, sendSMS, normalizeNigerianPhone };
