// Run this AFTER retry-failed.js, once gazetteer-retry-report.json exists:
//   node dedupe-check.js
//
// The distance-from-Ota check alone wasn't enough — a broad regional
// fallback (e.g. the Ado-Odo/Ota LGA's centroid) can coincidentally land
// within the "plausible" distance and pass that check, even though it's
// not the place's real individual location. The giveaway is that MANY
// different real places end up sharing the exact same coordinate — real
// distinct locations don't do that. This groups everything by coordinate
// and flags any group of 2+ as a likely shared fallback, moving them back
// to "needs manual verification" rather than trusting them.

const fs = require("fs");

function loadJson(path) {
  return JSON.parse(fs.readFileSync(path, "utf-8"));
}

function coordKey(lat, lng) {
  // Same key for anything within ~11m of each other — genuinely distinct
  // real-world places essentially never land this close by coincidence.
  return `${lat.toFixed(4)},${lng.toFixed(4)}`;
}

function run() {
  if (!fs.existsSync("gazetteer-report.json") || !fs.existsSync("gazetteer-retry-report.json")) {
    throw new Error("Run check-gazetteer.js and retry-failed.js first");
  }

  const first = loadJson("gazetteer-report.json");
  const retry = loadJson("gazetteer-retry-report.json");

  const allCandidates = [...first.accepted, ...retry.recovered];

  const groups = new Map();
  for (const entry of allCandidates) {
    const key = coordKey(entry.lat, entry.lng);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(entry);
  }

  const trustworthy = [];
  const suspiciousSharedFallback = [];

  for (const group of groups.values()) {
    if (group.length >= 2) {
      suspiciousSharedFallback.push(...group);
    } else {
      trustworthy.push(group[0]);
    }
  }

  const stillNeedsPinning = [...retry.still_failed, ...suspiciousSharedFallback.map((e) => ({ name: e.name, type: e.type }))];

  const report = {
    generated_at: new Date().toISOString(),
    trustworthy_count: trustworthy.length,
    suspicious_shared_fallback_count: suspiciousSharedFallback.length,
    still_needs_pinning_count: stillNeedsPinning.length,
    trustworthy,
    suspicious_shared_fallback: suspiciousSharedFallback,
    still_needs_pinning: stillNeedsPinning,
  };

  fs.writeFileSync("gazetteer-final-report.json", JSON.stringify(report, null, 2));

  console.log(`Checked ${allCandidates.length} candidates across ${groups.size} distinct coordinates.\n`);

  if (suspiciousSharedFallback.length) {
    console.log(`⚠ ${suspiciousSharedFallback.length} entries were sharing a coordinate with something else — flagged as untrustworthy:`);
    for (const [key, group] of groups) {
      if (group.length >= 2) {
        console.log(`  Shared point ${key} claimed by: ${group.map((g) => g.name).join(", ")}`);
      }
    }
    console.log("");
  }

  console.log(`${trustworthy.length} entries have a genuinely unique, trustworthy coordinate.`);
  console.log(`${stillNeedsPinning.length} total now need manual pinning — see gazetteer-final-report.json`);
}

run();
