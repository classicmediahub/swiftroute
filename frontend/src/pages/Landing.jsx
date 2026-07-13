import { Link } from "react-router-dom";
import RouteSignature from "../components/RouteSignature";
import PriceCalculator from "../components/PriceCalculator";
import StatsBar from "../components/StatsBar";
import TrackingDemo from "../components/TrackingDemo";
import HowItWorksDiagram from "../components/HowItWorksDiagram";
import ReviewsSection from "../components/ReviewsSection";

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
              NIGERIA'S SMART DELIVERY NETWORK
            </div>
            <h1 className="font-display text-4xl sm:text-5xl font-semibold leading-[1.1] mb-5">
              Deliver anywhere.<br />Track everything.
            </h1>
            <p className="text-slate-light text-lg mb-8 max-w-md">
              Pay only for what you need. PickAndEarn matches you to a verified bike, cab, or self
              agent in minutes, and you can watch every step from pickup to your door.
            </p>
            <div className="flex flex-wrap gap-3">
              <a href="#calculator" className="bg-route hover:bg-route-dark text-ink font-semibold rounded-lg px-6 py-3 transition-colors">
                Get instant quote
              </a>
              <Link to="/track" className="border border-line hover:border-slate-light text-paper font-medium rounded-lg px-6 py-3 transition-colors">
                Track package
              </Link>
              <Link to="/signup/agent" className="border border-line hover:border-slate-light text-paper font-medium rounded-lg px-6 py-3 transition-colors">
                Become a rider
              </Link>
            </div>
          </div>
          <div className="hidden md:block">
            <RouteSignature className="w-full h-auto" />
          </div>
        </div>
      </section>

      <StatsBar />

      {/* PRICE CALCULATOR */}
      <section className="max-w-4xl mx-auto px-5 py-16">
        <div className="font-mono text-xs text-slate mb-2">INSTANT QUOTE</div>
        <h2 className="font-display text-2xl sm:text-3xl font-semibold mb-8">What will it cost?</h2>
        <PriceCalculator />
      </section>

      {/* LIVE TRACKING DEMO */}
      <section className="bg-ink-soft/[0.03] border-y border-slate-200">
        <div className="max-w-6xl mx-auto px-5 py-16 grid md:grid-cols-2 gap-10 items-center">
          <div>
            <div className="font-mono text-xs text-slate mb-2">REAL-TIME VISIBILITY</div>
            <h2 className="font-display text-2xl sm:text-3xl font-semibold mb-4">Watch it move, start to finish</h2>
            <p className="text-slate text-sm mb-6 max-w-md">
              Every delivery gets its own tracking code and a live status you can check any time —
              no "please call our office" required. Here's what it looks like.
            </p>
            <Link to="/track" className="text-sm font-semibold text-ink border-b-2 border-route w-fit pb-0.5 hover:border-signal transition-colors">
              Try tracking a package →
            </Link>
          </div>
          <TrackingDemo />
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
          <h2 className="font-display text-2xl sm:text-3xl font-semibold mb-12">From booking to proof of delivery</h2>
          <HowItWorksDiagram />
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

      <ReviewsSection />

      {/* FOOTER CTA */}
      <section className="bg-ink text-paper">
        <div className="max-w-6xl mx-auto px-5 py-16 text-center">
          <h2 className="font-display text-3xl font-semibold mb-4">Ready to move something?</h2>
          <p className="text-slate-light mb-8">Get a quote above, or sign up in under a minute.</p>
          <Link to="/signup" className="bg-route hover:bg-route-dark text-ink font-semibold rounded-lg px-7 py-3 transition-colors inline-block">
            Create your account
          </Link>
        </div>
      </section>

      <footer className="bg-ink border-t border-line text-slate-light">
        <div className="max-w-6xl mx-auto px-5 py-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm font-mono">
          <span>© {new Date().getFullYear()} PickAndEarn — Built for Nigerian logistics.</span>
          <span>Lagos · Ogun · Abuja · Port Harcourt</span>
        </div>
      </footer>
    </div>
  );
}
