const { Pool } = require("pg");

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is not set. Add it to your .env file (see .env.example) — " +
    "either a local Postgres connection string or the one Render gives you."
  );
}

// Render's managed Postgres requires SSL; a local database usually doesn't
// support it. Skip SSL only when we can tell we're pointed at localhost.
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

  // Payment columns were added after the first release — these migrations
  // bring older databases up to date without touching existing data.
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
}

module.exports = { pool, initSchema };
