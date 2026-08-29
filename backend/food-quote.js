const { geocode, drivingDistanceKm } = require("./maps");
const { priceForFoodOrder } = require("./food-pricing");

// Cleaner than gas-quote.js's city-center placeholder — an outlet has a
// real registered address (address_lat/address_lng on outlet_profiles),
// so the delivery fee is based on actual outlet→customer distance from
// day one, not a stand-in.
//
// Always succeeds — same "never block the quote" philosophy as
// gas-quote.js and quote.js: falls back to food-pricing.js's
// FALLBACK_DISTANCE_KM if outlet coordinates are missing or distance
// calculation fails for any reason.
async function getFoodQuote({ outlet, items, delivery_address, city, address_coords }) {
  let distanceKm = null;
  let destination = address_coords || null;

  try {
    const origin = outlet.address_lat != null && outlet.address_lng != null
      ? { lat: outlet.address_lat, lng: outlet.address_lng }
      : null;
    destination = address_coords || (await geocode(
      delivery_address ? `${delivery_address}, ${city}, Nigeria` : `${city}, Nigeria`,
      city
    ));
    if (origin && destination) {
      const km = await drivingDistanceKm(origin, destination);
      if (km !== null) distanceKm = km;
    }
  } catch (err) {
    console.error("Food quote distance calculation failed, using fallback distance:", err.message);
  }

  const quote = priceForFoodOrder(items, distanceKm);
  return { ...quote, destination, usedFallbackDistance: distanceKm === null };
}

module.exports = { getFoodQuote };
