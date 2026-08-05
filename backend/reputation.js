const { pool } = require("./db");

// ---------- AGENT REPUTATION — computed on demand from real delivery
// rows rather than stored/cached, so these numbers can never drift stale
// from what actually happened. Distinct from agent_profiles.rating (a
// running average maintained elsewhere from ratings/ride_reviews) — this
// pulls several different signals into one public-facing profile shape a
// customer can see before or during a match.
const ON_TIME_WINDOW_DAYS = 30;

async function getAgentReputation(agentId) {
  const { rows: profileRows } = await pool.query(
    `SELECT ap.total_deliveries, ap.total_rides, ap.rating, ap.vehicle_type, ap.city,
            u.full_name, u.profile_photo, u.created_at AS joined_at
     FROM agent_profiles ap JOIN users u ON u.id = ap.user_id
     WHERE ap.user_id = $1`,
    [agentId]
  );
  const profile = profileRows[0];
  if (!profile) return null;

  // measurable = deliveries that actually had an ETA to compare against
  // (older rows created before this feature shipped won't, and neither
  // will flat-fallback-priced ones with no distance) — on_time_rate is
  // null rather than a misleading 0% when there's nothing measurable yet.
  const { rows: onTimeRows } = await pool.query(
    `SELECT
       count(*) FILTER (WHERE estimated_delivery_at IS NOT NULL) AS measurable,
       count(*) FILTER (WHERE estimated_delivery_at IS NOT NULL AND delivered_at <= estimated_delivery_at) AS on_time
     FROM deliveries
     WHERE agent_id = $1 AND status = 'delivered' AND delivered_at >= now() - make_interval(days => $2)`,
    [agentId, ON_TIME_WINDOW_DAYS]
  );
  const measurable = Number(onTimeRows[0].measurable);
  const onTime = Number(onTimeRows[0].on_time);
  const onTimeRate = measurable > 0 ? Math.round((onTime / measurable) * 100) : null;

  const { rows: specialtyRows } = await pool.query(
    `SELECT i.name, count(*) AS jobs
     FROM deliveries d JOIN institutions i ON i.id = d.institution_id
     WHERE d.agent_id = $1 AND d.status = 'delivered'
     GROUP BY i.name ORDER BY jobs DESC LIMIT 1`,
    [agentId]
  );
  const specialty = specialtyRows[0] || null;

  const tenureDays = Math.floor((Date.now() - new Date(profile.joined_at).getTime()) / 86400000);

  return {
    full_name: profile.full_name,
    profile_photo: profile.profile_photo,
    vehicle_type: profile.vehicle_type,
    city: profile.city,
    rating: Number(profile.rating),
    total_deliveries: profile.total_deliveries,
    total_rides: profile.total_rides,
    on_time_rate: onTimeRate, // null = not enough data yet — frontend should hide the stat, not show 0%
    on_time_window_days: ON_TIME_WINDOW_DAYS,
    campus_specialty: specialty ? specialty.name : null,
    campus_specialty_jobs: specialty ? Number(specialty.jobs) : null,
    tenure_days: tenureDays,
    joined_at: profile.joined_at,
  };
}

module.exports = { getAgentReputation };
