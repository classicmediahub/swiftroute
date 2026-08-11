const { getAgentReputation } = require("./reputation");

// ---------- ELITE AGENTS — a premium delivery option. Qualification is
// computed on demand from the exact same numbers a customer already sees
// on an agent's public reputation card (see reputation.js), never a
// separately-maintained flag that could silently drift out of sync with
// an agent's real recent performance.
//
// MIN_DELIVERIES exists specifically to stop a brand-new agent with a
// tiny sample (say, 3 deliveries, all on time) from qualifying on a
// lucky streak — the bar is about sustained reliability, not a perfect
// but statistically meaningless short run.
const ELITE_MIN_RATING = 4.8;
const ELITE_MIN_ON_TIME_RATE = 95; // percent, over reputation.js's ON_TIME_WINDOW_DAYS
const ELITE_MIN_DELIVERIES = 20;
const ELITE_FEE = 400; // starting number, tune freely — same spirit as pricing.js/guarantee.js

async function isEliteAgent(agentId) {
  const rep = await getAgentReputation(agentId);
  if (!rep) return false;
  if (rep.total_deliveries < ELITE_MIN_DELIVERIES) return false;
  if (rep.rating < ELITE_MIN_RATING) return false;
  // on_time_rate is null when there's nothing measurable yet (reputation.js) —
  // treated as not-yet-qualifying rather than an error, since a null rate
  // says "we don't know," not "we know it's good."
  if (rep.on_time_rate == null || rep.on_time_rate < ELITE_MIN_ON_TIME_RATE) return false;
  return true;
}

module.exports = { isEliteAgent, ELITE_MIN_RATING, ELITE_MIN_ON_TIME_RATE, ELITE_MIN_DELIVERIES, ELITE_FEE };
