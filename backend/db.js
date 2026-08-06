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

  // --- Campus/institution deliveries: lets a customer pick a known
  // institution (e.g. a university campus) and a specific landmark on it
  // instead of typing a free-text address. Distances between landmarks are
  // pre-computed and stored directly (landmark_distances) rather than
  // geocoded per-request — Nigerian street addressing inside a large
  // campus is unreliable, but the relative layout of named landmarks on
  // one campus is stable and only needs computing once (see
  // seed-landmarks.js). is_verified on landmarks tracks whether its
  // lat/lng came from a real on-site GPS check or was estimated — see
  // seed-landmarks.js's "Data Source" column handling. Distances are
  // stored in km, matching distance_km elsewhere in this file. ---
  await pool.query(`
    CREATE TABLE IF NOT EXISTS institutions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      city TEXT NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS landmarks (
      id TEXT PRIMARY KEY,
      institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      zone TEXT,
      latitude REAL,
      longitude REAL,
      is_verified BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (institution_id, name)
    );
  `);

  // Stored as directed pairs (both A->B and B->A) so a lookup never needs
  // an ORDER BY / LEAST-GREATEST trick — just match from_landmark_id and
  // to_landmark_id exactly as given. Distances are symmetric in practice
  // (see seed-landmarks.js), this just avoids extra query complexity.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS landmark_distances (
      institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
      from_landmark_id TEXT NOT NULL REFERENCES landmarks(id) ON DELETE CASCADE,
      to_landmark_id TEXT NOT NULL REFERENCES landmarks(id) ON DELETE CASCADE,
      distance_km REAL NOT NULL,
      PRIMARY KEY (from_landmark_id, to_landmark_id)
    );
  `);

  // Nullable — only set when a delivery was created via the campus/landmark
  // picker rather than the normal free-text address flow. pickup_address /
  // dropoff_address / pickup_landmark / dropoff_landmark still get filled
  // with the landmark's name on creation (see routes/deliveries.js), so
  // every existing display (delivery list, tracking, agent view) keeps
  // working unmodified whether or not a delivery used this flow.
  await pool.query(`ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS institution_id TEXT REFERENCES institutions(id);`);
  await pool.query(`ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS pickup_landmark_id TEXT REFERENCES landmarks(id);`);
  await pool.query(`ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS dropoff_landmark_id TEXT REFERENCES landmarks(id);`);

  // --- Streaks (customer + agent) — shared columns on `users` since both
  // roles use identical storage and milestone logic; only WHAT counts as a
  // "streak day" differs per role (see streaks.js: customers on order
  // creation, agents on delivery/ride completion — called from
  // routes/deliveries.js and routes/rides.js respectively). Milestone
  // rewards land as a new 'streak_reward' wallet_transactions row, so a
  // streak bonus shows up in a customer's/agent's transaction history the
  // same way a topup or delivery payment would. ---
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS current_streak INTEGER NOT NULL DEFAULT 0;`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS longest_streak INTEGER NOT NULL DEFAULT 0;`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_streak_date DATE;`);

  await pool.query(`ALTER TABLE wallet_transactions DROP CONSTRAINT IF EXISTS wallet_transactions_type_check;`);
  await pool.query(`
    ALTER TABLE wallet_transactions ADD CONSTRAINT wallet_transactions_type_check
    CHECK (type IN ('topup','delivery_payment','refund','streak_reward','referral_reward','landmark_reward'));
  `);

  // --- Crowdsourced landmarks — extends the institution/landmark system
  // (originally seeded manually, see seed-landmarks.js) so it improves
  // itself over time instead of staying frozen at whatever was seeded.
  // A submission only becomes a real, usable landmark (in the `landmarks`
  // table routes/deliveries.js's picker reads from) once CONFIRMATION_THRESHOLD
  // independent users vouch for it — see landmarks.js. Kept as its own
  // table rather than inserting straight into `landmarks`, so an
  // unverified submission can never accidentally show up in the delivery
  // picker before it's actually trusted. ---
  await pool.query(`
    CREATE TABLE IF NOT EXISTS landmark_submissions (
      id TEXT PRIMARY KEY,
      institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
      submitted_by TEXT NOT NULL REFERENCES users(id),
      name TEXT NOT NULL,
      zone TEXT,
      latitude REAL,
      longitude REAL,
      note TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
      confirmation_count INTEGER NOT NULL DEFAULT 0,
      reward_given BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      reviewed_at TIMESTAMPTZ,
      reviewed_by TEXT REFERENCES users(id)
    );
  `);

  // One confirmation per user per submission (UNIQUE below) — stops
  // someone gaming the threshold by confirming their own or a friend's
  // submission repeatedly.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS landmark_confirmations (
      id TEXT PRIMARY KEY,
      submission_id TEXT NOT NULL REFERENCES landmark_submissions(id) ON DELETE CASCADE,
      confirmed_by TEXT NOT NULL REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (submission_id, confirmed_by)
    );
  `);

  // --- Referrals (customer + agent) — same "only the referrer earns"
  // model for both roles, only the trigger event differs: a referred
  // customer's first COMPLETED delivery, or a referred agent's first
  // COMPLETED job (see referrals.js — both checks fire from the same
  // "delivered" transition in routes/deliveries.js, no separate polling
  // needed). referral_reward_given lives on the REFERRED user's row, not
  // the referrer's — it's a one-shot flag meaning "the reward for
  // referring me has already been paid out", so a referred user's second,
  // third, etc. completed job never pays out again.
  //
  // referral_code existed nowhere before this migration, so existing
  // users get one backfilled here rather than left NULL — otherwise
  // anyone who signed up before this feature shipped would have no code
  // to share. New signups get theirs assigned at signup time instead (see
  // referrals.js's assignUniqueReferralCode, called from routes/auth.js). ---
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code TEXT;`);
  await pool.query(`
    UPDATE users SET referral_code = upper(substr(md5(random()::text || id), 1, 7))
    WHERE referral_code IS NULL;
  `);
  await pool.query(`ALTER TABLE users ALTER COLUMN referral_code SET NOT NULL;`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS users_referral_code_idx ON users(referral_code);`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by TEXT REFERENCES users(id);`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_reward_given BOOLEAN NOT NULL DEFAULT false;`);

  // --- Agent reputation: on-time tracking. estimated_delivery_at is set
  // once, at creation time (see backend/eta.js + routes/deliveries.js),
  // from distance + vehicle type — NOT re-estimated later, so an agent
  // can't "beat the clock" by the estimate quietly loosening after they
  // accept a slow job. "On time" is simply delivered_at <= estimated_delivery_at,
  // computed on demand by reputation.js rather than stored, since it only
  // needs to exist once a delivery actually completes. ---
  await pool.query(`ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS estimated_delivery_at TIMESTAMPTZ;`);

  // --- WhatsApp ordering bot: one row per phone number, tracking which
  // step of the conversation they're on and whatever they've answered so
  // far (see whatsapp.js). Reset to idle/{} once an order completes or is
  // cancelled — this is conversation scratch space, not order history;
  // the actual order lives in `deliveries` like any other. ---
  await pool.query(`
    CREATE TABLE IF NOT EXISTS whatsapp_sessions (
      phone TEXT PRIMARY KEY,
      state TEXT NOT NULL DEFAULT 'idle',
      data JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

module.exports = { pool, initSchema };
