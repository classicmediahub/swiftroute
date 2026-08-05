// ---------- ETA / on-time window — used only to compute
// deliveries.estimated_delivery_at at creation time (see routes/deliveries.js),
// which agent reputation profiles later compare against actual delivered_at
// (see reputation.js). This is NOT the customer-facing price/distance
// estimate (that's quote.js) — it's purely an internal SLA clock.
//
// Average speeds account for real Nigerian urban traffic, not open-road
// speed — deliberately conservative so agents aren't penalized for normal
// traffic, only genuine lateness. Starting numbers, not researched ones,
// same spirit as pricing.js/streaks.js — tune once real completion times
// come in.
const AVG_SPEED_KMH = { self: 4, bike: 22, cab: 18, any: 18 };
const PREP_BUFFER_MIN = 12;    // time to accept + start moving, before travel even begins
const SLACK_MULTIPLIER = 1.35; // extra cushion so estimates aren't a hair-trigger for "late"
const NO_DISTANCE_FALLBACK_MIN = 90; // used only when distanceKm is unknown (flat-fallback quotes)

function estimateDeliveryMinutes({ distanceKm, vehicle_type }) {
  if (distanceKm == null || Number.isNaN(distanceKm)) return NO_DISTANCE_FALLBACK_MIN;
  const speed = AVG_SPEED_KMH[vehicle_type] || AVG_SPEED_KMH.any;
  const travelMin = (distanceKm / speed) * 60;
  return Math.round((PREP_BUFFER_MIN + travelMin) * SLACK_MULTIPLIER);
}

function estimatedDeliveryAt({ distanceKm, vehicle_type, from = new Date() }) {
  const minutes = estimateDeliveryMinutes({ distanceKm, vehicle_type });
  return new Date(from.getTime() + minutes * 60000);
}

module.exports = { estimateDeliveryMinutes, estimatedDeliveryAt };
