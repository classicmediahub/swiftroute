const MAPBOX_TOKEN = process.env.MAPBOX_ACCESS_TOKEN;

// Verified 2026-07-25 through a manual audit: ran the full Ota-area street/
// landmark list through Mapbox, then checked each match's actual place_name
// against expectations. Rejected anything tagged a different LGA/state
// (several matched real but wrong places in Lagos — "Owode," "Awori," and
// "Iju" are all common names that also exist as real Lagos locations) or
// with a name that didn't genuinely match (fuzzy near-misses like "Imole"
// for "Idole", "Estate" for "Esa"). Only entries confirmed tagged
// "Ado-Odo... Ogun, Nigeria" with a real name match are here — everything
// else either needs a manual GPS pin (see NEEDS_MANUAL_PIN below) or should
// just fall through to a normal Mapbox lookup as usual.
const LOCAL_GAZETTEER = [
  { name: "Awolowo Way", lat: 6.688041, lng: 3.237416 },
  { name: "Okewoye Street", lat: 6.689459, lng: 3.236174 },
  { name: "Ilo Awela Road", lat: 6.69163, lng: 3.247183 },
  { name: "Market Road", lat: 6.680421, lng: 3.216506 },
  { name: "Ijoko", lat: 6.726091, lng: 3.253386 },
  { name: "Kajola", lat: 6.660176, lng: 3.100084 },
  { name: "Itele", lat: 6.658767, lng: 3.220823 },
  { name: "Ewupe", lat: 6.692508, lng: 3.221624 },
  { name: "Iganmode", lat: 6.69302, lng: 3.236659 },
  { name: "Abebi", lat: 6.683809, lng: 3.233536 },
  // Extracted from a real Google Maps share link (not a Mapbox geocode) —
  // cross-checked against the actual driving distance shown between them,
  // which matched what you'd expect for real, correct coordinates.
  { name: "Agbara", lat: 6.51371, lng: 3.114051 },
  { name: "Lusada", lat: 6.586243, lng: 3.059792 },
  { name: "Igbesa", lat: 6.5286101, lng: 3.1353091 },
];

// Everything else from the original Ota-area list — checked and found to
// either return nothing, or return a wrong (usually Lagos, usually
// same-named) place. Not used anywhere at runtime; kept here as a running
// to-do list. The real fix for each of these is someone physically there
// using PinMap's "Use my current location" button, not another geocoding
// query — we already tried several query phrasings and they don't help.
const NEEDS_MANUAL_PIN = [
  "Ilogbo", "Iyana-Ilogbo", "Oke Suna", "Oke-Suna", "Araromi", "Obafemi Awolowo Way",
  "Sango-Ota Road", "Idole Street", "Esa Road", "Iyesi", "Joju", "Owode", "Awori", "Toll Gate", "Iju",
  "Ota-Idiroko Expressway", "Senator Akin Odunsi Street", "Dalemo Street", "Adio Street", "Ibrahim Street",
  "Allishiba Street", "Alaloju Street", "Anuduwa Street", "Ilawele Street", "Olusye Street",
  "Ota", "Sango-Ota", "Oju Ore", "Atan", "Ado-Odo", "Ijagba",
  "Obasanjo Farm Area", "Iloye", "Papa Aro",
  "Idiroko Road", "Ilogbo Road", "Lusada Road", "Atan Road", "Iyesi Road", "Toll Gate Road", "Joju Road",
  "Maltina Road", "Alapoti Road", "Oju Ore Road", "Old Garage Road", "Modern School Road",
  "GRA Akinwunmi Road", "GRA/Tomori Road", "Ipamesan Road", "Ketere Road", "Araromi Road", "Papa Aro Road",
  "Oju Popo Road", "Ejigbo Titun Road", "Oke-Odo Road", "Zion Road", "Ijagba Road", "Arinko Road",
  "Owoseni Road", "Akinwunmi Road", "Tomori Road", "Oba T.T. Dada Road",
  "Alapoti", "Oke-Odan", "Osi", "Onibuku", "Ketere", "Ipamesan", "Arinko",
  "Ado-Odo/Ota Local Government Secretariat", "Covenant University", "Bells University of Technology",
  "Crawford University", "Allover Central Polytechnic", "Iganmode Grammar School", "Oba T. T. Dada Market",
  "Oju Ore Motor Park", "Old Motor Park", "Ota Shopping Centre", "Olota's Palace",
  "St. James Anglican Church Vicarage", "Ace Medicare", "Central Specialist Hospital",
  "Ojugbele Specialist Hospital", "Ijamido Shrine", "Ogbodo Shrine",
];

function normalizeForMatch(s) {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
}

// Checked before ever calling Mapbox — free, instant, and (for these 10)
// more accurate than a live geocode, since we've already verified them by
// hand against exactly this kind of false-match problem.
function checkLocalGazetteer(query) {
  const normalizedQuery = normalizeForMatch(query);
  for (const entry of LOCAL_GAZETTEER) {
    if (normalizedQuery.includes(normalizeForMatch(entry.name))) {
      return { lat: entry.lat, lng: entry.lng };
    }
  }
  return null;
}

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
  Ogun: { lat: 7.1475, lng: 3.3619 }, // Abeokuta — the state capital
  Ota: { lat: 6.6805, lng: 3.2356 }, // a distinct town from Abeokuta, ~60km apart — kept separate on purpose
  Agbara: { lat: 6.51371, lng: 3.114051 }, // verified via a real Google Maps share link, 2026-07-25
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
  const localMatch = checkLocalGazetteer(query);
  if (localMatch) return localMatch;

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
  const normalizedQuery = normalizeForMatch(query);
  const localSuggestions = LOCAL_GAZETTEER.filter((entry) =>
    normalizeForMatch(entry.name).includes(normalizedQuery)
  ).map((entry) => ({ label: entry.name, city: "Ota", lat: entry.lat, lng: entry.lng }));

  if (!MAPBOX_TOKEN) return localSuggestions;
  const proximity = cityHint ? CITY_CENTERS[cityHint] : null;
  const params = buildParams({ proximity });
  params.set("autocomplete", "true");
  params.set("limit", "5");

  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?${params.toString()}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Mapbox suggest failed: ${res.status}`);
  const data = await res.json();

  const mapboxSuggestions = (data.features || []).map((f) => {
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

  // Local matches first (pre-verified, free, instant), then Mapbox's own
  // results, capped at 5 total so the dropdown doesn't get crowded.
  return [...localSuggestions, ...mapboxSuggestions].slice(0, 5);
}

module.exports = { geocode, drivingDistanceKm, suggest, CITY_CENTERS, LOCAL_GAZETTEER, NEEDS_MANUAL_PIN };
