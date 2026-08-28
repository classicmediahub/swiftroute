// Nigerian LPG retail rates fluctuate regionally and over time — this is
// a starting number, same spirit as REFERRAL_REWARD in referrals.js: tune
// freely as real market rates or your own margin targets become clear.
//
// IMPORTANT: this is treated as the agent's actual wholesale cost, not a
// price with platform margin baked in — gas agents front and carry their
// own stock (see referrals.js-style comment in routes/gas.js), so the
// gas-cost portion of every order is paid back to the agent in FULL, not
// split 80/20 like the transportation fee below. Splitting the raw cost
// they already paid out of pocket would leave them recovering less than
// they spent.
const PRICE_PER_KG_NAIRA = 1200;

// Distance-based transportation fee — same shape as PER_KM_RATE/BASE_FARE
// in pricing.js, using a rate close to the bike rate there (130/km),
// since a gas agent's mobility profile is closest to a dispatch bike.
// Unlike the gas cost above, THIS portion follows the normal 80/20 split
// (see routes/gas.js) — it's compensation for the trip itself, which is
// exactly what that split is meant to cover elsewhere in the app.
const TRANSPORT_BASE_FARE = 500;
const TRANSPORT_PER_KM_RATE = 130;
const TRANSPORT_MIN_FARE = 500;

// Used only when a real driving distance can't be computed (geocoding
// failure, Mapbox not configured) — same "never just fail the quote"
// philosophy as pricing.js's estimatePrice() fallback. Assumes a modest
// in-town trip rather than blocking the order entirely.
const FALLBACK_DISTANCE_KM = 5;

// Standard Nigerian cylinder sizes — the frontend offers these as a
// picker rather than a free-text kg field, since "how many kg is my
// cylinder" isn't something most people know off the top of their head,
// but "which one looks like mine" is answerable at a glance.
const STANDARD_CYLINDER_SIZES_KG = [3, 5, 6, 12.5, 25, 50];

function isStandardSize(kg) {
  return STANDARD_CYLINDER_SIZES_KG.includes(Number(kg));
}

function transportFeeForDistance(distanceKm) {
  const km = Math.max(0, Number(distanceKm) || 0);
  const fee = TRANSPORT_BASE_FARE + km * TRANSPORT_PER_KM_RATE;
  return Math.max(Math.round(fee / 50) * 50, TRANSPORT_MIN_FARE);
}

function priceForGasOrder(cylinderSizeKg, distanceKm) {
  const kg = Number(cylinderSizeKg);
  if (!Number.isFinite(kg) || kg <= 0) {
    throw new Error("Invalid cylinder size");
  }
  const gasCost = Math.round(kg * PRICE_PER_KG_NAIRA);
  const transportFee = transportFeeForDistance(distanceKm ?? FALLBACK_DISTANCE_KM);
  return {
    price: gasCost + transportFee,
    gasCost,
    transportFee,
    pricePerKg: PRICE_PER_KG_NAIRA,
    cylinderSizeKg: kg,
    distanceKm: distanceKm != null ? Math.round(distanceKm * 10) / 10 : null,
  };
}

module.exports = {
  priceForGasOrder, transportFeeForDistance,
  PRICE_PER_KG_NAIRA, TRANSPORT_BASE_FARE, TRANSPORT_PER_KM_RATE, FALLBACK_DISTANCE_KM,
  STANDARD_CYLINDER_SIZES_KG, isStandardSize,
};
