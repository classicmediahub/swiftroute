import { Check, Circle } from "lucide-react";

// Shared status-stepper look for both rides and deliveries — replaces the
// old flat colored badge (STATUS_LABEL/STATUS_COLOR in RequestRide.jsx and
// wherever deliveries render status) with the horizontal step pattern
// Bolt/Uber/Jumia all converged on: it reads instantly without needing to
// parse text, and makes progress feel tangible rather than static.
//
// `steps` is an ordered array of { key, label } describing every stage
// this trip type can pass through; `currentKey` is the ride/delivery's
// current status. Steps before currentKey render as completed
// (checkmark, filled), the current one pulses, everything after is dimmed.
//
// `cancelledLabel` renders instead of the whole stepper when the trip was
// cancelled — a stepper implies forward progress, which doesn't make sense
// to show for a trip that never finished.
export const RIDE_STEPS = [
  { key: "pending", label: "Requested" },
  { key: "accepted", label: "Driver on the way" },
  { key: "in_progress", label: "Trip in progress" },
  { key: "completed", label: "Completed" },
];

export const DELIVERY_STEPS = [
  { key: "pending", label: "Requested" },
  { key: "accepted", label: "Rider assigned" },
  { key: "picked_up", label: "Picked up" },
  { key: "in_transit", label: "On the way" },
  { key: "delivered", label: "Delivered" },
];

export default function TripStatusStepper({ steps, currentKey, cancelledLabel = "Cancelled", className = "" }) {
  if (currentKey === "cancelled") {
    return (
      <div className={`flex items-center gap-2 text-sm text-slate-500 ${className}`}>
        <Circle className="w-4 h-4" />
        {cancelledLabel}
      </div>
    );
  }

  const currentIndex = steps.findIndex((s) => s.key === currentKey);

  return (
    <div className={`flex items-center ${className}`}>
      {steps.map((step, i) => {
        const isDone = currentIndex > i;
        const isCurrent = currentIndex === i;
        const isLast = i === steps.length - 1;

        return (
          <div key={step.key} className={`flex items-center ${isLast ? "" : "flex-1"}`}>
            <div className="flex flex-col items-center">
              <div
                className={`relative flex items-center justify-center w-6 h-6 rounded-full shrink-0 transition-colors duration-300 ${
                  isDone
                    ? "bg-delivered text-white"
                    : isCurrent
                    ? "bg-route text-ink"
                    : "bg-slate-200 text-slate-400"
                }`}
              >
                {isDone ? (
                  <Check className="w-3.5 h-3.5" strokeWidth={3} />
                ) : (
                  <span className="text-[10px] font-semibold">{i + 1}</span>
                )}
                {isCurrent && (
                  <span className="absolute inline-flex h-full w-full rounded-full bg-route opacity-40 animate-ping" />
                )}
              </div>
              <span
                className={`mt-1.5 text-[11px] text-center leading-tight max-w-[72px] ${
                  isCurrent ? "font-semibold text-ink" : isDone ? "text-delivered" : "text-slate-400"
                }`}
              >
                {step.label}
              </span>
            </div>
            {!isLast && (
              <div
                className={`flex-1 h-0.5 mx-1.5 mb-5 transition-colors duration-300 ${
                  isDone ? "bg-delivered" : "bg-slate-200"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
