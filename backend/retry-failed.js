// Run this AFTER check-gazetteer.js, once gazetteer-report.json exists:
//   node retry-failed.js
//
// Almost every rejected entry in the first pass fell back to the exact same
// wrong match ("Ota Street, Ijebu Ode") — including well-known places like
// Covenant University that really should be findable. That pattern suggests
// appending ", Ota, Ogun State, Nigeria" to every query may itself be the
// problem: Mapbox's fuzzy matcher may be keying off the literal word "Ota"
// and finding an unrelated street named that in a different town, instead
// of actually matching the real name. This tries a few different phrasings
// per failed entry to check that theory, rather than assuming everything
// that failed once is genuinely absent from Mapbox's data.

require("dotenv").config();
const fs = require("fs");

const MAPBOX_TOKEN = process.env.MAPBOX_ACCESS_TOKEN;
const OTA_CENTER = { lat: 6.6805, lng: 3.2356 };
const MAX_DISTANCE_KM = 20;

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
  return { lat, lng, relevance: feature.relevance, place_name: feature.place_name };
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Three phrasings per entry — deliberately avoiding the bare word "Ota" in
// the first two, since that's the suspected culprit.
function buildQueryVariants(name) {
  return [
    `${name}, Nigeria`,
    `${name}, Ogun State, Nigeria`,
    `${name}, Ado-Odo/Ota, Ogun State, Nigeria`,
  ];
}

async function run() {
  if (!MAPBOX_TOKEN) throw new Error("MAPBOX_ACCESS_TOKEN is not set");
  if (!fs.existsSync("gazetteer-report.json")) {
    throw new Error("gazetteer-report.json not found — run check-gazetteer.js first");
  }

  const previous = JSON.parse(fs.readFileSync("gazetteer-report.json", "utf-8"));
  const toRetry = [...previous.rejected, ...previous.not_found];

  const recovered = [];
  const stillFailed = [];

  for (const item of toRetry) {
    let found = null;
    let matchedQuery = null;

    for (const query of buildQueryVariants(item.name)) {
      try {
        const result = await rawGeocode(query);
        await delay(250);
        if (!result) continue;
        const distanceKm = Math.round(haversineKm(OTA_CENTER, result) * 10) / 10;
        if (distanceKm <= MAX_DISTANCE_KM) {
          found = { ...result, distanceKm };
          matchedQuery = query;
          break; // stop at the first phrasing that gives a plausible match
        }
      } catch (err) {
        console.log(`  error on "${query}": ${err.message}`);
      }
    }

    if (found) {
      recovered.push({
        name: item.name,
        type: item.type,
        lat: found.lat,
        lng: found.lng,
        distance_from_ota_km: found.distanceKm,
        matched_via_query: matchedQuery,
        mapbox_place_name: found.place_name,
      });
      console.log(`✓ RECOVERED: ${item.name} — ${found.distanceKm}km away, via "${matchedQuery}"`);
    } else {
      stillFailed.push(item);
      console.log(`✗ still no good match: ${item.name}`);
    }
  }

  const report = {
    generated_at: new Date().toISOString(),
    retried: toRetry.length,
    recovered_count: recovered.length,
    still_failed_count: stillFailed.length,
    recovered,
    still_failed: stillFailed,
  };

  fs.writeFileSync("gazetteer-retry-report.json", JSON.stringify(report, null, 2));
  console.log(`\n${recovered.length}/${toRetry.length} recovered with a different query phrasing.`);
  console.log(`${stillFailed.length} genuinely still need manual pinning — see gazetteer-retry-report.json`);
}

run();
