import { Flame, Snowflake } from "lucide-react";

// Deliberately takes a normalized `days` prop shape rather than whatever
// the raw API returns — once we see the real /streaks/me response, the
// integration point is a small mapping function feeding this component,
// not a rewrite of the component itself.
//
// days: array of 7 objects, OLDEST first, TODAY last:
//   { date: Date | ISOString, active: boolean, frozen?: boolean }

// The real backend (routes/streaks.js) only stores current_streak,
// longest_streak, and last_streak_date — a running count, not a
// day-by-day log. This derives the 7-day calendar from those two values:
// the streak is assumed to run backward from last_streak_date for
// current_streak days. There's no streak-freeze feature on the backend
// yet either, so `frozen` is never set true here — the visual support
// for it stays in the component (harmless if unused) in case that
// feature gets built later, but nothing fabricates fake freeze data now.
export function buildStreakDays(currentStreak, lastStreakDate) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    days.push({ date: d, active: false, frozen: false });
  }

  if (currentStreak > 0 && lastStreakDate) {
    const last = new Date(lastStreakDate);
    last.setHours(0, 0, 0, 0);
    const streakStart = new Date(last);
    streakStart.setDate(streakStart.getDate() - (currentStreak - 1));

    for (const day of days) {
      if (day.date >= streakStart && day.date <= last) day.active = true;
    }
  }

  return days;
}

// milestones from the API can be a plain array of day-counts ([7, 30]) or
// an array of {days, reward} objects — handled either way rather than
// assuming one shape, since that's the one field this integration can't
// directly confirm without seeing STREAK_MILESTONES itself.
export function nextMilestone(milestones, currentStreak) {
  if (!Array.isArray(milestones)) return null;
  const normalized = milestones
    .map((m) => (typeof m === "number" ? { days: m } : m))
    .filter((m) => m && typeof m.days === "number");
  return normalized.find((m) => m.days > currentStreak) || null;
}

export default function StreakCalendar({ days, currentStreak, longestStreak, nextMilestoneInfo, className = "" }) {
  return (
    <div className={`bg-white dark:bg-ink-soft border border-slate-200 dark:border-line rounded-2xl p-5 ${className}`}>
      <div className="flex items-center justify-between mb-5">
        <div>
          <div className="text-xs text-slate dark:text-slate-light mb-0.5">Current streak</div>
          <div className="flex items-center gap-1.5">
            <Flame className="w-5 h-5 text-route" />
            <span className="font-display text-2xl font-semibold text-ink dark:text-paper">{currentStreak}</span>
            <span className="text-sm text-slate dark:text-slate-light">day{currentStreak === 1 ? "" : "s"}</span>
          </div>
        </div>
        {longestStreak > currentStreak && (
          <div className="text-right">
            <div className="text-xs text-slate dark:text-slate-light mb-0.5">Best streak</div>
            <div className="text-sm font-semibold text-ink dark:text-paper">{longestStreak} days</div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-7 gap-2">
        {days.map((day, i) => {
          const dateObj = typeof day.date === "string" ? new Date(day.date) : day.date;
          const label = dateObj.toLocaleDateString(undefined, { weekday: "narrow" });
          const isToday = i === days.length - 1;

          return (
            <div key={i} className="flex flex-col items-center gap-1.5">
              <span className="text-[10px] text-slate-light">{label}</span>
              <div
                className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors ${
                  day.frozen
                    ? "bg-brand-blue/15 text-brand-blue"
                    : day.active
                    ? "bg-route text-ink"
                    : isToday
                    ? "border-2 border-dashed border-slate-300 dark:border-line text-slate-300 dark:text-slate-light"
                    : "bg-slate-100 dark:bg-white/5 text-slate-300 dark:text-slate-light"
                }`}
                title={
                  day.frozen ? "Streak freeze used" : day.active ? "Active" : isToday ? "Today — not yet active" : "Inactive"
                }
              >
                {day.frozen ? <Snowflake className="w-4 h-4" /> : day.active ? <Flame className="w-4 h-4" /> : null}
              </div>
            </div>
          );
        })}
      </div>

      {currentStreak === 0 && (
        <p className="text-xs text-slate dark:text-slate-light mt-4">
          Send or complete something today to start a new streak.
        </p>
      )}
      {currentStreak > 0 && nextMilestoneInfo && (
        <p className="text-xs text-slate dark:text-slate-light mt-4">
          {nextMilestoneInfo.days - currentStreak} more day{nextMilestoneInfo.days - currentStreak === 1 ? "" : "s"} to your
          {nextMilestoneInfo.reward ? ` ₦${nextMilestoneInfo.reward.toLocaleString()}` : ""} {nextMilestoneInfo.days}-day milestone.
        </p>
      )}
    </div>
  );
}
