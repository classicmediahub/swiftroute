// --- ADD THIS BLOCK to db.js's initSchema(), anywhere after the rides
// table (phase 2) is created. ---

// Separate table from `reviews` (which is delivery-specific — its
// delivery_id column is NOT NULL) rather than trying to generalize that
// table to cover both job types. Keeps the delivery review code
// untouched and avoids a nullable-foreign-key mess.
await pool.query(`
  CREATE TABLE IF NOT EXISTS ride_reviews (
    id TEXT PRIMARY KEY,
    ride_id TEXT NOT NULL UNIQUE REFERENCES rides(id) ON DELETE CASCADE,
    customer_id TEXT NOT NULL REFERENCES users(id),
    agent_id TEXT NOT NULL REFERENCES users(id),
    rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
`);

// total_deliveries already exists and is literally about deliveries — a
// separate total_rides counter instead of overloading that name.
// agent_profiles.rating stays a single blended number across BOTH job
// types (see rides.js's /review endpoint), since a cab agent's reputation
// is one thing to a customer regardless of whether the job was a parcel
// or a passenger trip — but the two counters underneath it are tracked
// separately, since they're genuinely different work.
await pool.query(`ALTER TABLE agent_profiles ADD COLUMN IF NOT EXISTS total_rides INTEGER NOT NULL DEFAULT 0;`);
