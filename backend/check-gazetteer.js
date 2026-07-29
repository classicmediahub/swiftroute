// Run this once with: node check-gazetteer.js
//
// v2 — the first version accepted ANY feature Mapbox returned, which turned
// out to include matches tens of kilometers away (a different LGA, in one
// case near the Ogun/Oyo border) whenever it couldn't find the real place.
// This version calls Mapbox directly (not through maps.js's geocode(), which
// throws away the metadata we need here), and rejects anything more than
// MAX_DISTANCE_KM from Ota's actual center — regardless of how confident
// Mapbox's own relevance score claims to be — since every entry on this
// list is known to genuinely be within the Ota/Ado-Odo area.

require("dotenv").config();
const fs = require("fs");

const MAPBOX_TOKEN = process.env.MAPBOX_ACCESS_TOKEN;
const OTA_CENTER = { lat: 6.6805, lng: 3.2356 };
const MAX_DISTANCE_KM = 20; // reject anything farther than this from Ota's center, no matter what
const MIN_RELEVANCE = 0.5; // Mapbox's own 0-1 confidence score, for reference/flagging

function haversineKm(a, b) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

async function rawGeocode(query) {
  const params = new URLSearchParams({
    access_token: MAPBOX_TOKEN,
    country: "NG",
    proximity: `${OTA_CENTER.lng},${OTA_CENTER.lat}`,
    bbox: [2.6, 4.2, 14.7, 13.9].join(","),
    types: "address,poi,neighborhood,place",
    limit: "1",
  });
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?${params.toString()}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Mapbox failed: ${res.status}`);
  const data = await res.json();
  const feature = data.features && data.features[0];
  if (!feature) return null;
  const [lng, lat] = feature.center;
  return { lat, lng, relevance: feature.relevance, place_type: feature.place_type, place_name: feature.place_name };
}

const ENTRIES = [
  ["Obafemi Awolowo Way", "road"], ["Idiroko Road", "road"], ["Ota–Idiroko Expressway", "road"],
  ["Sango–Ota Road", "road"], ["Ilogbo Road", "road"], ["Itele Road", "road"], ["Lusada Road", "road"],
  ["Atan Road", "road"], ["Iyesi Road", "road"], ["Toll Gate Road", "road"], ["Joju Road", "road"],
  ["Maltina Road", "road"], ["Alapoti Road", "road"], ["Oju Ore Road", "road"], ["Old Garage Road", "road"],
  ["Senator Akin Odunsi Street", "road"], ["Awolowo Way", "road"], ["Dalemo Street", "road"],
  ["Adio Street", "road"], ["Ibrahim Street", "road"], ["Allishiba Street", "road"],
  ["Modern School Road", "road"], ["GRA Akinwunmi Road", "road"], ["GRA/Tomori Road", "road"],
  ["Alaloju Street", "road"], ["Anuduwa Street", "road"], ["Ilawele Street", "road"], ["Idole Street", "road"],
  ["Okewoye Street", "road"], ["Olusye Street", "road"], ["Abebi New Site", "road"], ["Oke Suna", "road"],
  ["Ipamesan Road", "road"], ["Ketere Road", "road"], ["Ilo Awela Road", "road"], ["Araromi Road", "road"],
  ["Papa Aro Road", "road"], ["Oju Popo Road", "road"], ["Ejigbo Titun Road", "road"], ["Oke-Odo Road", "road"],
  ["Zion Road", "road"], ["Esa Road", "road"], ["Ijagba Road", "road"], ["Ewupe Road", "road"],
  ["Arinko Road", "road"], ["Owoseni Road", "road"], ["Market Road", "road"], ["Akinwunmi Road", "road"],
  ["Tomori Road", "road"], ["Iganmode Road", "road"], ["Oba T.T. Dada Road", "road"],
  ["Ota", "area"], ["Sango-Ota", "area"], ["Oju Ore", "area"], ["Iyesi", "area"], ["Joju", "area"],
  ["Itele", "area"], ["Ilogbo", "area"], ["Igbesa", "area"], ["Atan", "area"], ["Agbara", "area"],
  ["Lusada", "area"], ["Ado-Odo", "area"], ["Owode", "area"], ["Ijoko", "area"], ["Ewupe", "area"],
  ["Kajola", "area"], ["Alapoti", "area"], ["Ijagba", "area"], ["Araromi", "area"], ["Oke-Odan", "area"],
  ["Awori", "area"], ["Osi", "area"], ["Iganmode", "area"], ["Iyana-Ilogbo", "area"], ["Onibuku", "area"],
  ["Obasanjo Farm Area", "area"], ["Toll Gate", "area"], ["Iju", "area"], ["Oke-Suna", "area"],
  ["Abebi", "area"], ["Ketere", "area"], ["Ipamesan", "area"], ["Iloye", "area"], ["Arinko", "area"],
  ["Papa Aro", "area"],
  ["Ado-Odo/Ota Local Government Secretariat", "landmark"], ["Covenant University", "landmark"],
  ["Bells University of Technology", "landmark"], ["Crawford University", "landmark"],
  ["Allover Central Polytechnic", "landmark"], ["Iganmode Grammar School", "landmark"],
  ["Oba T. T. Dada Market", "landmark"], ["Oju Ore Motor Park", "landmark"], ["Old Motor Park", "landmark"],
  ["Ota Shopping Centre", "landmark"], ["Olota's Palace", "landmark"],
  ["St. James Anglican Church Vicarage", "landmark"], ["Ace Medicare", "landmark"],
  ["Central Specialist Hospital", "landmark"], ["Ojugbele Specialist Hospital", "landmark"],
  ["Ijamido Shrine", "landmark"], ["Ogbodo Shrine", "landmark"],
  ["Agbara", "area"], ["Lusada", "area"], ["Igbesa", "area"],
];

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run() {
  if (!MAPBOX_TOKEN) throw new Error("MAPBOX_ACCESS_TOKEN is not set");

  const accepted = [];
  const rejected = []; // Mapbox returned something, but it failed the distance sanity check
  const notFound = []; // Mapbox returned nothing at all

  for (const [name, type] of ENTRIES) {
    const query = `${name}, Ota, Ogun State, Nigeria`;
    try {
      const result = await rawGeocode(query);
      if (!result) {
        notFound.push({ name, type });
        console.log(`✗ ${name} — no match at all`);
        await delay(250);
        continue;
      }

      const distanceKm = Math.round(haversineKm(OTA_CENTER, result) * 10) / 10;
      const looksReal = distanceKm <= MAX_DISTANCE_KM;

      const entry = {
        name, type,
        lat: result.lat, lng: result.lng,
        distance_from_ota_km: distanceKm,
        relevance: result.relevance,
        mapbox_place_name: result.place_name,
      };

      if (looksReal) {
        accepted.push(entry);
        const flag = result.relevance < MIN_RELEVANCE ? " (low relevance, worth eyeballing)" : "";
        console.log(`✓ ${name} — ${distanceKm}km away${flag}`);
      } else {
        rejected.push(entry);
        console.log(`✗ ${name} — REJECTED, ${distanceKm}km away (matched "${result.place_name}")`);
      }
    } catch (err) {
      notFound.push({ name, type, error: err.message });
      console.log(`✗ ${name} — error: ${err.message}`);
    }
    await delay(250);
  }

  const report = {
    generated_at: new Date().toISOString(),
    max_distance_km: MAX_DISTANCE_KM,
    total: ENTRIES.length,
    accepted_count: accepted.length,
    rejected_count: rejected.length,
    not_found_count: notFound.length,
    accepted,
    rejected,
    not_found: notFound,
  };

  fs.writeFileSync("gazetteer-report.json", JSON.stringify(report, null, 2));
  console.log(`\n${accepted.length}/${ENTRIES.length} genuinely resolved within ${MAX_DISTANCE_KM}km of Ota.`);
  console.log(`${rejected.length} were rejected as false matches (too far away).`);
  console.log(`${notFound.length} returned nothing at all.`);
  console.log(`${rejected.length + notFound.length} total need manual pinning — see gazetteer-report.json`);
}

run();
