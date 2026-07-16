const { geocode, drivingDistanceKm } = require("./maps");
const { estimatePrice, priceFromDistance } = require("./pricing");

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
async function getQuote({ pickup_address, pickup_city, dropoff_address, dropoff_city, vehicle_type, pickup_coords, dropoff_coords }) {
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
            price: priceFromDistance({ distanceKm, vehicle_type: vehicle }),
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
    price: estimatePrice({ pickup_city, dropoff_city, vehicle_type: vehicle }),
    distanceKm: null,
    method: "flat",
    origin: pickup_coords || null,
    destination: dropoff_coords || null,
  };
}

function geocodeOrThrow(address, city) {
  const query = address ? `${address}, ${city}, Nigeria` : `${city}, Nigeria`;
  return geocode(query);
}

module.exports = { getQuote };
