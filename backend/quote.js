const { geocode, drivingDistanceKm } = require("./maps");
const { estimatePrice, priceFromDistance, priceForRide } = require("./pricing");

// Returns { price, distanceKm, method, origin, destination }. Always
// succeeds — if Mapbox isn't configured, or a specific address can't be
// geocoded, or Mapbox is down, this quietly falls back to the flat
// city-based estimate rather than failing the request. distanceKm is null
// whenever the fallback is used.
//
// pickup_coords / dropoff_coords are optional {lat, lng} pairs — when the
// customer has confirmed an exact location by dragging a pin on the map,
// pass those through here instead of re-geocoding the typed address.
// A confirmed pin is more trustworthy than geocoding a free-text Nigerian
// address, and it skips an unnecessary API call.
//
// isFirstPayment: pass this through from the caller (which has the DB
// connection needed to check payment history) — quote.js itself has no
// way to know whether this is really someone's first payment, it just
// forwards the flag into pricing.js's discount logic. Defaults to false
// so quotes are never accidentally discounted by omission.
async function getQuote({ pickup_address, pickup_city, dropoff_address, dropoff_city, vehicle_type, pickup_coords, dropoff_coords, isFirstPayment = false }) {
  const vehicle = vehicle_type || "any";

  if (process.env.MAPBOX_ACCESS_TOKEN || (pickup_coords && dropoff_coords)) {
    try {
      const [origin, destination] = await Promise.all([
        pickup_coords || geocodeOrThrow(pickup_address, pickup_city),
        dropoff_coords || geocodeOrThrow(dropoff_address, dropoff_city),
      ]);

      if (origin && destination) {
        const distanceKm = await drivingDistanceKm(origin, destination);
        if (distanceKm !== null) {
          return {
            price: priceFromDistance({ distanceKm, vehicle_type: vehicle, isFirstPayment }),
            distanceKm: Math.round(distanceKm * 10) / 10,
            method: "distance",
            origin,
            destination,
          };
        }
      }
    } catch (err) {
      console.error("Distance-based pricing failed, falling back to flat estimate:", err.message);
    }
  }

  return {
    price: estimatePrice({ pickup_city, dropoff_city, vehicle_type: vehicle, isFirstPayment }),
    distanceKm: null,
    method: "flat",
    origin: pickup_coords || null,
    destination: dropoff_coords || null,
  };
}

// Passes the city through as a proximity hint — maps.js biases the
// geocoding search toward that city's center, which is the main fix for
// addresses resolving to the wrong place entirely.
function geocodeOrThrow(address, city) {
  const query = address ? `${address}, ${city}, Nigeria` : `${city}, Nigeria`;
  return geocode(query, city);
}

// ---------- RIDE QUOTE — deliberately no flat-fallback here, unlike
// getQuote() above. A parcel delivery between two named cities can fall
// back to a flat intercity estimate and still make sense; a passenger ride
// with no real route makes no sense to quote at all — if we can't compute
// an actual driving distance, we return null and the caller shows "can't
// estimate a fare right now" rather than a fabricated number.
//
// In practice this path is low-risk: the frontend flow always confirms
// exact pickup/dropoff pins on a map before requesting a fare (same PinMap
// component deliveries use), so pickup_coords/dropoff_coords are almost
// always already present here and no geocoding call is even needed. ----------
async function getRideQuote({ pickup_address, pickup_city, dropoff_address, dropoff_city, pickup_coords, dropoff_coords, isFirstPayment = false }) {
  try {
    const origin = pickup_coords || (await geocodeOrThrow(pickup_address, pickup_city));
    const destination = dropoff_coords || (await geocodeOrThrow(dropoff_address, dropoff_city));
    if (!origin || !destination) return null;

    const distanceKm = await drivingDistanceKm(origin, destination);
    if (distanceKm === null) return null;

    return {
      price: priceForRide({ distanceKm, isFirstPayment }),
      distanceKm: Math.round(distanceKm * 10) / 10,
      origin,
      destination,
    };
  } catch (err) {
    console.error("Ride quote failed:", err.message);
    return null;
  }
}

module.exports = { getQuote, getRideQuote };
