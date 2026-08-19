import { useEffect, useRef, useState } from "react";
import { api } from "../api";

const METER_POLL_MS = 3000;
const TWEEN_MS = 1400; // finishes comfortably before the next poll lands, so it never looks like it's chasing a moving target

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

// Shared by RequestRide.jsx (rider side) and AgentDashboard.jsx (driver
// side) so both watch the exact same server-computed number rather than
// each guessing at it independently client-side. Polls GET
// /rides/:id/meter, which returns the live fare while status is
// 'in_progress' and the locked final price once status is 'completed'.
//
// The displayed price doesn't jump straight to each new polled value —
// it tweens toward it over TWEEN_MS, and the elapsed clock ticks locally
// every second in between polls, so the whole thing reads as continuously
// live rather than as a number that refreshes every 3 seconds.
export default function RideMeter({ token, rideId, status, className = "" }) {
  const [meter, setMeter] = useState(null);
  const [displayPrice, setDisplayPrice] = useState(null);
  const [pulsing, setPulsing] = useState(false);
  const [localElapsedSec, setLocalElapsedSec] = useState(null);

  const pollRef = useRef(null);
  const clockRef = useRef(null);
  const rafRef = useRef(null);
  const tweenFromRef = useRef(null);

  // --- fetch the real number from the server ---
  useEffect(() => {
    if (!rideId || !["in_progress", "completed"].includes(status)) {
      setMeter(null);
      setDisplayPrice(null);
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

  // --- tween the displayed price toward whatever the server just said ---
  useEffect(() => {
    if (!meter || meter.price == null) return;
    const target = meter.price;

    if (displayPrice == null) {
      setDisplayPrice(target); // first paint — no animation, just show it
      return;
    }
    if (target === tweenFromRef.current?.target) return; // same value already animating toward it

    const from = displayPrice;
    tweenFromRef.current = { target };
    const start = performance.now();
    if (target > from) setPulsing(true);

    function step(now) {
      const t = Math.min(1, (now - start) / TWEEN_MS);
      const eased = easeOutCubic(t);
      setDisplayPrice(from + (target - from) * eased);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        setDisplayPrice(target);
        setPulsing(false);
      }
    }
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(step);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meter?.price]);

  // --- local seconds clock, so elapsed time visibly ticks every second
  // instead of only jumping every 3s when a poll lands ---
  useEffect(() => {
    if (!meter || meter.elapsedMinutes == null) return;
    setLocalElapsedSec(Math.round(meter.elapsedMinutes * 60));
  }, [meter?.elapsedMinutes]);

  useEffect(() => {
    if (status !== "in_progress" || meter?.final) return;
    clockRef.current = setInterval(() => {
      setLocalElapsedSec((s) => (s == null ? s : s + 1));
    }, 1000);
    return () => clearInterval(clockRef.current);
  }, [status, meter?.final]);

  if (!meter || meter.price == null || displayPrice == null) return null;

  const isFinal = meter.final;
  const secTotal = localElapsedSec ?? Math.round((meter.elapsedMinutes || 0) * 60);
  const mins = Math.floor(secTotal / 60);
  const secs = secTotal % 60;

  return (
    <div
      className={`rounded-xl p-4 transition-shadow duration-300 ${
        isFinal ? "bg-delivered/10 border border-delivered/30" : "bg-ink text-paper"
      } ${pulsing && !isFinal ? "shadow-[0_0_0_3px_rgba(250,204,21,0.25)]" : ""} ${className}`}
    >
      <div className="flex items-center justify-between mb-1">
        <span className={`text-xs font-medium ${isFinal ? "text-delivered" : "text-slate-light"}`}>
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
      <div
        className={`font-mono text-3xl font-semibold tabular-nums transition-transform duration-200 ${
          isFinal ? "text-delivered" : "text-paper"
        } ${pulsing && !isFinal ? "scale-[1.03]" : "scale-100"}`}
        style={{ transformOrigin: "left center" }}
      >
        ₦{Math.round(displayPrice).toLocaleString()}
      </div>
      <div className={`text-xs mt-1 tabular-nums ${isFinal ? "text-delivered" : "text-slate-light"}`}>
        {meter.distanceKm != null ? `${meter.distanceKm.toFixed(1)} km` : "0.0 km"}
        {" · "}
        {mins}m {secs.toString().padStart(2, "0")}s
        {isFinal ? " · trip ended" : " elapsed"}
      </div>
    </div>
  );
}
