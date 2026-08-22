import { Check } from "lucide-react";

// Visually related to TripStatusStepper (same numbered-circle/checkmark
// language, so a wizard and a trip tracker feel like one design system),
// but functionally different: this one is for a form the person is
// actively filling out, not a read-only status display. Completed steps
// are clickable (to go back and fix something) — the current and future
// steps are not, since jumping ahead would skip validation.
export default function WizardStepper({ steps, currentIndex, onStepClick, className = "" }) {
  return (
    <div className={`flex items-center ${className}`}>
      {steps.map((step, i) => {
        const isDone = currentIndex > i;
        const isCurrent = currentIndex === i;
        const isLast = i === steps.length - 1;
        const clickable = isDone;

        return (
          <div key={step.key} className={`flex items-center ${isLast ? "" : "flex-1"}`}>
            <button
              type="button"
              disabled={!clickable}
              onClick={() => clickable && onStepClick(i)}
              className="flex flex-col items-center group"
            >
              <div
                className={`relative flex items-center justify-center w-8 h-8 rounded-full shrink-0 transition-colors duration-300 ${
                  isDone
                    ? "bg-delivered text-white cursor-pointer group-hover:bg-delivered/80"
                    : isCurrent
                    ? "bg-route text-ink"
                    : "bg-slate-200 dark:bg-white/10 text-slate-400 dark:text-slate-light"
                }`}
              >
                {isDone ? <Check className="w-4 h-4" strokeWidth={3} /> : <span className="text-xs font-semibold">{i + 1}</span>}
                {isCurrent && (
                  <span className="absolute inline-flex h-full w-full rounded-full bg-route opacity-40 animate-ping" />
                )}
              </div>
              <span
                className={`mt-1.5 text-[11px] text-center leading-tight max-w-[80px] ${
                  isCurrent
                    ? "font-semibold text-ink dark:text-paper"
                    : isDone
                    ? "text-delivered"
                    : "text-slate-400 dark:text-slate-light"
                }`}
              >
                {step.label}
              </span>
            </button>
            {!isLast && (
              <div
                className={`flex-1 h-0.5 mx-2 mb-5 transition-colors duration-300 ${
                  isDone ? "bg-delivered" : "bg-slate-200 dark:bg-white/10"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
