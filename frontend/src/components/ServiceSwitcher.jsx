import { Package, Car, UtensilsCrossed, Flame, Smartphone } from "lucide-react";

const SERVICES = [
  { id: "delivery", label: "Delivery", icon: Package },
  { id: "ride", label: "Ride", icon: Car },
  { id: "food", label: "Food", icon: UtensilsCrossed },
  { id: "gas", label: "Gas", icon: Flame },
  { id: "bills", label: "Airtime", icon: Smartphone },
];

// Purely visual — the parent owns `active` state and decides what renders
// below it. Kept this way (rather than owning its own content) so it can
// sit in front of your existing, already-working RequestRide/RequestGas/
// FoodHome/delivery-form components unchanged: this never re-implements
// their logic, it just decides which one is currently mounted.
export default function ServiceSwitcher({ active, onChange, className = "" }) {
  return (
    <div className={`flex gap-1.5 bg-paper dark:bg-white/5 border border-slate-200 dark:border-line rounded-2xl p-1.5 mb-8 max-w-md ${className}`}>
      {SERVICES.map((s) => {
        const Icon = s.icon;
        const isActive = active === s.id;
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => onChange(s.id)}
            aria-pressed={isActive}
            className={`flex-1 flex flex-col items-center gap-1 py-2.5 rounded-xl text-xs font-medium transition-colors ${
              isActive
                ? "bg-white dark:bg-ink-soft text-ink dark:text-paper shadow-sm"
                : "text-slate dark:text-slate-light hover:text-ink dark:hover:text-paper"
            }`}
          >
            <Icon className="w-5 h-5" />
            {s.label}
          </button>
        );
      })}
    </div>
  );
}
