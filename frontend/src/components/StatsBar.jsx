import { useEffect, useRef, useState } from "react";
import { api } from "../api";

// Tune this once deliveries are consistently past it — the point where
// showing real numbers builds trust instead of exposing early-stage scale.
const MIN_MEANINGFUL_DELIVERIES = 50;

const COUNT_UP_DURATION_MS = 1100;

function easeOutQuad(t) {
  return 1 - (1 - t) * (1 - t);
}

// Animates 0 -> target once, then holds. Jumps straight to the final value
// under prefers-reduced-motion instead of animating — same rule this
// codebase already applies everywhere else motion appears (see index.css's
// reduced-motion block, HeroLiveMap).
function useCountUp(target) {
  const [display, setDisplay] = useState(0);
  const frameRef = useRef(null);

  useEffect(() => {
    if (target == null) return;

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) {
      setDisplay(target);
      return;
    }

    const start = performance.now();
    function tick(now) {
      const progress = Math.min((now - start) / COUNT_UP_DURATION_MS, 1);
      setDisplay(Math.round(target * easeOutQuad(progress)));
      if (progress < 1) frameRef.current = requestAnimationFrame(tick);
    }
    frameRef.current = requestAnimationFrame(tick);

    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [target]);

  return display;
}

function StatValue({ target }) {
  const value = useCountUp(target);
  return <>{value.toLocaleString()}</>;
}

export default function StatsBar() {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    api.publicStats().then(setStats).catch(() => setStats(null));
  }, []);

  // Below the threshold, show the honest fallback rather than small real
  // numbers that read as "barely launched."
  if (!stats || stats.completedDeliveries < MIN_MEANINGFUL_DELIVERIES) {
    return (
      <div className="border-y border-slate-200 bg-paper">
        <div className="max-w-6xl mx-auto px-5 py-6 text-center">
          <p className="font-mono text-xs text-slate">
            Newly launched — every delivery on PickAndEarn is tracked start to finish. Be one of our first.
          </p>
        </div>
      </div>
    );
  }

  const items = [
    { value: stats.completedDeliveries, label: "Deliveries completed" },
    { value: stats.activeAgents, label: "Active agents" },
    { value: stats.citiesCovered, label: "Cities covered" },
  ];

  return (
    <div className="border-y border-slate-200 bg-paper">
      <div className="max-w-6xl mx-auto px-5 py-8 grid grid-cols-3 gap-6 text-center">
        {items.map((item) => (
          <div key={item.label}>
            <div className="font-display text-2xl sm:text-3xl font-semibold">
              <StatValue target={item.value} />
            </div>
            <div className="text-xs text-slate mt-1">{item.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
