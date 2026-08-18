import { useEffect, useRef, useState } from "react";
import { api } from "../api";

const METER_POLL_MS = 3000;

// Shared by RequestRide.jsx (rider side) and AgentDashboard.jsx (driver
// side) so both watch the exact same server-computed number rather than
// each guessing at it independently client-side. Polls GET
// /rides/:id/meter, which returns the live fare while status is
// 'in_progress' and the locked final price once status is 'completed'.
export default function RideMeter({ token, rideId, status, className = "" }) {
  const [meter, setMeter] = useState(null);
  const pollRef = useRef(null);

  useEffect(() => {
    if (!rideId || !["in_progress", "completed"].includes(status)) {
      setMeter(null);
      return;
    }

    let cancelled = false;
    async function tick() {
      try {
        const data = await api.rideMeter(token, rideId);
        if (!cancelled) setMeter(data);
      } catch {
        // A missed poll just means the number doesn't update this cycle —
        // not worth surfacing an error over.
      }
    }

    tick();
    if (status === "in_progress") {
      pollRef.current = setInterval(tick, METER_POLL_MS);
    }
    return () => {
      cancelled = true;
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [token, rideId, status]);

  if (!meter || meter.price == null) return null;

  const isFinal = meter.final;
  const mins = Math.floor(meter.elapsedMinutes || 0);
  const secs = Math.floor(((meter.elapsedMinutes || 0) % 1) * 60);

  return (
    <div className={`rounded-xl p-4 ${isFinal ? "bg-emerald-50 border border-emerald-200" : "bg-ink text-paper"} ${className}`}>
      <div className="flex items-center justify-between mb-1">
        <span className={`text-xs font-medium ${isFinal ? "text-emerald-800" : "text-slate-light"}`}>
          {isFinal ? "Trip total" : "Meter running"}
        </span>
        {!isFinal && (
          <span className="flex items-center gap-1.5 text-xs text-route">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-route opacity-75" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-route" />
            </span>
            live
          </span>
        )}
      </div>
      <div className={`font-mono text-3xl font-semibold ${isFinal ? "text-emerald-900" : "text-paper"}`}>
        ₦{Math.round(meter.price).toLocaleString()}
      </div>
      <div className={`text-xs mt-1 ${isFinal ? "text-emerald-700" : "text-slate-light"}`}>
        {meter.distanceKm != null ? `${meter.distanceKm.toFixed(1)} km` : "0.0 km"}
        {" · "}
        {mins}m {secs.toString().padStart(2, "0")}s
        {isFinal ? " · trip ended" : " elapsed"}
      </div>
    </div>
  );
}
