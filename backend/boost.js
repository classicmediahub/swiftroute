// ---------- JOB BOOST — early access to newly-paid jobs for agents who've
// turned it on (agent_profiles.boost_enabled), charged per-job rather than
// as a subscription. Deliberately simple: no session/timer to manage, no
// upfront risk to the agent — the fee only ever gets taken at the moment
// it actually won them something (claiming before the public window
// opened). Starting numbers, not researched ones — tune freely, same
// spirit as pricing.js/guarantee.js/elite.js.
const JOB_BOOST_FEE = 150;
const BOOST_WINDOW_SECONDS = 60;

// True for the first BOOST_WINDOW_SECONDS after a job became available —
// this is both what gates a non-boosted agent's visibility in /available
// AND what decides whether an accept gets charged the fee. Using the
// delivery's own created_at as the anchor rather than a separate
// "became available at" timestamp is a deliberate simplification: it
// means the window technically starts at creation, not the moment
// payment clears, so a delivery that takes a while to get paid effectively
// skips its boost window by the time agents can see it at all. Accepted
// for v1 — most payments confirm within seconds, and the failure mode
// (boost window quietly not applying) is harmless, not broken.
function isWithinBoostWindow(delivery) {
  return Date.now() - new Date(delivery.created_at).getTime() < BOOST_WINDOW_SECONDS * 1000;
}

function boostSecondsRemaining(delivery) {
  const elapsedMs = Date.now() - new Date(delivery.created_at).getTime();
  return Math.max(0, Math.ceil((BOOST_WINDOW_SECONDS * 1000 - elapsedMs) / 1000));
}

module.exports = { JOB_BOOST_FEE, BOOST_WINDOW_SECONDS, isWithinBoostWindow, boostSecondsRemaining };
