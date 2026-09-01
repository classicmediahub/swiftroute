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
      role TEXT NOT NULL CHECK (role IN ('customer','agent','admin','outlet')),
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
  // Job Boost — a free toggle (see boost.js). When true, this agent sees
  // brand-new jobs in /available immediately instead of after the public
  // delay window; the actual fee only gets charged if they go on to claim
  // one before that window opens, so turning this on carries no cost by
  // itself.
  await pool.query(`ALTER TABLE agent_profiles ADD COLUMN IF NOT EXISTS boost_enabled BOOLEAN NOT NULL DEFAULT false;`);
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

  // NOTE: wallet_transactions_type_check is defined once, near the bottom
  // of this file, after every order type (gas/food/etc.) that writes a
  // wallet_transactions row has been introduced. Earlier drafts of this
  // schema re-defined this same constraint multiple times as new types
  // were added — each with a narrower list than the types actually in use
  // by then — which meant every single boot re-validated ALL existing
  // rows against a stale, incomplete list and could crash the whole
  // server the moment a real gas/food/withdrawal transaction existed.
  // Consolidated to the one definition below; don't reintroduce an
  // earlier, narrower copy of this constraint.

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

  // --- Lockers — self-collection points at a campus gate or market,
  // chosen by the customer at delivery creation as the drop-off
  // destination (see lockers.js). institution_id is nullable: set for
  // campus lockers, null + city set for standalone market/city lockers
  // not tied to any institution. ---
  await pool.query(`
    CREATE TABLE IF NOT EXISTS lockers (
      id TEXT PRIMARY KEY,
      institution_id TEXT REFERENCES institutions(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      city TEXT NOT NULL,
      address TEXT,
      latitude REAL,
      longitude REAL,
      total_slots INTEGER NOT NULL DEFAULT 20,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await pool.query(`ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS locker_id TEXT REFERENCES lockers(id);`);
  await pool.query(`ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS locker_slot INTEGER;`);
  await pool.query(`ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS locker_pickup_code TEXT;`);
  await pool.query(`ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS locker_dropped_at TIMESTAMPTZ;`);
  await pool.query(`ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS locker_picked_up_at TIMESTAMPTZ;`);

  // 'at_locker' sits between 'in_transit' and 'delivered' — an agent
  // dropping at a locker stops here (see routes/deliveries.js's /advance
  // NEXT_STATUS logic); 'delivered' only fires once the customer (or
  // whoever holds the pickup code) redeems it via /locker-redeem. Every
  // OTHER delivery's status list is unaffected — 'at_locker' just never
  // appears unless a delivery actually has a locker_id set.
  await pool.query(`ALTER TABLE deliveries DROP CONSTRAINT IF EXISTS deliveries_status_check;`);
  await pool.query(`
    ALTER TABLE deliveries ADD CONSTRAINT deliveries_status_check
    CHECK (status IN ('pending','accepted','picked_up','in_transit','at_locker','delivered','cancelled'));
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

  // --- Delivery pooling (campus clusters) — see pooling.js. A pool
  // stays 'open' for POOL_WINDOW_MINUTES so other deliveries to the same
  // institution can join; whichever agent accepts one pooled delivery
  // gets offered the WHOLE pool as one job (see routes/deliveries.js's
  // POST /pools/:id/accept), at which point status flips to 'claimed'
  // and no new deliveries can join. pool_original_price on `deliveries`
  // is the pre-discount baseline — needed because rebalancePoolPricing
  // recomputes every member's discount off their TRUE original price
  // each time the group grows, never off an already-discounted price. ---
  await pool.query(`
    CREATE TABLE IF NOT EXISTS delivery_pools (
      id TEXT PRIMARY KEY,
      institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','claimed','expired')),
      agent_id TEXT REFERENCES users(id),
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS pool_id TEXT REFERENCES delivery_pools(id);`);
  await pool.query(`ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS pool_original_price REAL;`);

  // --- Proof-of-delivery photo — required when an agent marks a normal
  // (non-locker) delivery as 'delivered' (see routes/deliveries.js's
  // /advance). Locker deliveries don't need this: the pickup code itself
  // is already proof of collection. Stored as a base64 data URL directly
  // in the row, same convention as users.profile_photo elsewhere in this
  // schema — not a separate file-storage system.
  await pool.query(`ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS proof_photo TEXT;`);

  // --- Guaranteed delivery windows (see guarantee.js). A customer pays a
  // small flat surcharge at creation to opt in; if the package isn't
  // handed off by estimated_delivery_at, the penalty credit fires
  // automatically — no manual claim. "Handed off" means 'delivered' for a
  // normal delivery, or the agent's LOCKER DROP-OFF for a locker delivery
  // (not whenever the customer eventually collects it, which is outside
  // the platform's control — see routes/deliveries.js's /advance).
  await pool.query(`ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS guaranteed BOOLEAN NOT NULL DEFAULT false;`);
  await pool.query(`ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS guarantee_fee REAL;`);
  await pool.query(`ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS guarantee_penalty_paid BOOLEAN NOT NULL DEFAULT false;`);

  // --- Elite Agents (see elite.js). elite_requested is set at creation
  // when the customer pays the surcharge; enforcement happens at accept
  // time (routes/deliveries.js's POST /:id/accept) — an agent who doesn't
  // currently qualify simply can't accept an elite-requested delivery.
  // Qualification is computed on demand from the same reputation numbers
  // a customer already sees (reputation.js), never cached, so it can't
  // drift stale from an agent's actual recent performance.
  await pool.query(`ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS elite_requested BOOLEAN NOT NULL DEFAULT false;`);
  await pool.query(`ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS elite_fee REAL;`);

  // --- Real declared-value insurance (see insurance.js) — turns the
  // landing page's "insured up to ₦50,000" line into an actual product
  // rather than just copy. Premium is a small % of the covered value,
  // paid at creation; a claim is a real, admin-reviewed request, not an
  // automatic refund — a human has to look at it before money moves,
  // same spirit as agent NIN/liveness review already requiring a person
  // in the loop for anything identity/trust related.
  await pool.query(`ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS declared_value REAL;`);
  await pool.query(`ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS insurance_premium REAL;`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS insurance_claims (
      id TEXT PRIMARY KEY,
      delivery_id TEXT NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,
      customer_id TEXT NOT NULL REFERENCES users(id),
      reason TEXT NOT NULL,
      claim_amount REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
      reviewed_by TEXT REFERENCES users(id),
      reviewed_at TIMESTAMPTZ,
      payout_amount REAL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  // A delivery can only have one active (pending or approved) claim at a
  // time — a rejected claim can be re-filed (e.g. with better evidence),
  // but you can't stack multiple simultaneous claims on the same delivery.
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS insurance_claims_one_active_per_delivery
    ON insurance_claims(delivery_id) WHERE status IN ('pending','approved');
  `);

  // --- Returns / reverse logistics — deliberately NOT a separate system.
  // A return is functionally an ordinary delivery (same pricing, tracking,
  // agent matching, proof-of-delivery) just framed in reverse: pickup is
  // the customer's location, drop-off is the business's. These three
  // columns are purely metadata for that framing + linking back to the
  // original outbound order — no new pricing/quote logic needed anywhere.
  await pool.query(`ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS is_return BOOLEAN NOT NULL DEFAULT false;`);
  await pool.query(`ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS original_delivery_id TEXT REFERENCES deliveries(id);`);
  await pool.query(`ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS return_reason TEXT;`);

  // --- Ride fixes: wallet payment parity with deliveries (rides were
  // Paystack-only until now, despite sharing the same wallet_balance a
  // customer might have real credit sitting in from a delivery refund),
  // and letting a wallet-linked transaction reference a ride the same way
  // one can already reference a delivery. cancelled_by records WHO
  // cancelled — needed because an agent-initiated cancellation
  // auto-refunds a paid ride (not the customer's fault), while a
  // customer-initiated one doesn't (unchanged existing behavior). ---
  await pool.query(`ALTER TABLE rides ADD COLUMN IF NOT EXISTS payment_method TEXT NOT NULL DEFAULT 'paystack';`);
  await pool.query(`ALTER TABLE rides ADD COLUMN IF NOT EXISTS cancelled_by TEXT REFERENCES users(id);`);
  await pool.query(`ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS ride_id TEXT REFERENCES rides(id);`);

  // --- Live meter (Bolt-style pay-after-trip). `price` stays the upfront
  // ESTIMATE shown before the rider requests the trip — it is no longer
  // what gets charged. distance_traveled_km accumulates real GPS distance
  // covered while status = 'in_progress' (see routes/rides.js's
  // /:id/location handler), reset to 0 the moment the driver taps "Start
  // trip". final_price is computed once, when the driver taps "Complete
  // trip", from actual elapsed time + actual distance travelled, and is
  // the amount the rider is asked to pay — payment now happens AFTER the
  // trip ends instead of before it starts. ---
  await pool.query(`ALTER TABLE rides ADD COLUMN IF NOT EXISTS distance_traveled_km REAL NOT NULL DEFAULT 0;`);
  await pool.query(`ALTER TABLE rides ADD COLUMN IF NOT EXISTS final_price REAL;`);

  // --- Agent bank withdrawals (see paystack.js's transfer functions and
  // routes/withdrawals.js). An agent saves ONE bank account at a time —
  // paystack_recipient_code is Paystack's id for that account, created
  // once via createTransferRecipient and reused for every future
  // withdrawal, not recreated per request. Changing banks overwrites
  // these fields and gets a fresh recipient_code.
  await pool.query(`ALTER TABLE agent_profiles ADD COLUMN IF NOT EXISTS bank_code TEXT;`);
  await pool.query(`ALTER TABLE agent_profiles ADD COLUMN IF NOT EXISTS bank_name TEXT;`);
  await pool.query(`ALTER TABLE agent_profiles ADD COLUMN IF NOT EXISTS account_number TEXT;`);
  await pool.query(`ALTER TABLE agent_profiles ADD COLUMN IF NOT EXISTS account_name TEXT;`);
  await pool.query(`ALTER TABLE agent_profiles ADD COLUMN IF NOT EXISTS paystack_recipient_code TEXT;`);

  // A withdrawal is its own row from the moment it's REQUESTED, not just
  // once it's paid — the requested amount is deducted from
  // agent_profiles.wallet_balance immediately (see routes/withdrawals.js),
  // so the agent can't request it twice while it's awaiting admin review.
  // If an admin rejects it, the amount is refunded back to their balance.
  // 'processing' = admin approved, Paystack transfer call made, waiting on
  // Paystack's async result; 'paid' = Paystack confirmed the transfer;
  // 'failed' = Paystack transfer failed (auto-refunded back to the agent).
  await pool.query(`
    CREATE TABLE IF NOT EXISTS agent_withdrawals (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL REFERENCES users(id),
      amount REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','processing','paid','rejected','failed')),
      bank_name TEXT NOT NULL,
      account_number TEXT NOT NULL,
      account_name TEXT NOT NULL,
      paystack_transfer_code TEXT,
      paystack_reference TEXT UNIQUE,
      reviewed_by TEXT REFERENCES users(id),
      reviewed_at TIMESTAMPTZ,
      rejection_reason TEXT,
      requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      paid_at TIMESTAMPTZ
    );
  `);

  // (wallet_transactions_type_check consolidated further down — see note above)

  // --- In-app chat between customer and agent, for a specific ride or
  // delivery. One table covers both trip types (rather than
  // ride_messages + delivery_messages) since the shape is identical and
  // the frontend chat UI doesn't care which kind of trip it's attached
  // to — see routes/messages.js. sender_role is stored redundantly
  // alongside sender_id purely so the frontend can style "my message" vs
  // "their message" without an extra join on every poll.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS trip_messages (
      id TEXT PRIMARY KEY,
      trip_type TEXT NOT NULL CHECK (trip_type IN ('ride','delivery')),
      trip_id TEXT NOT NULL,
      sender_id TEXT NOT NULL REFERENCES users(id),
      sender_role TEXT NOT NULL CHECK (sender_role IN ('customer','agent')),
      body TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      read_at TIMESTAMPTZ
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_trip_messages_trip ON trip_messages (trip_type, trip_id, created_at);`);

  // --- SOS / emergency alerts. emergency_contact_* lives on users
  // directly (both customers and agents can set one) rather than a
  // separate table — it's one name + one phone number per person, no
  // history to keep, so a join for it everywhere would be pure overhead.
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS emergency_contact_name TEXT;`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS emergency_contact_phone TEXT;`);

  // One row per SOS press. lat/lng are nullable — if the browser's
  // geolocation is denied or unavailable, the alert should still fire
  // (a "help, no location" alert is far better than none at all), just
  // with a note that location wasn't available. See routes/sos.js.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sos_alerts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      role TEXT NOT NULL CHECK (role IN ('customer','agent')),
      trip_type TEXT NOT NULL CHECK (trip_type IN ('ride','delivery')),
      trip_id TEXT NOT NULL,
      lat REAL,
      lng REAL,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','resolved')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      resolved_at TIMESTAMPTZ,
      resolved_by TEXT REFERENCES users(id)
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_sos_alerts_status ON sos_alerts (status, created_at);`);

  // --- GAS FILLING — a fourth job type alongside deliveries/rides.
  // Deliberately its OWN agent specialty: vehicle_type gets a 'gas' value
  // (an agent picks exactly one type at signup, same as self/bike/cab —
  // see SignupAgent.jsx), rather than any agent being eligible. Handling
  // and transporting LPG isn't the same skill/equipment as a delivery
  // bike or a passenger cab, so mixing them into the same pool would let
  // an unequipped agent accept a job they can't actually do.
  await pool.query(`ALTER TABLE agent_profiles DROP CONSTRAINT IF EXISTS agent_profiles_vehicle_type_check;`);
  await pool.query(`
    ALTER TABLE agent_profiles ADD CONSTRAINT agent_profiles_vehicle_type_check
    CHECK (vehicle_type IN ('self','bike','cab','gas'));
  `);

  // One address, not pickup+dropoff — this is a house-call service, not a
  // point-to-point trip. price_per_kg is snapshotted onto the order
  // (rather than only living in a config constant) so a later change to
  // the rate never silently changes what an already-placed order costs.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS gas_orders (
      id TEXT PRIMARY KEY,
      customer_id TEXT NOT NULL REFERENCES users(id),
      agent_id TEXT REFERENCES users(id),
      address TEXT NOT NULL,
      city TEXT NOT NULL,
      address_lat REAL,
      address_lng REAL,
      landmark TEXT,
      contact_phone TEXT NOT NULL,
      cylinder_size_kg REAL NOT NULL,
      price_per_kg REAL NOT NULL,
      gas_cost REAL NOT NULL,
      transport_fee REAL NOT NULL,
      distance_km REAL,
      price REAL NOT NULL,
      note TEXT,
      tracking_code TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','en_route','filling','completed','cancelled')),
      payment_status TEXT NOT NULL DEFAULT 'unpaid',
      payment_method TEXT,
      paystack_reference TEXT,
      proof_photo TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      accepted_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ,
      cancelled_at TIMESTAMPTZ
    );
  `);
  // Additive columns for deployments where gas_orders already existed
  // from before this pricing rework — CREATE TABLE above only applies on
  // a truly first run.
  await pool.query(`ALTER TABLE gas_orders ADD COLUMN IF NOT EXISTS city TEXT NOT NULL DEFAULT '';`);
  await pool.query(`ALTER TABLE gas_orders ADD COLUMN IF NOT EXISTS gas_cost REAL NOT NULL DEFAULT 0;`);
  await pool.query(`ALTER TABLE gas_orders ADD COLUMN IF NOT EXISTS transport_fee REAL NOT NULL DEFAULT 0;`);
  await pool.query(`ALTER TABLE gas_orders ADD COLUMN IF NOT EXISTS distance_km REAL;`);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS gas_orders_paystack_reference_idx
    ON gas_orders(paystack_reference) WHERE paystack_reference IS NOT NULL;
  `);

  // Chat and SOS both key off trip_type — extending both CHECK
  // constraints here so a gas order is a full first-class trip for
  // safety/coordination purposes, same as a ride or delivery. This
  // matters MORE for gas than for a delivery, arguably: an agent is
  // physically entering someone's home, not dropping a package at the
  // door.
  await pool.query(`ALTER TABLE agent_profiles ADD COLUMN IF NOT EXISTS total_gas_jobs INTEGER NOT NULL DEFAULT 0;`);

  await pool.query(`ALTER TABLE trip_messages DROP CONSTRAINT IF EXISTS trip_messages_trip_type_check;`);
  await pool.query(`ALTER TABLE trip_messages ADD CONSTRAINT trip_messages_trip_type_check CHECK (trip_type IN ('ride','delivery','gas'));`);
  await pool.query(`ALTER TABLE sos_alerts DROP CONSTRAINT IF EXISTS sos_alerts_trip_type_check;`);
  await pool.query(`ALTER TABLE sos_alerts ADD CONSTRAINT sos_alerts_trip_type_check CHECK (trip_type IN ('ride','delivery','gas'));`);

  // The users.role CHECK constraint was created before 'outlet' existed
  // as a role — this fixes it on a database that's already running
  // (CREATE TABLE above only sets the right constraint on a truly fresh
  // install). Without this, every outlet signup fails with a
  // users_role_check violation on any database created before this line
  // was added.
  await pool.query(`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;`);
  await pool.query(`ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('customer','agent','admin','outlet'));`);

  // --- FOOD ORDERING — outlets (restaurants/eateries/supermarkets)
  // self-register like agents do, but always start 'pending' and need
  // admin approval before showing up anywhere public — same trust gate
  // as agent_profiles.approval_status, for the same reason (this is a
  // business relationship, not a self-serve free-for-all).
  await pool.query(`
    CREATE TABLE IF NOT EXISTS outlet_profiles (
      user_id TEXT PRIMARY KEY REFERENCES users(id),
      business_name TEXT NOT NULL,
      category TEXT NOT NULL CHECK (category IN ('restaurant','eatery','supermarket','pharmacy','other')),
      description TEXT,
      address TEXT NOT NULL,
      city TEXT NOT NULL,
      address_lat REAL,
      address_lng REAL,
      logo_photo TEXT,
      cover_photo TEXT,
      open_time TEXT,
      close_time TEXT,
      is_open BOOLEAN NOT NULL DEFAULT true,
      approval_status TEXT NOT NULL DEFAULT 'pending' CHECK (approval_status IN ('pending','approved','rejected')),
      wallet_balance REAL NOT NULL DEFAULT 0,
      total_orders INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  // is_available is the outlet's own "86 this item" toggle — separate
  // from is_open on the outlet itself, since a restaurant can be open
  // with one dish sold out, not the whole menu.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS menu_items (
      id TEXT PRIMARY KEY,
      outlet_id TEXT NOT NULL REFERENCES users(id),
      name TEXT NOT NULL,
      description TEXT,
      price REAL NOT NULL,
      category TEXT,
      photo TEXT,
      is_available BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_menu_items_outlet ON menu_items (outlet_id);`);

  // items is a JSON snapshot of what was ordered (name, price, qty) at
  // the moment of purchase — deliberately NOT a live join against
  // menu_items, so a later price change or deleted item never rewrites
  // the history of what someone actually paid for.
  //
  // subtotal is the outlet's revenue portion (sum of item prices — the
  // outlet set these, they keep them in full minus platform_commission).
  // delivery_fee is separate and follows the same 80/20 agent split used
  // everywhere else in the app. See food-pricing.js for the full split
  // logic and why outlet/agent payouts are computed differently, same
  // reasoning as gas orders' gas_cost/transport_fee split.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS food_orders (
      id TEXT PRIMARY KEY,
      customer_id TEXT NOT NULL REFERENCES users(id),
      outlet_id TEXT NOT NULL REFERENCES users(id),
      agent_id TEXT REFERENCES users(id),
      items JSONB NOT NULL,
      subtotal REAL NOT NULL,
      platform_commission REAL NOT NULL,
      delivery_fee REAL NOT NULL,
      distance_km REAL,
      price REAL NOT NULL,
      delivery_address TEXT NOT NULL,
      city TEXT NOT NULL,
      address_lat REAL,
      address_lng REAL,
      landmark TEXT,
      contact_phone TEXT NOT NULL,
      note TEXT,
      tracking_code TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
        'pending','placed','preparing','ready_for_pickup','picked_up','delivered','cancelled','rejected'
      )),
      payment_status TEXT NOT NULL DEFAULT 'unpaid',
      payment_method TEXT,
      paystack_reference TEXT,
      rejection_reason TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      placed_at TIMESTAMPTZ,
      accepted_at TIMESTAMPTZ,
      ready_at TIMESTAMPTZ,
      picked_up_at TIMESTAMPTZ,
      delivered_at TIMESTAMPTZ,
      cancelled_at TIMESTAMPTZ
    );
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS food_orders_paystack_reference_idx
    ON food_orders(paystack_reference) WHERE paystack_reference IS NOT NULL;
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_food_orders_outlet ON food_orders (outlet_id, status);`);
  await pool.query(`ALTER TABLE agent_profiles ADD COLUMN IF NOT EXISTS total_food_jobs INTEGER NOT NULL DEFAULT 0;`);

  // Food orders join the same chat/SOS/wallet-transaction systems as
  // rides/deliveries/gas — extending each constraint the same way gas
  // orders did earlier.
  await pool.query(`ALTER TABLE trip_messages DROP CONSTRAINT IF EXISTS trip_messages_trip_type_check;`);
  await pool.query(`ALTER TABLE trip_messages ADD CONSTRAINT trip_messages_trip_type_check CHECK (trip_type IN ('ride','delivery','gas','food'));`);
  await pool.query(`ALTER TABLE sos_alerts DROP CONSTRAINT IF EXISTS sos_alerts_trip_type_check;`);
  await pool.query(`ALTER TABLE sos_alerts ADD CONSTRAINT sos_alerts_trip_type_check CHECK (trip_type IN ('ride','delivery','gas','food'));`);
  // Wrapped defensively: this re-applies a whitelist of valid `type`
  // values by dropping and re-adding the constraint on every boot, which
  // means it validates every existing row each time. If a live request
  // (topup, bonus payout, etc.) has ever written a `type` not on this
  // list — even a row that's since been corrected or cleaned up by
  // another process — this can fail the ALTER *at the exact moment a
  // deploy happens to catch a transient bad row*, which previously took
  // the entire server down. A data-quality issue in one row should never
  // block every customer from using the app, so this now logs loudly
  // instead of crashing startup. The underlying cause (something writing
  // an off-list type) still needs finding and fixing — see the warning
  // this prints, which is the fastest way to catch it in the act next
  // time it happens.
  try {
    await pool.query(`ALTER TABLE wallet_transactions DROP CONSTRAINT IF EXISTS wallet_transactions_type_check;`);
    await pool.query(`
      ALTER TABLE wallet_transactions ADD CONSTRAINT wallet_transactions_type_check
      CHECK (type IN ('topup','delivery_payment','ride_payment','gas_payment','food_payment','refund','streak_reward','referral_reward','landmark_reward','withdrawal','withdrawal_refund','job_boost'));
    `);
  } catch (err) {
    console.error(
      "WARNING: couldn't re-apply wallet_transactions_type_check — a row exists with a 'type' value outside the allowed list. " +
      "The app will keep running, but please investigate: run " +
      "`SELECT id, type, created_at FROM wallet_transactions WHERE type NOT IN " +
      "('topup','delivery_payment','ride_payment','gas_payment','food_payment','refund','streak_reward','referral_reward','landmark_reward','withdrawal','withdrawal_refund','job_boost');` " +
      "as soon as possible to find it. Underlying error: " + err.message
    );
  }

  // --- SAVED ADDRESSES — a reusable label ("Home", "Work", "Hostel") for
  // an address a customer types once and picks again later, rather than
  // retyping it on every gas/food order. Deliberately generic (not tied
  // to any one order type) so it can be reused anywhere a plain
  // address+city+landmark text flow exists — currently gas and food
  // orders; rides/deliveries use precise map-pin coordinates via PinMap
  // instead of free-text address, a different input model this table
  // doesn't attempt to cover.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS saved_addresses (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      label TEXT NOT NULL,
      address TEXT NOT NULL,
      city TEXT NOT NULL,
      landmark TEXT,
      lat REAL,
      lng REAL,
      is_default BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_saved_addresses_user ON saved_addresses (user_id);`);

  // --- Local gazetteer — admin-pinned points for areas where Mapbox's own
  // geocoding is unreliable (see check-gazetteer.js's audit: only 17/106
  // known Ota-area names came back trustworthy). Deliberately NOT tied to
  // institutions — this covers general ride/delivery/food/gas address
  // entry across whole towns (Agbara, Lusada, Igbesa, etc.), not one
  // campus. maps.js reads from this table (merged with its own hardcoded
  // LOCAL_GAZETTEER array) before ever calling Mapbox for a query that
  // matches a pinned name. UNIQUE (name, city) so re-pinning the same
  // place just updates its coordinates instead of duplicating it.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS gazetteer_points (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'area' CHECK (type IN ('road','area','landmark')),
      city TEXT NOT NULL DEFAULT 'Ota',
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      source TEXT NOT NULL DEFAULT 'admin',
      created_by TEXT REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (name, city)
    );
  `);

  // --- Web Push subscriptions. One row per browser/device a user has
  // granted notification permission on (a user can have several — phone +
  // laptop, etc.), so no UNIQUE on user_id alone. `endpoint` itself is
  // already unique per browser install, which is what we actually
  // deduplicate on when a re-subscribe happens (permission re-granted,
  // token rotated by the browser, etc.).
  await pool.query(`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      endpoint TEXT NOT NULL UNIQUE,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions (user_id);`);
}

module.exports = { pool, initSchema };
