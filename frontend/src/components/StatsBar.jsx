import { useEffect, useState } from "react";
import { api } from "../api";

export default function StatsBar() {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    api.publicStats().then(setStats).catch(() => setStats(null));
  }, []);

  // Early on, real numbers will be small — that's shown honestly rather
  // than masked with an inflated placeholder.
  if (!stats || stats.completedDeliveries === 0) {
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
    { value: stats.completedDeliveries.toLocaleString(), label: "Deliveries completed" },
    { value: stats.activeAgents.toLocaleString(), label: "Active agents" },
    { value: stats.citiesCovered.toLocaleString(), label: "Cities covered" },
  ];

  return (
    <div className="border-y border-slate-200 bg-paper">
      <div className="max-w-6xl mx-auto px-5 py-8 grid grid-cols-3 gap-6 text-center">
        {items.map((item) => (
          <div key={item.label}>
            <div className="font-display text-2xl sm:text-3xl font-semibold">{item.value}</div>
            <div className="text-xs text-slate mt-1">{item.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
