// Pulsing placeholder shapes shown while real data is still loading —
// used instead of a spinner or "Loading…" text so the page's actual
// layout is visible immediately (people can see roughly what's coming
// and where, rather than staring at a blank center-of-screen spinner).
//
// All pieces share one base pulse animation and use bg-slate-200 (light)
// / dark:bg-white/10 (dark) — a neutral tone deliberately NOT tied to any
// brand color, since a skeleton is standing in for unknown content and
// shouldn't imply anything about what that content will look like.

function base(extra = "") {
  return `animate-pulse bg-slate-200 dark:bg-white/10 rounded ${extra}`;
}

export function SkeletonLine({ width = "100%", height = "0.9rem", className = "" }) {
  return <div className={base(className)} style={{ width, height }} />;
}

export function SkeletonCircle({ size = "2.5rem", className = "" }) {
  return <div className={base(`rounded-full ${className}`)} style={{ width: size, height: size }} />;
}

// A stat-card-shaped placeholder — matches the white-card-colored-top-
// border shape used across the dashboards, minus the border/color (a
// skeleton shouldn't hint at highlight vs. normal before real data says so).
export function SkeletonStatCard() {
  return (
    <div className="border-t-4 border-slate-200 dark:border-white/10 rounded-xl p-4 bg-white dark:bg-ink-soft shadow-sm">
      <SkeletonLine width="60%" height="0.7rem" className="mb-2" />
      <SkeletonLine width="40%" height="1.4rem" />
    </div>
  );
}

export function SkeletonStatGrid({ count = 4 }) {
  return (
    <div className="grid sm:grid-cols-3 lg:grid-cols-6 gap-4">
      {Array.from({ length: count }, (_, i) => <SkeletonStatCard key={i} />)}
    </div>
  );
}

// A table-row-shaped placeholder — `columns` controls how many cells,
// `widths` optionally gives each cell a different width so the row
// doesn't look like a single uniform gray bar (real table rows never do).
export function SkeletonTableRow({ columns = 4, widths }) {
  return (
    <tr className="border-t border-slate-100 dark:border-line">
      {Array.from({ length: columns }, (_, i) => (
        <td key={i} className="px-4 py-3.5">
          <SkeletonLine width={widths?.[i] || "70%"} />
        </td>
      ))}
    </tr>
  );
}

export function SkeletonTable({ rows = 5, columns = 4, widths }) {
  return (
    <>
      {Array.from({ length: rows }, (_, i) => (
        <SkeletonTableRow key={i} columns={columns} widths={widths} />
      ))}
    </>
  );
}

// A full card-list placeholder (for pages that render a list of cards
// rather than a table — RequestRide.jsx's "My rides", for instance).
export function SkeletonCard({ className = "" }) {
  return (
    <div className={`border border-slate-200 dark:border-line rounded-xl p-4 bg-white dark:bg-ink-soft ${className}`}>
      <div className="flex items-start justify-between mb-3">
        <SkeletonLine width="55%" height="1rem" />
        <SkeletonLine width="20%" height="0.8rem" />
      </div>
      <SkeletonLine width="90%" className="mb-2" />
      <SkeletonLine width="40%" />
    </div>
  );
}

export function SkeletonCardList({ count = 3 }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: count }, (_, i) => <SkeletonCard key={i} />)}
    </div>
  );
}
