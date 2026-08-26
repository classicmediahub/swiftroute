import { Link, useSearchParams } from "react-router-dom";

const OPTIONS = [
  { to: "/signup/customer", code: "WB-01", title: "I want to send deliveries", desc: "Create requests, get matched with agents, track every parcel." },
  { to: "/signup/agent", code: "WB-02", title: "I want to deliver & earn", desc: "Register as a self, bike, or cab agent and start accepting jobs." },
  { to: "/signup/admin", code: "WB-03", title: "I'm an admin", desc: "Requires an invite code from an existing PickAndEarn admin." },
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
            className="border border-slate-200 rounded-2xl p-6 hover:border-ink transition-colors flex items-start justify-between gap-4 bg-white"
          >
            <div>
              <div className="font-mono text-xs text-signal mb-2">[{opt.code}]</div>
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
