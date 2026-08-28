// Nigerian LPG retail rates fluctuate regionally and over time — this is
// a starting number, same spirit as REFERRAL_REWARD in referrals.js: tune
// freely as real market rates or your own margin targets become clear.
const PRICE_PER_KG_NAIRA = 1200;

// Flat fee for the agent's trip out to the customer's house, separate
// from the per-kg gas cost itself — covers the "callout" part of the job
// the same way a delivery's price implicitly covers the rider's trip.
const CALLOUT_FEE_NAIRA = 500;

// Standard Nigerian cylinder sizes — the frontend offers these as a
// picker rather than a free-text kg field, since "how many kg is my
// cylinder" isn't something most people know off the top of their head,
// but "which one looks like mine" is answerable at a glance.
const STANDARD_CYLINDER_SIZES_KG = [3, 5, 6, 12.5, 25, 50];

function isStandardSize(kg) {
  return STANDARD_CYLINDER_SIZES_KG.includes(Number(kg));
}

function priceForGasOrder(cylinderSizeKg) {
  const kg = Number(cylinderSizeKg);
  if (!Number.isFinite(kg) || kg <= 0) {
    throw new Error("Invalid cylinder size");
  }
  const gasCost = kg * PRICE_PER_KG_NAIRA;
  const price = Math.round(gasCost + CALLOUT_FEE_NAIRA);
  return { price, pricePerKg: PRICE_PER_KG_NAIRA, calloutFee: CALLOUT_FEE_NAIRA, cylinderSizeKg: kg };
}

module.exports = { priceForGasOrder, PRICE_PER_KG_NAIRA, CALLOUT_FEE_NAIRA, STANDARD_CYLINDER_SIZES_KG, isStandardSize };
