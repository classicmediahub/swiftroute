export default function AuthLayout({ eyebrow, title, subtitle, children, wide }) {
  return (
    <div className={`mx-auto px-5 py-14 ${wide ? "max-w-2xl" : "max-w-md"}`}>
      <div className="font-mono text-xs text-signal mb-2">{eyebrow}</div>
      <h1 className="font-display text-2xl sm:text-3xl font-semibold mb-2">{title}</h1>
      {subtitle && <p className="text-slate text-sm mb-8">{subtitle}</p>}
      {!subtitle && <div className="mb-6" />}
      {children}
    </div>
  );
}

export function Field({ label, children }) {
  return (
    <label className="block mb-4">
      <span className="block text-sm font-medium text-ink mb-1.5">{label}</span>
      {children}
    </label>
  );
}

export const inputClass =
  "w-full border border-slate-300 rounded-lg px-3.5 py-2.5 text-sm focus:border-ink focus:ring-1 focus:ring-ink outline-none transition-colors bg-white";
