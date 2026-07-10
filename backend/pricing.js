// Simple, transparent pricing model (Naira).
// Base fare depends on whether pickup/dropoff are in the same city,
// then a multiplier is applied based on vehicle type.

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

function trackingCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "SR-";
  for (let i = 0; i < 7; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

module.exports = { estimatePrice, trackingCode };
