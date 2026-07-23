import { useEffect, useState } from "react";

// Fixed, realistic-looking timestamps — same spirit as the original vertical
// version's "example only" labeling. Only the highlighted step advances;
// the times themselves don't change, since this is a static demo, not a
// live order.
const STAGES = [
  { label: "Placed", time: "9:02am" },
  { label: "Picked up", time: "9:24am" },
  { label: "In transit", time: "now" },
  { label: "Delivered", time: "est. 10:05am" },
];

export default function TrackingDemo() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setActive((a) => (a + 1) % STAGES.length), 1800);
    return () => clearInterval(t);
  }, []);

  const progressPct = 5 + (active / (STAGES.length - 1)) * 90;

  return (
    <div className="bg-ink text-paper rounded-2xl p-6 sm:p-8">
      <div className="flex items-center justify-between mb-5">
        <span className="font-mono text-xs text-slate-light">PAE-DEMO7X2 · example only</span>
        <span className="text-xs text-delivered font-medium">
          {active === STAGES.length - 1 ? "delivered" : "in transit"}
        </span>
      </div>

      <div className="relative mb-1" style={{ paddingTop: 4 }}>
        <div className="absolute top-[13px] left-[5%] right-[5%] h-0.5 bg-line" />
        <div
          className="absolute top-[13px] left-[5%] h-0.5 bg-route transition-all duration-500"
          style={{ width: `${progressPct - 5}%` }}
        />
        <div className="relative flex justify-between">
          {STAGES.map((stage, i) => {
            const done = i <= active;
            const current = i === active;
            return (
              <div key={stage.label} className="text-center" style={{ width: "25%" }}>
                <div
                  className={`w-5 h-5 rounded-full mx-auto mb-1.5 transition-colors duration-500 ${
                    done ? "bg-route" : "bg-line"
                  }`}
                  style={current ? { boxShadow: "0 0 0 2px #0B1220, 0 0 0 4px var(--route, #F5B833)" } : undefined}
                />
                <div className={`text-xs font-medium ${done ? "text-paper" : "text-slate-light"}`}>{stage.label}</div>
                <div className="text-[10px] text-slate-light">{stage.time}</div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="border-t border-line mt-5 pt-3.5 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-full bg-[#1B2436] flex items-center justify-center text-route text-xs font-semibold">
            TA
          </div>
          <div>
            <div className="text-xs text-paper">Tunde A. · bike</div>
            <div className="text-[10px] text-slate-light">rating 4.9</div>
          </div>
        </div>
        <span className="text-[11px] text-route">share live link</span>
      </div>
    </div>
  );
}
