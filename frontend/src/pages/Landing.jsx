import { lazy, Suspense } from "react";
import { Link } from "react-router-dom";
import HeroLiveMap from "../components/HeroLiveMap";
import HeroQuoteWidget from "../components/HeroQuoteWidget";
import StatsBar from "../components/StatsBar";
import TrackingDemo from "../components/TrackingDemo";
import HowItWorksDiagram from "../components/HowItWorksDiagram";
import ReviewsSection from "../components/ReviewsSection";
import BusinessSection from "../components/BusinessSection";
import EarningsCalculator from "../components/EarningsCalculator";

// Lazy-loaded on purpose: this pulls in mapbox-gl, a large dependency.
// Without this, it would ship inside the main homepage bundle and
// download on every visit — including for people who never scroll down
// far enough to see it.
const NearbyDriversMap = lazy(() => import("../components/NearbyDriversMap"));

// Admin signup is intentionally not offered here. Public marketing pages
// shouldn't surface a self-serve path to an admin role — that invite should
// come from an existing admin, not a homepage card.
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
];

const VEHICLES = [
  { name: "Self", detail: "On-foot local errands — documents, small parcels, same-building drops." },
  { name: "Bike", detail: "Dispatch riders for fast intra-city parcels. Our most-used vehicle class." },
  { name: "Cab", detail: "Car agents for bulkier loads, multiple stops, or fragile items." },
];

export default function Landing() {
  return (
    <div>
      {/* HERO — one primary audience: someone who needs to send something.
          Rider/agent signup stays available but as a secondary link, not a
          second headline competing for attention. */}
      <section className="bg-ink text-paper relative overflow-hidden">
        {/* Ambient depth layer — purely decorative, sits behind everything */}
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

        <div className="max-w-6xl mx-auto px-5 pt-20 pb-16 grid md:grid-cols-2 gap-10 items-center relative">
          <div className="fade-up-stagger">
            <div className="inline-flex items-center gap-2 font-mono text-xs text-route border border-line rounded-full px-3 py-1 mb-6">
              <span className="w-1.5 h-1.5 rounded-full bg-route" />
              VERIFIED RIDERS · INSURED PARCELS
            </div>
            <h1 className="font-display text-4xl sm:text-5xl font-semibold leading-[1.1] mb-5">
              Send it today.<br />Track every mile.
            </h1>
            <p className="text-slate-light text-lg mb-6 max-w-md">
              Get a live rider, a real price, and proof of delivery — in one request. Watch every
              step from pickup to your door.
            </p>

            <div className="max-w-md mb-4">
              <HeroQuoteWidget />
            </div>

            <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
              <Link to="/track" className="text-slate-light hover:text-paper underline decoration-line underline-offset-4 transition-colors">
                Track a package
              </Link>
              <Link to="/signup/agent" className="text-slate-light hover:text-paper underline decoration-line underline-offset-4 transition-colors">
                Earn as a rider instead
              </Link>
            </div>
          </div>
          <div className="hidden md:block">
            <HeroLiveMap className="w-full h-auto" />
          </div>
        </div>
      </section>

      <StatsBar />

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

      {/* RIDES PREVIEW — booking is live now (was "coming soon" copy
          before rides phase 2 shipped); updated to reflect that and point
          straight at /rides instead of only at agent signup. */}
      <section className="max-w-6xl mx-auto px-5 py-16 grid md:grid-cols-2 gap-10 items-center">
        <div className="order-2 md:order-1">
          <Suspense fallback={<div className="h-[340px] rounded-2xl border border-slate-200 bg-slate-50 animate-pulse" />}>
            <NearbyDriversMap height={340} />
          </Suspense>
        </div>
        <div className="order-1 md:order-2">
          <div className="font-mono text-xs text-slate mb-2">RIDES</div>
          <h2 className="font-display text-2xl sm:text-3xl font-semibold mb-4">Cab agents, live on the map</h2>
          <p className="text-slate text-sm mb-6 max-w-md">
            These are real cab agents on the PickAndEarn network, online right now. Book a ride with one
            of them directly — live tracking from pickup to drop-off included.
          </p>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            <Link to="/rides" className="text-sm font-semibold text-ink border-b-2 border-route w-fit pb-0.5 hover:border-signal transition-colors">
              Book a ride →
            </Link>
            <Link to="/signup/agent" className="text-sm font-semibold text-ink border-b-2 border-route w-fit pb-0.5 hover:border-signal transition-colors">
              Register as a cab agent →
            </Link>
          </div>
        </div>
      </section>

      {/* ROLE CARDS */}
      <section className="max-w-6xl mx-auto px-5 py-16">
        <div className="font-mono text-xs text-slate mb-2">CHOOSE YOUR ROLE</div>
        <h2 className="font-display text-2xl sm:text-3xl font-semibold mb-10">Two ways onto the network</h2>
        <div className="grid md:grid-cols-2 gap-5">
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

      {/* EARNINGS CALCULATOR — sits right after the role cards, since
          "Deliver & earn" is exactly the card a prospective agent just
          read. Clearly labeled as an estimate throughout (see the
          component itself) — never presented as a guarantee. */}
      <section className="bg-ink-soft/[0.03] border-y border-slate-200">
        <div className="max-w-6xl mx-auto px-5 py-16 grid md:grid-cols-2 gap-10 items-center">
          <div>
            <div className="font-mono text-xs text-slate mb-2">DELIVER & EARN</div>
            <h2 className="font-display text-2xl sm:text-3xl font-semibold mb-4">See what a typical week could look like</h2>
            <p className="text-slate text-sm mb-6 max-w-md">
              Pick your vehicle and how many jobs you'd realistically take a day — the numbers update instantly.
              This is a starting-point estimate based on our real fare pricing, not a promise.
            </p>
            <Link to="/signup/agent" className="text-sm font-semibold text-ink border-b-2 border-route w-fit pb-0.5 hover:border-signal transition-colors">
              Become an agent →
            </Link>
          </div>
          <EarningsCalculator />
        </div>
      </section>

      <BusinessSection />

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

    </div>
  );
}
