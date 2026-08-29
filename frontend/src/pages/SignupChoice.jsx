import { Link, useSearchParams } from "react-router-dom";

// --- TEMP-LAUNCH-GATE: customer + admin routes show ComingSoon until
// Monday (see App.jsx). comingSoon here just controls the visual badge
// below so the click feels intentional rather than broken — remove both
// `comingSoon: true` flags (and this comment) at the same time you
// revert App.jsx's route gate.
const OPTIONS = [
  { to: "/signup/customer", code: "WB-01", title: "I want to send deliveries", desc: "Create requests, get matched with agents, track every parcel.", comingSoon: true },
  { to: "/signup/agent", code: "WB-02", title: "I want to deliver & earn", desc: "Register as a self, bike, or cab agent and start accepting jobs." },
  { to: "/signup/admin", code: "WB-03", title: "I'm an admin", desc: "Requires an invite code from an existing PickAndEarn admin.", comingSoon: true },
  { to: "/signup/outlet", code: "WB-04", title: "I own a restaurant or shop", desc: "Partner with us to sell food and groceries through the app.", comingSoon: true },
];

export default function SignupChoice() {
  // A referral link points here first (see ReferralCard.jsx's
  // referral_link), so ?ref=CODE needs to survive the click through to
  // whichever actual signup form the person picks next — SignupCustomer
  // and SignupAgent both already read it via useSearchParams, but only
  // if it's still in the URL when they load.
  const [params] = useSearchParams();
  const ref = params.get("ref");
  const search = ref ? `?ref=${encodeURIComponent(ref)}` : "";

  return (
    <div className="max-w-3xl mx-auto px-5 py-16">
      <div className="font-mono text-xs text-slate mb-2">GET STARTED</div>
      <h1 className="font-display text-3xl font-semibold mb-10">How will you use PickAndEarn?</h1>
      {ref && (
        <p className="text-xs text-route bg-route/10 border border-route/30 rounded-lg px-3 py-2 mb-6 inline-block">
          Referral code <span className="font-mono font-semibold">{ref}</span> will be applied — just pick an option below.
        </p>
      )}
      <div className="grid gap-4">
        {OPTIONS.map((opt) => (
          <Link
            key={opt.to}
            to={`${opt.to}${search}`}
            className={`border rounded-2xl p-6 transition-colors flex items-start justify-between gap-4 bg-white ${
              opt.comingSoon ? "border-slate-200 opacity-70 hover:opacity-100 hover:border-slate-300" : "border-slate-200 hover:border-ink"
            }`}
          >
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="font-mono text-xs text-signal">[{opt.code}]</span>
                {opt.comingSoon && (
                  <span className="font-mono text-[10px] tracking-wide bg-slate-100 text-slate rounded-full px-2 py-0.5">
                    OPENING MONDAY
                  </span>
                )}
              </div>
              <h3 className="font-display text-lg font-semibold mb-1">{opt.title}</h3>
              <p className="text-sm text-slate">{opt.desc}</p>
            </div>
            <span className="text-xl text-slate-light mt-1">→</span>
          </Link>
        ))}
      </div>
      <p className="text-sm text-slate mt-8">
        Already have an account? <Link to="/login" className="text-ink font-semibold underline">Log in</Link>
      </p>
    </div>
  );
}
