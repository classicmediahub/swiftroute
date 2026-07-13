// Simple, transparent pricing model (Naira).
//
// PRIMARY MODEL: priceFromDistance() — base fare + per-km rate, using real
// driving distance from Mapbox. This is what actually gets used whenever
// Mapbox is configured and can geocode both ends of the trip.
//
// FALLBACK MODEL: estimatePrice() — a flat same-city/intercity guess, used
// only when Mapbox isn't set up yet or a specific address can't be
// geocoded (typo, obscure location, etc.), so quoting never just breaks.

const VEHICLE_MULTIPLIER = {
  self: 1,      // walking/self agent - small, local errands
  bike: 1.4,    // dispatch bike - most common, fastest for parcels
  cab: 2.6,     // car - bigger loads, more comfortable
  any: 1.2,
};

const BASE_SAME_CITY = 1200;
const BASE_INTERCITY = 4500;

function estimatePrice({ pickup_city, dropoff_city, vehicle_type }) {
  const sameCity = pickup_city.trim().toLowerCase() === dropoff_city.trim().toLowerCase();
  const base = sameCity ? BASE_SAME_CITY : BASE_INTERCITY;
  const multiplier = VEHICLE_MULTIPLIER[vehicle_type] || VEHICLE_MULTIPLIER.any;
  const price = Math.round((base * multiplier) / 50) * 50; // round to nearest 50 naira
  return price;
}

// Naira per km, by vehicle type — set to roughly match typical Nigerian
// dispatch pricing. Adjust these as you learn your real costs.
const BASE_FARE = 500;
const PER_KM_RATE = { self: 100, bike: 130, cab: 220, any: 150 };
const MIN_FARE = 800;

function priceFromDistance({ distanceKm, vehicle_type }) {
  const rate = PER_KM_RATE[vehicle_type] || PER_KM_RATE.any;
  let price = BASE_FARE + distanceKm * rate;
  price = Math.round(price / 50) * 50; // round to nearest 50 naira
  return Math.max(price, MIN_FARE);
}

function trackingCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "PAE-";
  for (let i = 0; i < 7; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

module.exports = { estimatePrice, priceFromDistance, trackingCode };
