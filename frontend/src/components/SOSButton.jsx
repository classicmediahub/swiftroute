import { useState, useRef } from "react";
import { useSOS } from "../hooks/useSOS";
import { AlertTriangle, ShieldCheck } from "lucide-react";

const HOLD_MS = 1500;

// Drop into any active-trip view, both customer and agent side:
//   <SOSButton token={token} tripType="ride" tripId={ride.id} />
export default function SOSButton({ token, tripType, tripId }) {
  const { alert, triggering, error, trigger } = useSOS(token, tripType, tripId);
  const [holding, setHolding] = useState(false);
  const [progress, setProgress] = useState(0);
  const rafRef = useRef(null);

  function startHold() {
    if (alert || triggering) return;
    setHolding(true);
    const start = Date.now();
    function tick() {
      const elapsed = Date.now() - start;
      setProgress(Math.min(1, elapsed / HOLD_MS));
      if (elapsed >= HOLD_MS) {
        cancelHold();
        trigger();
      } else {
        rafRef.current = requestAnimationFrame(tick);
      }
    }
    rafRef.current = requestAnimationFrame(tick);
  }

  function cancelHold() {
    setHolding(false);
    setProgress(0);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  }

  if (alert?.status === "active") {
    return (
      <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm font-medium">
        <AlertTriangle className="w-4 h-4 shrink-0" />
        Alert sent — your emergency contact and PickAndEarn support have been notified. Stay safe.
      </div>
    );
  }

  if (alert?.status === "resolved") {
    return (
      <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl px-4 py-3 text-sm font-medium">
        <ShieldCheck className="w-4 h-4 shrink-0" />
        Your alert was marked resolved.
      </div>
    );
  }

  return (
    <div>
      <button
        onPointerDown={startHold}
        onPointerUp={cancelHold}
        onPointerLeave={cancelHold}
        onPointerCancel={cancelHold}
        disabled={triggering}
        className="relative w-full overflow-hidden bg-red-600 hover:bg-red-700 text-white font-semibold rounded-xl py-3 text-sm transition-colors disabled:opacity-60 select-none touch-none"
      >
        <span
          className="absolute inset-y-0 left-0 bg-red-900/50"
          style={{ width: `${progress * 100}%`, transition: holding ? "none" : "width 150ms ease-out" }}
        />
        <span className="relative flex items-center justify-center gap-2">
          <AlertTriangle className="w-4 h-4" />
          {triggering ? "Sending alert…" : holding ? "Keep holding…" : "Hold for SOS"}
        </span>
      </button>
      {error && <p className="text-xs text-red-600 mt-1.5 text-center">{error}</p>}
      <p className="text-[11px] text-slate dark:text-slate-light mt-1.5 text-center">
        Press and hold 1.5 seconds to alert your emergency contact and PickAndEarn support.
      </p>
    </div>
  );
}
