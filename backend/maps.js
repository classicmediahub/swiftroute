const MAPBOX_TOKEN = process.env.MAPBOX_ACCESS_TOKEN;

// Roughly the real bounding box of Nigeria (west, south, east, north).
// Passed as Mapbox's `bbox` param so results outside the country's actual
// extent get excluded outright, rather than relying only on `country=NG`
// (which restricts by country code, but doesn't otherwise constrain
// *where* Mapbox looks for candidate matches).
const NIGERIA_BBOX = [2.6, 4.2, 14.7, 13.9];

// Approximate centers for every city currently offered in the agent/customer
// city selectors. Used as a `proximity` bias whenever the caller already
// knows which city an address is in (e.g. PinMap's "find on map", or a
// delivery's pickup/dropoff city) — proximity ranks nearby candidates
// higher, which is the single biggest lever for "the address I typed
// resolved to the wrong place."
const CITY_CENTERS = {
  Lagos: { lat: 6.5244, lng: 3.3792 },
  Ogun: { lat: 7.1475, lng: 3.3619 },
  Abuja: { lat: 9.0765, lng: 7.3986 },
  "Port Harcourt": { lat: 4.8156, lng: 7.0498 },
  Ibadan: { lat: 7.3775, lng: 3.947 },
  Kano: { lat: 12.0022, lng: 8.592 },
  Enugu: { lat: 6.4483, lng: 7.5464 },
  "Benin City": { lat: 6.335, lng: 5.6037 },
};

// Place types worth surfacing for a delivery address — excludes overly
// broad matches like "country" or "region" that are never a real pickup
// or drop-off point.
const ADDRESS_TYPES = "address,poi,neighborhood,place";

function buildParams({ proximity, bbox } = {}) {
  const params = new URLSearchParams({
    access_token: MAPBOX_TOKEN,
    country: "NG",
    types: ADDRESS_TYPES,
  });
  params.set("bbox", (bbox || NIGERIA_BBOX).join(","));
  if (proximity) params.set("proximity", `${proximity.lng},${proximity.lat}`);
  return params;
}

// Turns a free-text address/city into coordinates. Returns null (rather
// than throwing) if nothing matches, so callers can fall back gracefully.
// `cityHint` is optional — pass a known city name (matching a key in
// CITY_CENTERS) whenever the caller has one, to bias toward that city.
async function geocode(query, cityHint) {
  if (!MAPBOX_TOKEN) throw new Error("MAPBOX_ACCESS_TOKEN is not set");
  const proximity = cityHint ? CITY_CENTERS[cityHint] : null;
  const params = buildParams({ proximity });
  params.set("limit", "1");

  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?${params.toString()}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Mapbox geocoding failed: ${res.status}`);
  const data = await res.json();
  const feature = data.features && data.features[0];
  if (!feature) return null;
  const [lng, lat] = feature.center;
  return { lat, lng };
}

// Real driving distance (not straight-line) between two coordinates, in km.
// Unchanged — proximity/bbox tuning doesn't apply to a directions call
// between two already-known points.
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
// 5 suggestions, each with coordinates already attached. `cityHint` is
// optional (the public hero widget doesn't currently have a city selected
// at typing time, so it'll usually be undefined there — this is here for
// any flow, like PinMap, that does already know the city).
async function suggest(query, cityHint) {
  if (!MAPBOX_TOKEN) throw new Error("MAPBOX_ACCESS_TOKEN is not set");
  const proximity = cityHint ? CITY_CENTERS[cityHint] : null;
  const params = buildParams({ proximity });
  params.set("autocomplete", "true");
  params.set("limit", "5");

  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?${params.toString()}`;
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

module.exports = { geocode, drivingDistanceKm, suggest, CITY_CENTERS };
