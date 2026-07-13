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

export default function TrackPublic() {
  const [params] = useSearchParams();
  const [code, setCode] = useState(params.get("code") || "");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

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
            </>
          )}
        </div>
      )}
    </div>
  );
}
