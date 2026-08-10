import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../api";
import StatusBadge from "../components/StatusBadge";
import { lazy, Suspense } from "react";
const DeliveryMap = lazy(() => import("../components/DeliveryMap"));

const STAGE_ORDER = ["pending", "accepted", "picked_up", "in_transit", "delivered"];
const STAGE_LABELS = {
  pending: "Order placed",
  accepted: "Agent assigned",
  picked_up: "Picked up",
  in_transit: "In transit",
  delivered: "Delivered",
};
const ACTIVE_STATUSES = ["accepted", "picked_up", "in_transit"];

// Coarse, human-friendly buckets rather than exact day counts — "2 mo
// agent" reads better in a small badge than "63 days," and precision past
// this granularity doesn't add trust signal anyway.
function tenureLabel(days) {
  if (days == null) return null;
  if (days < 14) return "New agent";
  if (days < 60) return `${Math.floor(days / 7)} wk agent`;
  if (days < 365) return `${Math.floor(days / 30)} mo agent`;
  return `${Math.floor(days / 365)} yr agent`;
}

const VEHICLE_LABELS = { bike: "Bike rider", cab: "Cab driver", self: "Self agent", any: "Agent" };

export default function TrackPublic() {
  const [params] = useSearchParams();
  const [code, setCode] = useState(params.get("code") || "");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [reputation, setReputation] = useState(null);

  const runTrack = useCallback(async (trackCode, { silent } = {}) => {
    if (!trackCode.trim()) return;
    if (!silent) {
      setError("");
      setLoading(true);
      setResult(null);
    }
    try {
      const data = await api.publicTrack(trackCode.trim().toUpperCase());
      setResult(data);
      if (!silent) setError("");
    } catch (err) {
      if (!silent) setError(err.message);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    runTrack(code);
  }

  const delivery = result?.delivery;
  const currentStageIndex = delivery ? STAGE_ORDER.indexOf(delivery.status) : -1;
  const isActive = delivery && ACTIVE_STATUSES.includes(delivery.status);
  const hasAssignedAgent = delivery && delivery.agent_id && delivery.status !== "pending" && delivery.status !== "cancelled";

  useEffect(() => {
    if (!hasAssignedAgent) { setReputation(null); return; }
    let cancelled = false;
    api.getAgentReputation(delivery.agent_id)
      .then((r) => { if (!cancelled) setReputation(r); })
      .catch(() => { if (!cancelled) setReputation(null); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasAssignedAgent, delivery?.agent_id]);

  // Keep the map and status fresh while the delivery is actively moving.
  useEffect(() => {
    if (!isActive) return;
    const t = setInterval(() => runTrack(code, { silent: true }), 8000);
    return () => clearInterval(t);
  }, [isActive, code, runTrack]);

  return (
    <div className="max-w-xl mx-auto px-5 py-16">
      <div className="font-mono text-xs text-slate mb-2">TRACK A DELIVERY</div>
      <h1 className="font-display text-3xl font-semibold mb-8">Where's my package?</h1>

      <form onSubmit={handleSubmit} className="flex gap-2 mb-8">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="e.g. PAE-Y3BCKLH"
          className="flex-1 border border-slate-300 rounded-lg px-3.5 py-2.5 text-sm font-mono focus:border-ink focus:ring-1 focus:ring-ink outline-none"
        />
        <button disabled={loading} className="bg-route hover:bg-route-dark text-ink font-semibold rounded-lg px-5 py-2.5 transition-colors disabled:opacity-60">
          {loading ? "Searching…" : "Track"}
        </button>
      </form>

      {error && (
        <div className="border border-red-200 bg-red-50 text-red-700 text-sm rounded-xl p-4 mb-6">{error}</div>
      )}

      {delivery && (
        <div className="border border-slate-200 rounded-2xl p-6 bg-white">
          <div className="flex items-start justify-between mb-6">
            <div>
              <div className="font-mono text-xs text-slate mb-1">{delivery.tracking_code}</div>
              <div className="font-display font-semibold text-lg">{delivery.package_type} · {delivery.pickup_city} → {delivery.dropoff_city}</div>
            </div>
            <StatusBadge status={delivery.status} />
          </div>

          {reputation && (
            <div className="flex items-center gap-3.5 border border-slate-200 rounded-xl p-3.5 mb-6 bg-paper">
              {reputation.profile_photo ? (
                <img
                  src={reputation.profile_photo}
                  alt={reputation.full_name}
                  className="w-12 h-12 rounded-full object-cover border border-slate-200 shrink-0"
                />
              ) : (
                <div className="w-12 h-12 rounded-full bg-ink text-paper flex items-center justify-center font-display font-semibold text-sm shrink-0">
                  {reputation.full_name.split(" ").map((w) => w[0]).slice(0, 2).join("")}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-display font-semibold text-sm text-ink truncate">{reputation.full_name}</span>
                  <span className="font-mono text-xs text-slate shrink-0">★ {reputation.rating.toFixed(1)}</span>
                </div>
                <div className="text-xs text-slate mt-0.5">
                  {VEHICLE_LABELS[reputation.vehicle_type] || "Agent"} · {reputation.total_deliveries} deliveries
                  {tenureLabel(reputation.tenure_days) && ` · ${tenureLabel(reputation.tenure_days)}`}
                </div>
                {(reputation.on_time_rate != null || reputation.campus_specialty) && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {reputation.on_time_rate != null && (
                      <span className="text-[11px] font-medium bg-delivered/10 text-delivered rounded-full px-2 py-0.5">
                        {reputation.on_time_rate}% on-time · last {reputation.on_time_window_days}d
                      </span>
                    )}
                    {reputation.campus_specialty && (
                      <span className="text-[11px] font-medium bg-route/10 text-route-dark rounded-full px-2 py-0.5">
                        🎓 {reputation.campus_specialty} specialist
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {delivery.status === "cancelled" ? (
            <p className="text-sm text-slate">This delivery was cancelled.</p>
          ) : (
            <>
              <div className="space-y-0 mb-2">
                {STAGE_ORDER.map((stage, i) => {
                  const done = i <= currentStageIndex;
                  return (
                    <div key={stage} className="flex gap-4">
                      <div className="flex flex-col items-center">
                        <div className={`w-3.5 h-3.5 rounded-full border-2 ${done ? "bg-delivered border-delivered" : "border-slate-300"}`} />
                        {i < STAGE_ORDER.length - 1 && (
                          <div className={`w-0.5 h-8 ${done && i < currentStageIndex ? "bg-delivered" : "bg-slate-200"}`} />
                        )}
                      </div>
                      <div className="pb-6 -mt-0.5">
                        <div className={`text-sm font-medium ${done ? "text-ink" : "text-slate-light"}`}>{STAGE_LABELS[stage]}</div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {isActive && (
                <div className="mt-2">
                  <Suspense fallback={<div style={{ height: 260 }} className="rounded-xl bg-paper border border-slate-200 animate-pulse" />}>
                    <DeliveryMap
                      height={260}
                      pickup={delivery.pickup_lat != null ? { lat: delivery.pickup_lat, lng: delivery.pickup_lng } : null}
                      dropoff={delivery.dropoff_lat != null ? { lat: delivery.dropoff_lat, lng: delivery.dropoff_lng } : null}
                      current={delivery.current_lat != null ? { lat: delivery.current_lat, lng: delivery.current_lng } : null}
                    />
                  </Suspense>
                  {delivery.current_lat != null && (
                    <p className="text-xs text-slate mt-1.5">
                      Agent location last updated {new Date(delivery.location_updated_at).toLocaleTimeString()}
                    </p>
                  )}
                </div>
              )}
              {delivery.status === "delivered" && delivery.proof_photo && (
                <div className="mt-4 pt-4 border-t border-slate-100">
                  <div className="text-xs font-semibold text-slate uppercase mb-2">Proof of delivery</div>
                  <img
                    src={delivery.proof_photo}
                    alt="Proof of delivery"
                    className="w-full max-h-80 object-cover rounded-xl border border-slate-200"
                  />
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
