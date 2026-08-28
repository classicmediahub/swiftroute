const { geocode, drivingDistanceKm } = require("./maps");
const { priceForGasOrder } = require("./gas-pricing");

// No fixed depot exists yet (see the "pick a sensible default" decision
// in routes/gas.js's comments) — origin is the CITY's center point
// instead, resolved by geocoding "{city}, Nigeria" the same way quote.js
// already does for a plain city name with no street address. This is a
// placeholder for real depot coordinates later: swap the origin
// resolution below for a lookup against actual depot addresses per city
// once those exist, and every gas order's pricing updates automatically
// — nothing else in this file or its callers needs to change.
//
// Always succeeds — mirrors getQuote()'s philosophy in quote.js: if
// geocoding or distance calculation fails for any reason, this falls
// back to gas-pricing.js's FALLBACK_DISTANCE_KM rather than blocking the
// order. A slightly-off transport fee is far better than a broken quote
// flow on launch day.
async function getGasQuote({ city, address, address_coords, cylinder_size_kg }) {
  let distanceKm = null;
  let origin = null;
  let destination = address_coords || null;

  try {
    origin = await geocode(`${city}, Nigeria`, city);
    destination = address_coords || (await geocode(address ? `${address}, ${city}, Nigeria` : `${city}, Nigeria`, city));
    if (origin && destination) {
      const km = await drivingDistanceKm(origin, destination);
      if (km !== null) distanceKm = km;
    }
  } catch (err) {
    console.error("Gas quote distance calculation failed, using fallback distance:", err.message);
  }

  const quote = priceForGasOrder(cylinder_size_kg, distanceKm);
  return { ...quote, origin, destination, usedFallbackDistance: distanceKm === null };
}

module.exports = { getGasQuote };
