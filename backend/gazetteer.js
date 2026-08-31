const { v4: uuidv4 } = require("uuid");
const { pool } = require("./db");
const { NEEDS_MANUAL_PIN, invalidateGazetteerCache } = require("./maps");

function normalize(s) {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
}

// An admin dropping/dragging a pin (or searching an address that happens
// to land on the right spot) writes straight here — no confirmation queue,
// same reasoning as adminCreateLandmark in landmarks.js: an admin manually
// placing the pin already *is* the verification. Invalidates maps.js's
// cache immediately so the new point is usable in the very next booking,
// not after a minute-long TTL.
async function createGazetteerPoint({ name, type, city, latitude, longitude, createdBy }) {
  if (!name || !name.trim()) throw new Error("name is required");
  if (latitude == null || longitude == null) throw new Error("A location must be set on the map before saving");

  const id = uuidv4();
  await pool.query(
    `INSERT INTO gazetteer_points (id, name, type, city, latitude, longitude, source, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,'admin',$7)
     ON CONFLICT (name, city)
     DO UPDATE SET type = EXCLUDED.type, latitude = EXCLUDED.latitude, longitude = EXCLUDED.longitude`,
    [id, name.trim(), type || "area", (city || "Ota").trim(), latitude, longitude, createdBy || null]
  );
  invalidateGazetteerCache();
  return id;
}

async function listGazetteerPoints() {
  const { rows } = await pool.query(
    `SELECT id, name, type, city, latitude, longitude, source, created_at
     FROM gazetteer_points
     ORDER BY created_at DESC`
  );
  return rows;
}

// The known 89-name backlog from check-gazetteer.js's audit, minus
// whatever's already been pinned (matched by normalized name, regardless
// of which city it ended up filed under) — so the admin queue only ever
// shows what's genuinely still missing, and shrinks as points get added.
async function getPinningQueue() {
  const { rows } = await pool.query("SELECT name FROM gazetteer_points");
  const pinned = new Set(rows.map((r) => normalize(r.name)));
  return NEEDS_MANUAL_PIN.filter((name) => !pinned.has(normalize(name)));
}

module.exports = { createGazetteerPoint, listGazetteerPoints, getPinningQueue };
