import { useEffect, useState } from "react";

// PLACEHOLDER — replace with a real value as the VITE_LAUNCH_DATE env var
// on Vercel. ISO format with timezone, e.g. "2026-09-01T09:00:00+01:00".
const LAUNCH_DATE = import.meta.env.VITE_LAUNCH_DATE;

function getTimeLeft() {
  if (!LAUNCH_DATE) return null;
  const diff = new Date(LAUNCH_DATE).getTime() - Date.now();
  if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0 };
  return {
    days: Math.floor(diff / 86400000),
    hours: Math.floor((diff % 86400000) / 3600000),
    minutes: Math.floor((diff % 3600000) / 60000),
    seconds: Math.floor((diff % 60000) / 1000),
  };
}

export default function ComingSoon() {
  const [timeLeft, setTimeLeft] = useState(getTimeLeft());

  useEffect(() => {
    const interval = setInterval(() => setTimeLeft(getTimeLeft()), 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-ink text-paper flex items-center justify-center relative overflow-hidden px-5">
      <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        <div
          className="hero-glow-a absolute -top-24 -left-24 w-[420px] h-[420px] rounded-full blur-[100px] opacity-30"
          style={{ background: "radial-gradient(circle, var(--color-route) 0%, transparent 70%)" }}
        />
        <div
          className="hero-glow-b absolute top-1/3 -right-32 w-[480px] h-[480px] rounded-full blur-[110px] opacity-25"
          style={{ background: "radial-gradient(circle, var(--color-signal) 0%, transparent 70%)" }}
        />
        <div className="absolute inset-0 grain-overlay" />
      </div>

      <div className="relative text-center max-w-lg fade-up-stagger">
        <div className="flex items-center justify-center gap-2 font-display font-semibold text-xl mb-8">
          <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
            <rect width="32" height="32" rx="7" fill="var(--color-route)" />
            <path d="M6 22 C10 22, 10 10, 16 10 S22 22, 26 22" stroke="var(--color-ink)" strokeWidth="3" fill="none" strokeLinecap="round" />
          </svg>
          PickAndEarn
        </div>

        <div className="inline-flex items-center gap-2 font-mono text-xs text-route border border-line rounded-full px-3 py-1 mb-6">
          <span className="w-1.5 h-1.5 rounded-full bg-route" />
          LAUNCHING SOON
        </div>

        <h1 className="font-display text-3xl sm:text-4xl font-semibold mb-4">
          Something's on the way.
        </h1>
        <p className="text-slate-light mb-10">
          We're putting the final touches on Nigeria's newest delivery and ride network. Check back soon.
        </p>

        {timeLeft ? (
          <div className="grid grid-cols-4 gap-3 mb-10">
            {[
              { value: timeLeft.days, label: "Days" },
              { value: timeLeft.hours, label: "Hours" },
              { value: timeLeft.minutes, label: "Min" },
              { value: timeLeft.seconds, label: "Sec" },
            ].map((item) => (
              <div key={item.label} className="border border-line rounded-xl py-4 bg-ink-soft/40">
                <div className="font-mono text-2xl sm:text-3xl font-semibold">{String(item.value).padStart(2, "0")}</div>
                <div className="text-xs text-slate-light mt-1">{item.label}</div>
              </div>
            ))}
          </div>
        ) : (
          // No VITE_LAUNCH_DATE set yet — shows this instead of a broken
          // countdown rather than displaying NaN everywhere.
          <p className="font-mono text-xs text-slate-light mb-10">Launch date coming soon.</p>
        )}

        <a href="mailto:support@pickandearn.com.ng" className="text-sm text-slate-light hover:text-paper underline decoration-line underline-offset-4 transition-colors">
          Get in touch
        </a>
      </div>
    </div>
  );
}
