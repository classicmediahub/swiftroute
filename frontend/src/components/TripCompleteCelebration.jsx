import { useEffect, useMemo } from "react";

const CONFETTI_COLORS = ["#C1121F", "#669BBC", "#FDF0D5", "#2A9D8F", "#FFFFFF"]; // on-brand: red, light blue, cream, teal-green, white
const CONFETTI_COUNT = 70;

function ConfettiPiece({ color, left, delay, duration, rotate, drift }) {
  return (
    <div
      className="absolute top-[-24px] rounded-sm"
      style={{
        left: `${left}%`,
        width: 8,
        height: 14,
        backgroundColor: color,
        animation: `pae-confetti-fall ${duration}s cubic-bezier(0.4,0,0.6,1) ${delay}s forwards`,
        // random per-piece drift and end rotation, read by the keyframes via CSS custom properties
        "--pae-drift": `${drift}px`,
        "--pae-rotate": `${rotate}deg`,
      }}
    />
  );
}

// Generic full-screen celebration shown the moment a ride or delivery
// finishes. Deliberately takes plain, shape-agnostic props (title,
// subtitle, stats, price) rather than a raw ride/delivery object, so the
// same component works for both without caring about their different
// field names (dropoff_address vs recipient_name, etc.) — the caller maps
// its own data into this shape.
//
// `trip` is null when nothing to celebrate; passing a non-null object
// mounts the overlay. Callers are responsible for only passing a fresh
// object once per actual completion (see useCelebrateOnComplete.js) —
// this component itself doesn't dedupe, it just renders whatever it's given.
export default function TripCompleteCelebration({ trip, onClose }) {
  const pieces = useMemo(() => {
    if (!trip) return [];
    return Array.from({ length: CONFETTI_COUNT }, (_, i) => ({
      id: i,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      left: Math.random() * 100,
      delay: Math.random() * 0.4,
      duration: 2.6 + Math.random() * 1.4,
      rotate: 180 + Math.random() * 540 * (Math.random() < 0.5 ? -1 : 1),
      drift: (Math.random() - 0.5) * 160,
    }));
    // Regenerate a fresh burst each time a *different* trip is celebrated.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip?.id]);

  useEffect(() => {
    if (!trip) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [trip]);

  if (!trip) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <style>{`
        @keyframes pae-confetti-fall {
          0%   { transform: translateY(0) translateX(0) rotate(0deg); opacity: 1; }
          100% { transform: translateY(105vh) translateX(var(--pae-drift)) rotate(var(--pae-rotate)); opacity: 0.9; }
        }
        @keyframes pae-celebrate-pop {
          0%   { transform: scale(0.92); opacity: 0; }
          60%  { transform: scale(1.02); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes pae-check-draw {
          from { stroke-dashoffset: 24; }
          to   { stroke-dashoffset: 0; }
        }
        @media (prefers-reduced-motion: reduce) {
          .pae-confetti-piece { display: none; }
          .pae-celebrate-card { animation: none !important; }
        }
      `}</style>

      {/* backdrop */}
      <div className="absolute inset-0 bg-ink/70 backdrop-blur-sm" onClick={onClose} />

      {/* confetti, clipped to the viewport, non-interactive */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {pieces.map((p) => (
          <div key={p.id} className="pae-confetti-piece">
            <ConfettiPiece color={p.color} left={p.left} delay={p.delay} duration={p.duration} rotate={p.rotate} drift={p.drift} />
          </div>
        ))}
      </div>

      {/* recap card */}
      <div
        className="pae-celebrate-card relative bg-paper rounded-2xl shadow-2xl max-w-sm w-full p-6 text-center"
        style={{ animation: "pae-celebrate-pop 0.45s cubic-bezier(0.2,0.8,0.2,1)" }}
      >
        <div className="mx-auto mb-4 w-14 h-14 rounded-full bg-delivered/15 flex items-center justify-center">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#2A9D8F" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6 9 17l-5-5" style={{ strokeDasharray: 24, strokeDashoffset: 0, animation: "pae-check-draw 0.5s 0.25s ease-out backwards" }} />
          </svg>
        </div>

        <div className="text-xs font-semibold text-delivered mb-1">{trip.badge || "Completed"}</div>
        <h2 className="text-xl font-bold text-ink mb-1">{trip.title}</h2>
        {trip.subtitle && <p className="text-sm text-slate mb-5">{trip.subtitle}</p>}

        {trip.stats?.length > 0 && (
          <div className="grid grid-cols-2 gap-3 mb-5">
            {trip.stats.map((s) => (
              <div key={s.label} className="bg-white border border-slate-200 rounded-lg py-2.5 px-2">
                <div className="text-[11px] text-slate mb-0.5">{s.label}</div>
                <div className="font-mono text-sm font-semibold text-ink">{s.value}</div>
              </div>
            ))}
          </div>
        )}

        {trip.price != null && (
          <div className="bg-ink rounded-xl px-5 py-4 mb-5">
            <div className="text-xs text-slate-light mb-0.5">{trip.priceLabel || "Total"}</div>
            <div className="font-mono text-2xl font-semibold text-paper">₦{Number(trip.price).toLocaleString()}</div>
          </div>
        )}

        <button
          onClick={onClose}
          className="w-full bg-route hover:bg-route-dark text-ink font-semibold rounded-lg px-4 py-3 transition-colors"
        >
          {trip.closeLabel || "Nice!"}
        </button>
      </div>
    </div>
  );
}
