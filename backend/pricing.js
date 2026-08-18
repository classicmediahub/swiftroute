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
  return applyLaunchPromo(price);
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
  return applyLaunchPromo(Math.max(price, MIN_FARE));
}

// ---------- RIDE (passenger) pricing — separate constants from parcel
// pricing above on purpose. Carrying a person and carrying cargo in the
// same cab are different businesses with different expectations, and
// tying ride fares to the parcel-cab rate would mean any future change to
// one silently changes the other. These are starting numbers, not
// researched ones — tune once you have a handful of real trips to compare
// against what riders locally expect (Bolt/inDrive rates, etc.). ----------
const RIDE_BASE_FARE = 400;
const RIDE_PER_KM_RATE = 150;
const RIDE_MIN_FARE = 600;

function priceForRide({ distanceKm }) {
  let price = RIDE_BASE_FARE + distanceKm * RIDE_PER_KM_RATE;
  price = Math.round(price / 50) * 50;
  return applyLaunchPromo(Math.max(price, RIDE_MIN_FARE));
}

// ---------- LIVE METER (Bolt-style) — the fare that actually gets charged.
// priceForRide() above is only ever shown to the customer as an upfront
// ESTIMATE before they request the ride; it is never charged directly.
// The real fare accrues while the trip is 'in_progress' and is driven by
// two things the backend tracks itself so it can't be spoofed from the
// client: elapsed wall-clock time since started_at, and real distance
// actually travelled (accumulated ride.distance_traveled_km, built up from
// consecutive driver GPS pings in routes/rides.js's /:id/location handler
// — NOT the straight-line pickup→dropoff distance used for the estimate).
// Per-minute rate exists so waiting in traffic/at a stop still costs the
// rider something, same as Bolt/Uber — a pure per-km meter would make a
// gridlocked trip free for the driver's time. ----------
const RIDE_PER_MIN_RATE = 35;

function priceForRideMeter({ distanceKm, elapsedMinutes }) {
  const km = Math.max(0, Number(distanceKm) || 0);
  const mins = Math.max(0, Number(elapsedMinutes) || 0);
  let price = RIDE_BASE_FARE + km * RIDE_PER_KM_RATE + mins * RIDE_PER_MIN_RATE;
  price = Math.round(price / 50) * 50;
  return applyLaunchPromo(Math.max(price, RIDE_MIN_FARE));
}

function trackingCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "PAE-";
  for (let i = 0; i < 7; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

// ---------- LAUNCH-WEEK PROMO — 50% off (capped at ₦5,000), applied
// automatically for exactly 7 days starting at LAUNCH_DATE. Set LAUNCH_DATE
// in backend/.env to the SAME value as the frontend's VITE_LAUNCH_DATE
// (see LaunchGate.jsx / ComingSoon.jsx) — that keeps "launch" meaning the
// same moment everywhere instead of drifting into two different dates.
// ISO format with timezone, e.g. "2026-09-01T09:00:00+01:00".
//
// Applied centrally inside the three price functions below rather than in
// each route, so every path that ever computes a price — normal delivery
// quotes, campus/landmark quotes, and rides — gets the discount for free
// with no changes needed anywhere else in the codebase. To end the promo
// early, just remove LAUNCH_DATE from .env (or let the 7 days lapse
// naturally); nothing else needs touching.
const LAUNCH_PROMO_DAYS = 7;
const LAUNCH_PROMO_PERCENT = 0.5;
const LAUNCH_PROMO_MAX_DISCOUNT = 5000;

function launchPromoWindow() {
  const launchDate = process.env.LAUNCH_DATE;
  if (!launchDate) return null;
  const start = new Date(launchDate).getTime();
  if (Number.isNaN(start)) return null;
  return { start, end: start + LAUNCH_PROMO_DAYS * 24 * 60 * 60 * 1000 };
}

function isLaunchPromoActive() {
  const window = launchPromoWindow();
  if (!window) return false;
  const now = Date.now();
  return now >= window.start && now < window.end;
}

// Exposed so a frontend banner can show "launch week — X days left" later
// without duplicating the date math.
function launchPromoInfo() {
  const window = launchPromoWindow();
  if (!window) return { active: false };
  const now = Date.now();
  return {
    active: now >= window.start && now < window.end,
    percent: LAUNCH_PROMO_PERCENT,
    maxDiscount: LAUNCH_PROMO_MAX_DISCOUNT,
    endsAt: new Date(window.end).toISOString(),
  };
}

function applyLaunchPromo(price) {
  if (!isLaunchPromoActive()) return price;
  const discount = Math.min(price * LAUNCH_PROMO_PERCENT, LAUNCH_PROMO_MAX_DISCOUNT);
  const discounted = Math.round((price - discount) / 50) * 50;
  return Math.max(discounted, 0);
}

module.exports = {
  estimatePrice, priceFromDistance, priceForRide, priceForRideMeter, trackingCode,
  isLaunchPromoActive, launchPromoInfo,
};
