const { geocode, drivingDistanceKm } = require("./maps");
const { estimatePrice, priceFromDistance } = require("./pricing");

// Returns { price, distanceKm, method }. Always succeeds — if Mapbox isn't
// configured, or a specific address can't be geocoded, or Mapbox is down,
// this quietly falls back to the flat city-based estimate rather than
// failing the request. distanceKm is null whenever the fallback is used.
async function getQuote({ pickup_address, pickup_city, dropoff_address, dropoff_city, vehicle_type }) {
  const vehicle = vehicle_type || "any";

  if (process.env.MAPBOX_ACCESS_TOKEN) {
    try {
      const pickupQuery = pickup_address ? `${pickup_address}, ${pickup_city}, Nigeria` : `${pickup_city}, Nigeria`;
      const dropoffQuery = dropoff_address ? `${dropoff_address}, ${dropoff_city}, Nigeria` : `${dropoff_city}, Nigeria`;

      const [origin, destination] = await Promise.all([geocode(pickupQuery), geocode(dropoffQuery)]);

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
    origin: null,
    destination: null,
  };
}

module.exports = { getQuote };
