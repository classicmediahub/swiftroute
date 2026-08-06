const { pool } = require("./db");

// ---------- LOCKERS — self-collection points at a campus gate or a
// market, chosen by the CUSTOMER at delivery creation as the drop-off
// destination (see routes/deliveries.js's POST / — dropoff_locker_id).
// Solves the "last 100 meters" problem: an agent drops at one known,
// easy-to-find point instead of hunting for an exact hostel room or
// market stall. institution_id is nullable — set for campus lockers,
// null for standalone market/city lockers (see db.js).
//
// SCOPE NOTE (v1): lockers only apply to the DROP-OFF side, and are a
// separate mode from campus/landmark delivery rather than combinable with
// it — a locker delivery still uses a normal pickup address. Letting a
// campus-landmark pickup pair with a locker drop-off is a reasonable
// future extension, not done here to avoid a larger refactor of the
// existing campus-mode branching in routes/deliveries.js.

function generatePickupCode() {
  return String(Math.floor(100000 + Math.random() * 900000)); // 6-digit numeric — easy to read aloud or punch into a keypad
}

async function listLockers({ institutionId, city } = {}) {
  if (institutionId) {
    const { rows } = await pool.query(
      "SELECT * FROM lockers WHERE institution_id = $1 AND is_active = true ORDER BY name",
      [institutionId]
    );
    return rows;
  }
  if (city) {
    const { rows } = await pool.query(
      "SELECT * FROM lockers WHERE institution_id IS NULL AND city = $1 AND is_active = true ORDER BY name",
      [city]
    );
    return rows;
  }
  return [];
}

async function getLocker(lockerId) {
  const { rows } = await pool.query("SELECT * FROM lockers WHERE id = $1", [lockerId]);
  return rows[0] || null;
}

// Admin-only view — every locker regardless of active status, with the
// institution name joined in for display (listLockers above deliberately
// only returns active ones and needs an institutionId/city filter, since
// it's the customer-facing picker's data source).
async function listAllLockers() {
  const { rows } = await pool.query(
    `SELECT l.*, i.name AS institution_name
     FROM lockers l LEFT JOIN institutions i ON i.id = l.institution_id
     ORDER BY l.created_at DESC`
  );
  return rows;
}

// Called from routes/deliveries.js's /advance endpoint when an agent
// reaches the locker-drop step. Locks the locker's own row for the
// duration of the transaction (SELECT ... FOR UPDATE) so two agents
// dropping off at the same locker at the same moment can't both be
// assigned the same slot number — the second one simply waits for the
// first transaction to commit, then sees the now-occupied slot and picks
// the next free one. Returns null (not a throw) when the locker is
// completely full, so the caller can show a clear "locker is full" error.
async function dropAtLocker(deliveryId, lockerId) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: lockerRows } = await client.query(
      "SELECT total_slots FROM lockers WHERE id = $1 FOR UPDATE",
      [lockerId]
    );
    const totalSlots = lockerRows[0]?.total_slots;
    if (!totalSlots) { await client.query("ROLLBACK"); return null; }

    const { rows: occupied } = await client.query(
      "SELECT locker_slot FROM deliveries WHERE locker_id = $1 AND status = 'at_locker' AND locker_slot IS NOT NULL",
      [lockerId]
    );
    const used = new Set(occupied.map((r) => r.locker_slot));
    let slot = null;
    for (let i = 1; i <= totalSlots; i++) {
      if (!used.has(i)) { slot = i; break; }
    }
    if (slot === null) { await client.query("ROLLBACK"); return null; } // full

    const pickupCode = generatePickupCode();
    await client.query(
      "UPDATE deliveries SET status = 'at_locker', locker_slot = $1, locker_pickup_code = $2, locker_dropped_at = now() WHERE id = $3",
      [slot, pickupCode, deliveryId]
    );
    await client.query("COMMIT");
    return { slot, pickupCode };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Locker drop-off failed:", err.message);
    return null;
  } finally {
    client.release();
  }
}

// Whoever has both the tracking code and the pickup code can redeem —
// not necessarily the account holder. A roommate or friend collecting on
// someone's behalf is a completely normal case for a locker, so this is
// deliberately NOT gated behind requireAuth in the route (see
// routes/deliveries.js's POST /locker-redeem) — the two codes together
// are the access key, same trust model as tracking-by-code already uses.
// Returns the completed delivery row, or null if the code/state don't match.
async function redeemLocker(trackingCode, pickupCode) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      "SELECT * FROM deliveries WHERE tracking_code = $1 FOR UPDATE",
      [trackingCode.toUpperCase()]
    );
    const delivery = rows[0];
    if (!delivery || delivery.status !== "at_locker" || delivery.locker_pickup_code !== pickupCode.trim()) {
      await client.query("ROLLBACK");
      return null;
    }

    await client.query(
      "UPDATE deliveries SET status = 'delivered', delivered_at = now(), locker_picked_up_at = now() WHERE id = $1",
      [delivery.id]
    );
    await client.query("COMMIT");

    const { rows: updated } = await pool.query("SELECT * FROM deliveries WHERE id = $1", [delivery.id]);
    return updated[0];
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Locker redeem failed:", err.message);
    return null;
  } finally {
    client.release();
  }
}

module.exports = { listLockers, listAllLockers, getLocker, dropAtLocker, redeemLocker, generatePickupCode };
