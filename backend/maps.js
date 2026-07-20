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

// Address autocomplete for the hero's pickup/drop-off fields. Returns up to
// 5 suggestions, each with coordinates already attached — so selecting one
// skips a redundant geocoding call later (the coords are already known).
// Also extracts a best-guess city from Mapbox's "context" data, so the
// flat-price fallback has something to work with if the distance API call
// itself fails despite the address being found successfully.
async function suggest(query) {
  if (!MAPBOX_TOKEN) throw new Error("MAPBOX_ACCESS_TOKEN is not set");
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${MAPBOX_TOKEN}&country=NG&autocomplete=true&limit=5`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Mapbox suggest failed: ${res.status}`);
  const data = await res.json();

  return (data.features || []).map((f) => {
    const [lng, lat] = f.center;
    const context = f.context || [];
    const cityContext =
      context.find((c) => c.id.startsWith("place.")) ||
      context.find((c) => c.id.startsWith("region."));
    return {
      label: f.place_name,
      city: cityContext ? cityContext.text : (f.place_type?.includes("place") ? f.text : null),
      lat,
      lng,
    };
  });
}

module.exports = { geocode, drivingDistanceKm, suggest };
