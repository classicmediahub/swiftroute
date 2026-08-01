const { Pool } = require("pg");

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is not set. Add it to your .env file (see .env.example) — " +
    "either a local Postgres connection string or the one Render gives you."
  );
}

const isLocal = /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isLocal ? false : { rejectUnauthorized: false },
});

async function initSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      role TEXT NOT NULL CHECK (role IN ('customer','agent','admin')),
      full_name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      phone TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS agent_profiles (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      vehicle_type TEXT NOT NULL CHECK (vehicle_type IN ('self','bike','cab')),
      vehicle_make TEXT,
      vehicle_plate TEXT,
      license_number TEXT,
      city TEXT,
      approval_status TEXT NOT NULL DEFAULT 'pending' CHECK (approval_status IN ('pending','approved','rejected','suspended')),
      is_online INTEGER NOT NULL DEFAULT 0,
      rating REAL NOT NULL DEFAULT 5.0,
      total_deliveries INTEGER NOT NULL DEFAULT 0,
      wallet_balance REAL NOT NULL DEFAULT 0
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS deliveries (
      id TEXT PRIMARY KEY,
      customer_id TEXT NOT NULL REFERENCES users(id),
      agent_id TEXT REFERENCES users(id),
      package_type TEXT NOT NULL,
      package_note TEXT,
      pickup_address TEXT NOT NULL,
      pickup_city TEXT NOT NULL,
      dropoff_address TEXT NOT NULL,
      dropoff_city TEXT NOT NULL,
      recipient_name TEXT NOT NULL,
      recipient_phone TEXT NOT NULL,
      preferred_vehicle TEXT NOT NULL DEFAULT 'any' CHECK (preferred_vehicle IN ('any','self','bike','cab')),
      price REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','picked_up','in_transit','delivered','cancelled')),
      tracking_code TEXT NOT NULL UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      accepted_at TIMESTAMPTZ,
      picked_up_at TIMESTAMPTZ,
      delivered_at TIMESTAMPTZ,
      cancelled_at TIMESTAMPTZ
    );
  `);

  await pool.query(`ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'unpaid';`);
  await pool.query(`ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS paystack_reference TEXT;`);
  await pool.query(`ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS distance_km REAL;`);
  await pool.query(`ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS current_lat REAL;`);
  await pool.query(`ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS current_lng REAL;`);
  await pool.query(`ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS location_updated_at TIMESTAMPTZ;`);
  await pool.query(`ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS pickup_lat REAL;`);
  await pool.query(`ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS pickup_lng REAL;`);
  await pool.query(`ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS dropoff_lat REAL;`);
  await pool.query(`ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS dropoff_lng REAL;`);
  await pool.query(`ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS pickup_landmark TEXT;`);
  await pool.query(`ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS dropoff_landmark TEXT;`);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS deliveries_paystack_reference_idx
    ON deliveries(paystack_reference) WHERE paystack_reference IS NOT NULL;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS delivery_events (
      id TEXT PRIMARY KEY,
      delivery_id TEXT NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      note TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS reviews (
      id TEXT PRIMARY KEY,
      delivery_id TEXT NOT NULL UNIQUE REFERENCES deliveries(id) ON DELETE CASCADE,
      customer_id TEXT NOT NULL REFERENCES users(id),
      agent_id TEXT NOT NULL REFERENCES users(id),
      rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
      comment TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS wallet_balance REAL NOT NULL DEFAULT 0;`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS account_type TEXT NOT NULL DEFAULT 'individual';`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS company_name TEXT;`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS webhook_url TEXT;`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS webhook_secret TEXT;`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_photo TEXT;`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS api_keys (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      label TEXT NOT NULL,
      key_prefix TEXT NOT NULL,
      key_hash TEXT NOT NULL,
      last_used_at TIMESTAMPTZ,
      revoked BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS payment_method TEXT NOT NULL DEFAULT 'paystack';`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS wallet_transactions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      type TEXT NOT NULL CHECK (type IN ('topup','delivery_payment','refund')),
      amount REAL NOT NULL,
      balance_after REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'success' CHECK (status IN ('pending','success','failed')),
      reference TEXT UNIQUE,
      delivery_id TEXT REFERENCES deliveries(id),
      note TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  // --- Email verification (all roles) + NIN/liveness checks (agents only) ---
  // Every account gets an email_verified flag, set true once they click the
  // link sent to their inbox. This does NOT block login/dashboard access —
  // it's informational, not a hard gate.
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT false;`);

  // NIN + face-liveness are hard gates, checked before an agent account is
  // even created (see routes/auth.js) — unlike email, a failed check means
  // signup is rejected outright, not just flagged. This happens before the
  // separate human review already represented by agent_profiles.approval_status.
  //
  // IMPORTANT — nin_verification_method records *how strong* nin_verified's
  // guarantee actually is. As of this migration it's always 'format_only':
  // confirms the NIN is well-formed, NOT that it's real or belongs to this
  // person (see nin.js for why). Recorded explicitly rather than left
  // implicit, so a 'format_only' pass is never later mistaken for a real
  // identity confirmation in an audit, a dispute, or a future migration to
  // a stronger check.
  //
  // Same idea for face_liveness_verified: confirms a live person was in
  // front of the camera at signup, NOT that this photo matches any other
  // photo of them (see face.js for how that's checked, and why login's
  // Face++ identity match is a separate, unchanged mechanism).
  //
  // Deliberately NOT storing raw liveness sample data or any third-party
  // provider response — only booleans + timestamps, to keep biometric
  // detail out of the database.
  await pool.query(`ALTER TABLE agent_profiles ADD COLUMN IF NOT EXISTS date_of_birth DATE;`);
  await pool.query(`ALTER TABLE agent_profiles ADD COLUMN IF NOT EXISTS nin TEXT;`);
  await pool.query(`ALTER TABLE agent_profiles ADD COLUMN IF NOT EXISTS nin_verified BOOLEAN NOT NULL DEFAULT false;`);
  await pool.query(`ALTER TABLE agent_profiles ADD COLUMN IF NOT EXISTS nin_verified_at TIMESTAMPTZ;`);
  await pool.query(`ALTER TABLE agent_profiles ADD COLUMN IF NOT EXISTS nin_verification_method TEXT NOT NULL DEFAULT 'format_only';`);
  await pool.query(`ALTER TABLE agent_profiles ADD COLUMN IF NOT EXISTS face_liveness_verified BOOLEAN NOT NULL DEFAULT false;`);
  await pool.query(`ALTER TABLE agent_profiles ADD COLUMN IF NOT EXISTS face_liveness_verified_at TIMESTAMPTZ;`);

  // --- Rides phase 1: live driver position, independent of any specific
  // job (see routes/agent.js and routes/public.js's /nearby-drivers). ---
  await pool.query(`ALTER TABLE agent_profiles ADD COLUMN IF NOT EXISTS current_lat REAL;`);
  await pool.query(`ALTER TABLE agent_profiles ADD COLUMN IF NOT EXISTS current_lng REAL;`);
  await pool.query(`ALTER TABLE agent_profiles ADD COLUMN IF NOT EXISTS location_updated_at TIMESTAMPTZ;`);

  // --- Rides phase 2: booking, payment, and matching (see routes/rides.js).
  // A separate table from `deliveries` on purpose — a ride has no package
  // or recipient, but does need its own live position during an active
  // trip, tracked the same way a delivery's current_lat/lng is. No
  // ride_events table yet (unlike delivery_events) — status history isn't
  // shown anywhere in the UI yet, so one would go unused for now. ---
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

  // --- Ride ratings/reviews. Separate table from `reviews` (delivery-
  // specific, its delivery_id is NOT NULL) rather than generalizing that
  // one — keeps the delivery review code untouched. agent_profiles.rating
  // stays a single blended number across both job types (see rides.js's
  // recomputeAgentRating), since a cab agent has one reputation to
  // customers regardless of which kind of job it came from — but
  // total_rides is tracked as its own counter, separate from
  // total_deliveries, since a ride isn't a delivery even when the same
  // agent does both. ---
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
  await pool.query(`ALTER TABLE agent_profiles ADD COLUMN IF NOT EXISTS total_rides INTEGER NOT NULL DEFAULT 0;`);
}

module.exports = { pool, initSchema };
