import { useEffect, useRef, useState } from "react";

// Fires exactly once per milestone crossed in this session — same "seen
// set" dedup pattern as useCelebrateOnComplete.js, for the same reason:
// the streak value gets re-read on every poll/reload, and a milestone
// hit once shouldn't re-trigger the celebration every time the page
// happens to refetch the same number.
//
// `milestones` comes from the real API response (routes/streaks.js
// returns STREAK_MILESTONES alongside the streak itself) rather than a
// hardcoded guess here — this hook stays correctly in sync with whatever
// the backend actually defines as milestone days, including if that list
// ever changes server-side.
export function useStreakMilestone(currentStreak, milestones) {
  const [celebrating, setCelebrating] = useState(null);
  const seenRef = useRef(new Set());

  const milestoneDays = Array.isArray(milestones)
    ? milestones.map((m) => (typeof m === "number" ? m : m?.days)).filter((d) => typeof d === "number")
    : [];

  useEffect(() => {
    if (!currentStreak) return;
    const hit = milestoneDays.find((m) => m === currentStreak);
    if (hit && !seenRef.current.has(hit)) {
      seenRef.current.add(hit);
      setCelebrating(hit);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStreak, JSON.stringify(milestoneDays)]);

  function dismiss() {
    setCelebrating(null);
  }

  return { celebrating, dismiss };
}
