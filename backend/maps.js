const MAPBOX_TOKEN = process.env.MAPBOX_ACCESS_TOKEN;

// Turns a free-text address/city into coordinates. Returns null (rather
// than throwing) if nothing matches, so callers can fall back gracefully.
async function geocode(query) {
  if (!MAPBOX_TOKEN) throw new Error("MAPBOX_ACCESS_TOKEN is not set");
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${MAPBOX_TOKEN}&country=NG&limit=1`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Mapbox geocoding failed: ${res.status}`);
  const data = await res.json();
  const feature = data.features && data.features[0];
  if (!feature) return null;
  const [lng, lat] = feature.center;
  return { lat, lng };
}

// Real driving distance (not straight-line) between two coordinates, in km.
async function drivingDistanceKm(origin, destination) {
  if (!MAPBOX_TOKEN) throw new Error("MAPBOX_ACCESS_TOKEN is not set");
  const coords = `${origin.lng},${origin.lat};${destination.lng},${destination.lat}`;
  const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${coords}?access_token=${MAPBOX_TOKEN}&overview=false`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Mapbox directions failed: ${res.status}`);
  const data = await res.json();
  const route = data.routes && data.routes[0];
  if (!route) return null;
  return route.distance / 1000; // meters -> km
}

module.exports = { geocode, drivingDistanceKm };
