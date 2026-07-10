import { Link } from "react-router-dom";
import RouteSignature from "../components/RouteSignature";

const ROLE_CARDS = [
  {
    code: "WB-01",
    title: "Send a delivery",
    desc: "Post a pickup and drop-off. A verified rider or driver accepts it and gets moving.",
    cta: "Sign up to send",
    to: "/signup/customer",
  },
  {
    code: "WB-02",
    title: "Deliver & earn",
    desc: "Register as a self, bike, or cab agent. Accept jobs near you, get paid per drop.",
    cta: "Become an agent",
    to: "/signup/agent",
  },
  {
    code: "WB-03",
    title: "Run the network",
    desc: "Approve agents, monitor every delivery in transit, and keep the platform healthy.",
    cta: "Admin access",
    to: "/signup/admin",
  },
];

const STEPS = [
  { label: "Post it", text: "Tell us what you're sending, where it's going, and who's picking it up." },
  { label: "Matched", text: "The nearest approved agent — bike, cab, or self — accepts the job." },
  { label: "Tracked", text: "Follow it live through pickup, transit, and delivery with a waybill code." },
  { label: "Delivered", text: "Recipient confirms, agent gets paid, you get a receipt." },
];

const VEHICLES = [
  { name: "Self", detail: "On-foot local errands — documents, small parcels, same-building drops." },
  { name: "Bike", detail: "Dispatch riders for fast intra-city parcels. Our most-used vehicle class." },
  { name: "Cab", detail: "Car agents for bulkier loads, multiple stops, or fragile items." },
];

export default function Landing() {
  return (
    <div>
      {/* HERO */}
      <section className="bg-ink text-paper relative overflow-hidden">
        <div className="max-w-6xl mx-auto px-5 pt-20 pb-16 grid md:grid-cols-2 gap-10 items-center">
          <div>
            <div className="inline-flex items-center gap-2 font-mono text-xs text-route border border-line rounded-full px-3 py-1 mb-6">
              <span className="w-1.5 h-1.5 rounded-full bg-route" />
              LIVE ACROSS LAGOS, ABUJA &amp; PORT HARCOURT
            </div>
            <h1 className="font-display text-4xl sm:text-5xl font-semibold leading-[1.1] mb-5">
              Send it. Track it.<br />Get it there.
            </h1>
            <p className="text-slate-light text-lg mb-8 max-w-md">
              SwiftRoute connects you to verified bike, cab, and self agents across Nigeria —
              matched to your parcel in minutes, tracked to the door.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link to="/signup/customer" className="bg-route hover:bg-route-dark text-ink font-semibold rounded-lg px-6 py-3 transition-colors">
                Send a delivery
              </Link>
              <Link to="/signup/agent" className="border border-line hover:border-slate-light text-paper font-medium rounded-lg px-6 py-3 transition-colors">
                Become an agent
              </Link>
            </div>
          </div>
          <div className="hidden md:block">
            <RouteSignature className="w-full h-auto" />
          </div>
        </div>
      </section>

      {/* ROLE CARDS */}
      <section className="max-w-6xl mx-auto px-5 py-16">
        <div className="font-mono text-xs text-slate mb-2">CHOOSE YOUR ROLE</div>
        <h2 className="font-display text-2xl sm:text-3xl font-semibold mb-10">Three ways onto the network</h2>
        <div className="grid md:grid-cols-3 gap-5">
          {ROLE_CARDS.map((card) => (
            <div key={card.code} className="border border-slate-200 rounded-2xl p-6 bg-white hover:border-ink transition-colors flex flex-col">
              <div className="font-mono text-xs text-signal mb-4">[{card.code}]</div>
              <h3 className="font-display text-xl font-semibold mb-2">{card.title}</h3>
              <p className="text-slate text-sm mb-6 flex-1">{card.desc}</p>
              <Link to={card.to} className="text-sm font-semibold text-ink border-b-2 border-route w-fit pb-0.5 hover:border-signal transition-colors">
                {card.cta} →
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="bg-ink-soft/[0.03] border-y border-slate-200">
        <div className="max-w-6xl mx-auto px-5 py-16">
          <div className="font-mono text-xs text-slate mb-2">THE ROUTE</div>
          <h2 className="font-display text-2xl sm:text-3xl font-semibold mb-10">From pickup to proof of delivery</h2>
          <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-6">
            {STEPS.map((step, i) => (
              <div key={step.label}>
                <div className="font-mono text-xs text-signal mb-2">STEP {i + 1}</div>
                <h3 className="font-display font-semibold mb-1.5">{step.label}</h3>
                <p className="text-sm text-slate">{step.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* VEHICLE TYPES */}
      <section className="max-w-6xl mx-auto px-5 py-16">
        <div className="font-mono text-xs text-slate mb-2">AGENT FLEET</div>
        <h2 className="font-display text-2xl sm:text-3xl font-semibold mb-10">Every kind of drop, covered</h2>
        <div className="grid sm:grid-cols-3 gap-5">
          {VEHICLES.map((v) => (
            <div key={v.name} className="rounded-2xl p-6 bg-ink text-paper">
              <h3 className="font-display text-lg font-semibold mb-2 text-route">{v.name}</h3>
              <p className="text-sm text-slate-light">{v.detail}</p>
            </div>
          ))}
        </div>
      </section>

      {/* FOOTER CTA */}
      <section className="bg-ink text-paper">
        <div className="max-w-6xl mx-auto px-5 py-16 text-center">
          <h2 className="font-display text-3xl font-semibold mb-4">Ready to move something?</h2>
          <p className="text-slate-light mb-8">Sign up in under a minute. No card required to get a quote.</p>
          <Link to="/signup" className="bg-route hover:bg-route-dark text-ink font-semibold rounded-lg px-7 py-3 transition-colors inline-block">
            Create your account
          </Link>
        </div>
      </section>

      <footer className="bg-ink border-t border-line text-slate-light">
        <div className="max-w-6xl mx-auto px-5 py-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm font-mono">
          <span>© {new Date().getFullYear()} SwiftRoute — Built for Nigerian logistics.</span>
          <span>Lagos · Abuja · Port Harcourt</span>
        </div>
      </footer>
    </div>
  );
}
