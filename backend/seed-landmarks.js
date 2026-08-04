// Loads one institution's landmark data from an Excel file (same layout as
// Covenant_University_Shuttle_System_Template.xlsx — a "Bus Stops" sheet
// with ID/Bus Stop/Latitude/Longitude/Zone[/Data Source], and a "Distance
// Matrix" sheet with a symmetric From/To grid in km) into the
// institutions / landmarks / landmark_distances tables.
//
// Usage:
//   node seed-landmarks.js "Covenant University" Lagos ./path/to/file.xlsx
//
// Safe to re-run: an existing institution/landmark with the same name is
// reused (ON CONFLICT DO UPDATE) rather than duplicated, so re-seeding
// after fixing a few GPS coordinates just updates those rows in place.
require("dotenv").config();
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const XLSX = require("xlsx");
const { pool, initSchema } = require("./db");

async function main() {
  const [, , institutionName, city, filePath] = process.argv;
  if (!institutionName || !city || !filePath) {
    console.error('Usage: node seed-landmarks.js "Institution Name" City ./file.xlsx');
    process.exit(1);
  }

  await initSchema();

  const wb = XLSX.readFile(path.resolve(filePath));
  const busStopsSheet = wb.Sheets["Bus Stops"];
  const matrixSheet = wb.Sheets["Distance Matrix"];
  if (!busStopsSheet || !matrixSheet) {
    console.error('Expected sheets named "Bus Stops" and "Distance Matrix" — check the file.');
    process.exit(1);
  }

  const stops = XLSX.utils.sheet_to_json(busStopsSheet);
  const matrixRows = XLSX.utils.sheet_to_json(matrixSheet);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const institutionId = uuidv4();
    const { rows: instRows } = await client.query(
      `INSERT INTO institutions (id, name, city) VALUES ($1, $2, $3)
       ON CONFLICT (name) DO UPDATE SET city = EXCLUDED.city
       RETURNING id`,
      [institutionId, institutionName, city]
    );
    const resolvedInstitutionId = instRows[0].id;

    // name -> landmark id, needed to translate the distance matrix's
    // row/column names into foreign keys in the next step
    const landmarkIdByName = {};

    for (const stop of stops) {
      const name = stop["Bus Stop"];
      if (!name) continue;
      const lat = typeof stop.Latitude === "number" ? stop.Latitude : null;
      const lng = typeof stop.Longitude === "number" ? stop.Longitude : null;
      const zone = stop.Zone || null;
      const dataSource = stop["Data Source"] || "";
      const isVerified = /verified/i.test(dataSource) && !/needs on-site/i.test(dataSource);

      const landmarkId = uuidv4();
      const { rows } = await client.query(
        `INSERT INTO landmarks (id, institution_id, name, zone, latitude, longitude, is_verified)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (institution_id, name) DO UPDATE
           SET zone = EXCLUDED.zone, latitude = EXCLUDED.latitude,
               longitude = EXCLUDED.longitude, is_verified = EXCLUDED.is_verified
         RETURNING id`,
        [landmarkId, resolvedInstitutionId, name, zone, lat, lng, isVerified]
      );
      landmarkIdByName[name] = rows[0].id;
    }

    let pairsInserted = 0;
    for (const row of matrixRows) {
      const fromName = row["From/To"];
      const fromId = landmarkIdByName[fromName];
      if (!fromId) continue;
      for (const [toName, value] of Object.entries(row)) {
        if (toName === "From/To") continue;
        const toId = landmarkIdByName[toName];
        if (!toId || fromId === toId) continue;
        const distanceKm = typeof value === "number" ? value : null;
        if (distanceKm === null) continue;

        await client.query(
          `INSERT INTO landmark_distances (institution_id, from_landmark_id, to_landmark_id, distance_km)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (from_landmark_id, to_landmark_id) DO UPDATE SET distance_km = EXCLUDED.distance_km`,
          [resolvedInstitutionId, fromId, toId, distanceKm]
        );
        pairsInserted++;
      }
    }

    await client.query("COMMIT");
    console.log(`Seeded "${institutionName}": ${Object.keys(landmarkIdByName).length} landmarks, ${pairsInserted} distance pairs.`);
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Seeding failed:", err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
