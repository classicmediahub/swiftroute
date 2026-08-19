import { useEffect, useRef, useState } from "react";

// RequestRide.jsx / CustomerDashboard.jsx poll their ride/delivery lists
// every few seconds (see loadRides / equivalent). Each poll re-sends every
// item including ones that were ALREADY completed last time we looked —
// so naively watching "is anything completed?" would re-trigger the
// celebration overlay on every single poll forever, not just the moment
// it actually finished.
//
// This hook fixes that: it remembers which ids it has already seen in a
// "completed" state (in a ref, so it survives re-renders but resets on a
// full page reload — which is fine, a page reload is a reasonable place
// for the celebration to not replay), and only surfaces a newly-completed
// item the first time it appears that way.
//
// `items` — the polled list (rides or deliveries)
// `getId` — (item) => unique id
// `getStatus` — (item) => current status string
// `completedStatuses` — array of status strings that count as "done"
//   (rides: ["completed"], deliveries: ["delivered"])
// `toCelebration` — (item) => shape expected by TripCompleteCelebration
export function useCelebrateOnComplete(items, { getId, getStatus, completedStatuses, toCelebration }) {
  const seenCompletedRef = useRef(new Set());
  const [celebrating, setCelebrating] = useState(null);

  useEffect(() => {
    if (!items || items.length === 0) return;
    for (const item of items) {
      const id = getId(item);
      const status = getStatus(item);
      const isDone = completedStatuses.includes(status);

      if (isDone && !seenCompletedRef.current.has(id)) {
        seenCompletedRef.current.add(id);
        // Only pop the celebration for the first newly-completed item found
        // in a given poll — if somehow two finished between polls, the
        // rest just get marked seen silently rather than queuing up
        // several overlays back to back.
        if (!celebrating) setCelebrating(toCelebration(item));
      } else if (!isDone) {
        // Not done (yet, or was cancelled) — don't mark seen, so if it
        // does complete on a later poll it still triggers normally.
        seenCompletedRef.current.delete(id);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  function dismiss() {
    setCelebrating(null);
  }

  return { celebrating, dismiss };
}
