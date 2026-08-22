import { Sun, Sunset, Moon } from "lucide-react";

// Time-of-day greeting shown at the top of the "home" dashboards — costs
// almost nothing to compute (just the local hour) but makes a returning
// visitor's dashboard feel like it was actually looking out for them
// rather than showing the exact same static heading at 8am and 11pm.
//
// Uses the VISITOR's local clock (new Date() in the browser), not a
// server timestamp — correct, since "good morning" should match what
// morning looks like to the person actually looking at the screen,
// regardless of what timezone your servers happen to run in.
function getTimeOfDay() {
  const hour = new Date().getHours();
  if (hour < 5) return { label: "Good night", Icon: Moon };
  if (hour < 12) return { label: "Good morning", Icon: Sun };
  if (hour < 17) return { label: "Good afternoon", Icon: Sun };
  if (hour < 21) return { label: "Good evening", Icon: Sunset };
  return { label: "Good night", Icon: Moon };
}

export default function DashboardGreeting({ name, subtitle, className = "" }) {
  const { label, Icon } = getTimeOfDay();
  const firstName = name?.split(" ")[0];

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <div className="w-10 h-10 rounded-full bg-route/15 text-route flex items-center justify-center shrink-0">
        <Icon className="w-[18px] h-[18px]" />
      </div>
      <div>
        <h1 className="font-display text-2xl sm:text-3xl font-semibold text-ink dark:text-paper leading-tight">
          {label}
          {firstName ? `, ${firstName}` : ""}
        </h1>
        {subtitle && <p className="text-sm text-slate dark:text-slate-light mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
}
