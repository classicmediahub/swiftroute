// --- ADD THIS BLOCK to db.js's initSchema(), anywhere after the users
// table is created (e.g. right after the agent_profiles rides-location
// block from phase 1 is a natural spot). ---

// Deliberately a separate table from `deliveries`, not a reuse of it — a
// ride has no package, no recipient, and needs a live current position
// during the trip the same way a delivery does, but the two are different
// products even though they share a lot of the same mechanics (payment,
// matching, live tracking).
//
// No ride_events table yet (unlike delivery_events) — status history isn't
// exposed anywhere in the UI yet for rides, so it'd be unused. Add one
// later if a trip timeline view becomes needed.
await pool.query(`
  CREATE TABLE IF NOT EXISTS rides (
    id TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL REFERENCES users(id),
    agent_id TEXT REFERENCES users(id),
    pickup_address TEXT NOT NULL,
    pickup_lat REAL NOT NULL,
    pickup_lng REAL NOT NULL,
    dropoff_address TEXT NOT NULL,
    dropoff_lat REAL NOT NULL,
    dropoff_lng REAL NOT NULL,
    price REAL NOT NULL,
    distance_km REAL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','in_progress','completed','cancelled')),
    payment_status TEXT NOT NULL DEFAULT 'unpaid',
    paystack_reference TEXT,
    current_lat REAL,
    current_lng REAL,
    location_updated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    accepted_at TIMESTAMPTZ,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ
  );
`);
await pool.query(`
  CREATE UNIQUE INDEX IF NOT EXISTS rides_paystack_reference_idx
  ON rides(paystack_reference) WHERE paystack_reference IS NOT NULL;
`);
