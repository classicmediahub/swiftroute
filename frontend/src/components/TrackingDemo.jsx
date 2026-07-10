import { useEffect, useState } from "react";

const STAGES = [
  { label: "Picked up", detail: "Rider collected the package" },
  { label: "On the way", detail: "En route to drop-off" },
  { label: "Almost there", detail: "4 km from the destination" },
  { label: "Delivered", detail: "Recipient confirmed receipt" },
];

export default function TrackingDemo() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setActive((a) => (a + 1) % STAGES.length), 1800);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="bg-ink text-paper rounded-2xl p-6 sm:p-8">
      <div className="flex items-center justify-between mb-6">
        <div className="font-mono text-xs text-route">SR-DEMO7X2</div>
        <div className="font-mono text-xs text-slate-light">example only</div>
      </div>
      <div className="space-y-0">
        {STAGES.map((stage, i) => {
          const done = i < active;
          const current = i === active;
          return (
            <div key={stage.label} className="flex gap-4">
              <div className="flex flex-col items-center">
                <div
                  className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors duration-500 ${
                    done || current ? "bg-route border-route" : "border-line"
                  }`}
                >
                  {(done || current) && <div className="w-1.5 h-1.5 rounded-full bg-ink" />}
                </div>
                {i < STAGES.length - 1 && (
                  <div className={`w-0.5 h-10 transition-colors duration-500 ${done ? "bg-route" : "bg-line"}`} />
                )}
              </div>
              <div className="pb-8 -mt-0.5">
                <div className={`text-sm font-semibold transition-colors duration-500 ${done || current ? "text-paper" : "text-slate-light"}`}>
                  {stage.label}
                </div>
                <div className="text-xs text-slate-light">{stage.detail}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
