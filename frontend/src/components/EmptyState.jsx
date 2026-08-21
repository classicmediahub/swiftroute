// Friendly illustrated placeholder for "nothing here yet" states — used
// wherever a table/list currently just shows plain text like "No agents
// have registered yet." Purely visual + copy; behavior (what to show,
// when) is entirely up to the caller.
//
// `icon`: an optional lucide-react icon component (e.g. `Package`,
// `Users`, `Lock`) rendered large in a soft circular badge. If omitted,
// falls back to a small hand-drawn "open box" illustration — a generic
// default that works for almost any "no records" context without every
// call site needing to pick a specific icon.
function DefaultIllustration() {
  return (
    <svg width="72" height="72" viewBox="0 0 72 72" fill="none" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="36" cy="58" rx="22" ry="4" fill="currentColor" opacity="0.08" />
      <path d="M14 30 36 20 58 30 36 40 14 30Z" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" fill="currentColor" fillOpacity="0.06" />
      <path d="M14 30V48L36 58V40" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
      <path d="M58 30V48L36 58" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
      <path d="M25 25 47 35" stroke="currentColor" strokeWidth="1.6" opacity="0.5" />
    </svg>
  );
}

export default function EmptyState({ icon: Icon, title, description, action, className = "" }) {
  return (
    <div className={`flex flex-col items-center text-center px-6 py-14 ${className}`}>
      <div className="w-20 h-20 rounded-full bg-brand-blue/10 text-brand-blue flex items-center justify-center mb-4">
        {Icon ? <Icon className="w-8 h-8" /> : <DefaultIllustration />}
      </div>
      <h3 className="font-display text-base font-semibold text-ink dark:text-paper mb-1">{title}</h3>
      {description && (
        <p className="text-sm text-slate dark:text-slate-light max-w-xs mb-4">{description}</p>
      )}
      {action}
    </div>
  );
}
