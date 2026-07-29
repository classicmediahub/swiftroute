// --- ADD THIS BLOCK to db.js's initSchema(), anywhere after the
// agent_profiles table is created (e.g. right after the existing
// nin_verification_method / face_liveness block is fine). ---

// Live position for ride-hailing (phase 1: cab agents only, see agent.js).
// Distinct from deliveries.current_lat/lng, which tracks a driver's
// position *during a specific delivery in progress*. This tracks "where is
// this agent right now, whether or not they have a job" — needed to show
// nearby available drivers before any booking happens.
//
// location_updated_at doubles as the staleness check: an agent who closes
// their laptop without the dashboard's cleanup call firing will still show
// as "online" in the DB until you explicitly handle that — the public
// nearby-drivers query filters on location_updated_at being recent (see
// public.js), so a stale agent silently drops off the map on its own
// without needing a background job.
await pool.query(`ALTER TABLE agent_profiles ADD COLUMN IF NOT EXISTS current_lat REAL;`);
await pool.query(`ALTER TABLE agent_profiles ADD COLUMN IF NOT EXISTS current_lng REAL;`);
await pool.query(`ALTER TABLE agent_profiles ADD COLUMN IF NOT EXISTS location_updated_at TIMESTAMPTZ;`);
