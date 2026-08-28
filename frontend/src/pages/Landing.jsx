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
import Reveal from "../components/Reveal";
import { Flame } from "lucide-react";

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
  { name: "Gas", detail: "Dedicated agents who bring cooking gas and refill your cylinder at home." },
];

export default function Landing() {
  return (
    <div>
      {/* HERO — one primary audience: someone who needs to send something.
          Rider/agent signup stays available but as a secondary link, not a
          second headline competing for attention.
          Cream/light per brand spec, not the dark navy this used to be —
          also lets HeroLiveMap (now itself a light daytime illustration)
          sit directly on the section without a jarring light-panel-on-
          dark-hero mismatch. */}
      <section className="bg-paper text-ink dark:bg-ink dark:text-paper relative overflow-hidden">
        {/* Ambient depth layer — purely decorative, sits behind everything.
            Much lower opacity than the old dark-hero version: a glow that
            reads as moody ambient light on navy just looks like a color
            smudge at the same strength on cream, so these are toned way
            down and sized a little smaller. Second glow now pulls from
            brand-blue instead of signal (which is "warning orange" now,
            not a color to feature ambiently) — gives a red/blue duo
            instead of two warm tones sitting on top of each other. In
            dark mode the glows go back up in opacity since they're doing
            the opposite job there — moody light against a dark surface
            again, same as the site's original dark-hero treatment. */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
          <div
            className="hero-glow-a absolute -top-24 -left-24 w-[420px] h-[420px] rounded-full blur-[100px] opacity-10 dark:opacity-30"
            style={{ background: "radial-gradient(circle, var(--color-route) 0%, transparent 70%)" }}
          />
          <div
            className="hero-glow-b absolute top-1/3 -right-32 w-[480px] h-[480px] rounded-full blur-[110px] opacity-10 dark:opacity-25"
            style={{ background: "radial-gradient(circle, var(--color-brand-blue) 0%, transparent 70%)" }}
          />
          <div className="absolute inset-0 grain-overlay" />
        </div>

        <div className="max-w-6xl mx-auto px-5 pt-20 pb-16 grid md:grid-cols-2 gap-10 items-center relative">
          <div className="fade-up-stagger">
            <div className="inline-flex items-center gap-2 font-mono text-xs text-route bg-white/60 dark:bg-white/5 border border-ink/10 dark:border-paper/15 rounded-full px-3 py-1 mb-6">
              <span className="w-1.5 h-1.5 rounded-full bg-route" />
              VERIFIED RIDERS · INSURED PARCELS
            </div>
            <h1 className="font-display text-4xl sm:text-5xl font-semibold leading-[1.1] mb-5 text-ink dark:text-paper">
              Send it today.<br />Track every mile.
            </h1>
            <p className="text-slate dark:text-slate-light text-lg mb-6 max-w-md">
              Get a live rider, a real price, and proof of delivery — in one request. Watch every
              step from pickup to your door.
            </p>

            <div className="max-w-md mb-4">
              <HeroQuoteWidget />
            </div>

            <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
              <Link to="/track" className="text-slate hover:text-ink dark:text-slate-light dark:hover:text-paper underline decoration-ink/20 dark:decoration-paper/20 underline-offset-4 transition-colors">
                Track a package
              </Link>
              <Link to="/signup/agent" className="text-slate hover:text-ink dark:text-slate-light dark:hover:text-paper underline decoration-ink/20 dark:decoration-paper/20 underline-offset-4 transition-colors">
                Earn as a rider instead
              </Link>
            </div>
          </div>
          {/* Wrapper stays light-tinted even in dark mode on purpose —
              HeroLiveMap is its own light daytime illustration internally
              (cream sky, etc.), so darkening just this card would put a
              light illustration in a jarring dark frame. Treating it like
              a framed photo that keeps its own look regardless of site
              theme reads better than trying to reskin the SVG itself for
              a second, dark-mode-only color pass. */}
          <div className="bg-white/50 dark:bg-paper/90 border border-ink/5 dark:border-transparent rounded-3xl p-3 shadow-sm">
            <HeroLiveMap className="w-full h-auto" />
          </div>
        </div>
      </section>

      <StatsBar />

      {/* LIVE TRACKING DEMO */}
      <section className="bg-ink-soft/[0.03] dark:bg-paper/[0.03] border-y border-slate-200 dark:border-line">
        <Reveal className="max-w-6xl mx-auto px-5 py-16 grid md:grid-cols-2 gap-10 items-center">
          <div>
            <div className="font-mono text-xs text-slate dark:text-slate-light mb-2">REAL-TIME VISIBILITY</div>
            <h2 className="font-display text-2xl sm:text-3xl font-semibold mb-4 text-ink dark:text-paper">Watch it move, start to finish</h2>
            <p className="text-slate dark:text-slate-light text-sm mb-6 max-w-md">
              Every delivery gets its own tracking code and a live status you can check any time —
              no "please call our office" required. Here's what it looks like.
            </p>
            <Link to="/track" className="text-sm font-semibold text-ink dark:text-paper border-b-2 border-route w-fit pb-0.5 hover:border-signal transition-colors">
              Try tracking a package →
            </Link>
          </div>
          <TrackingDemo />
        </Reveal>
      </section>

      {/* RIDES PREVIEW — booking is live now (was "coming soon" copy
          before rides phase 2 shipped); updated to reflect that and point
          straight at /rides instead of only at agent signup. */}
      <section>
        <Reveal className="max-w-6xl mx-auto px-5 py-16 grid md:grid-cols-2 gap-10 items-center">
          <div className="order-2 md:order-1">
            <Suspense fallback={<div className="h-[340px] rounded-2xl border border-slate-200 dark:border-line bg-slate-50 dark:bg-white/5 animate-pulse" />}>
              <NearbyDriversMap height={340} />
            </Suspense>
          </div>
          <div className="order-1 md:order-2">
            <div className="font-mono text-xs text-slate dark:text-slate-light mb-2">RIDES</div>
            <h2 className="font-display text-2xl sm:text-3xl font-semibold mb-4 text-ink dark:text-paper">Cab agents, live on the map</h2>
            <p className="text-slate dark:text-slate-light text-sm mb-6 max-w-md">
              These are real cab agents on the PickAndEarn network, online right now. Book a ride with one
              of them directly — live tracking from pickup to drop-off included.
            </p>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              <Link to="/rides" className="text-sm font-semibold text-ink dark:text-paper border-b-2 border-route w-fit pb-0.5 hover:border-signal transition-colors">
                Book a ride →
              </Link>
              <Link to="/signup/agent" className="text-sm font-semibold text-ink dark:text-paper border-b-2 border-route w-fit pb-0.5 hover:border-signal transition-colors">
                Register as a cab agent →
              </Link>
            </div>
          </div>
        </Reveal>
      </section>

      {/* GAS PREVIEW — same treatment as the Rides preview above: its own
          section with a dedicated ordering link, not buried in the
          Deliver & Earn role card. No live map here (unlike Rides'
          NearbyDriversMap) — gas agents aren't "browsing nearby" in the
          same way; a fixed illustration/icon block does the job without
          fabricating a feature that doesn't exist. */}
      <section className="bg-ink-soft/[0.03] dark:bg-paper/[0.03] border-y border-slate-200 dark:border-line">
        <Reveal className="max-w-6xl mx-auto px-5 py-16 grid md:grid-cols-2 gap-10 items-center">
          <div>
            <div className="font-mono text-xs text-slate dark:text-slate-light mb-2">COOKING GAS</div>
            <h2 className="font-display text-2xl sm:text-3xl font-semibold mb-4 text-ink dark:text-paper">Gas finished? We'll fill it at home.</h2>
            <p className="text-slate dark:text-slate-light text-sm mb-6 max-w-md">
              Pick your cylinder size, pay in the app, and a dedicated gas agent brings LPG straight
              to your door and refills your existing cylinder on the spot — no trip to the station.
            </p>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              <Link to="/gas" className="text-sm font-semibold text-ink dark:text-paper border-b-2 border-route w-fit pb-0.5 hover:border-signal transition-colors">
                Order a refill →
              </Link>
              <Link to="/signup/agent" className="text-sm font-semibold text-ink dark:text-paper border-b-2 border-route w-fit pb-0.5 hover:border-signal transition-colors">
                Register as a gas agent →
              </Link>
            </div>
          </div>
          <div className="card-tactile rounded-2xl p-10 bg-white dark:bg-ink-soft border border-slate-200 dark:border-line flex items-center justify-center">
            <Flame className="w-24 h-24 text-route" strokeWidth={1.25} />
          </div>
        </Reveal>
      </section>

      {/* ROLE CARDS */}
      <section>
        <Reveal className="max-w-6xl mx-auto px-5 py-16">
          <div className="font-mono text-xs text-slate dark:text-slate-light mb-2">CHOOSE YOUR ROLE</div>
          <h2 className="font-display text-2xl sm:text-3xl font-semibold mb-10 text-ink dark:text-paper">Two ways onto the network</h2>
          <div className="grid md:grid-cols-2 gap-5">
            {ROLE_CARDS.map((card) => (
              <div key={card.code} className="card-tactile border border-slate-200 dark:border-line rounded-2xl p-6 bg-white dark:bg-ink-soft hover:border-ink dark:hover:border-paper transition-colors flex flex-col">
                <div className="font-mono text-xs text-signal mb-4">[{card.code}]</div>
                <h3 className="font-display text-xl font-semibold mb-2 text-ink dark:text-paper">{card.title}</h3>
                <p className="text-slate dark:text-slate-light text-sm mb-6 flex-1">{card.desc}</p>
                <Link to={card.to} className="text-sm font-semibold text-ink dark:text-paper border-b-2 border-route w-fit pb-0.5 hover:border-signal transition-colors">
                  {card.cta} →
                </Link>
              </div>
            ))}
          </div>
        </Reveal>
      </section>

      {/* EARNINGS CALCULATOR — sits right after the role cards, since
          "Deliver & earn" is exactly the card a prospective agent just
          read. Clearly labeled as an estimate throughout (see the
          component itself) — never presented as a guarantee. */}
      <section className="bg-ink-soft/[0.03] dark:bg-paper/[0.03] border-y border-slate-200 dark:border-line">
        <Reveal className="max-w-6xl mx-auto px-5 py-16 grid md:grid-cols-2 gap-10 items-center">
          <div>
            <div className="font-mono text-xs text-slate dark:text-slate-light mb-2">DELIVER & EARN</div>
            <h2 className="font-display text-2xl sm:text-3xl font-semibold mb-4 text-ink dark:text-paper">See what a typical week could look like</h2>
            <p className="text-slate dark:text-slate-light text-sm mb-6 max-w-md">
              Pick your vehicle and how many jobs you'd realistically take a day — the numbers update instantly.
              This is a starting-point estimate based on our real fare pricing, not a promise.
            </p>
            <Link to="/signup/agent" className="text-sm font-semibold text-ink dark:text-paper border-b-2 border-route w-fit pb-0.5 hover:border-signal transition-colors">
              Become an agent →
            </Link>
          </div>
          <div className="card-tactile rounded-2xl">
            <EarningsCalculator />
          </div>
        </Reveal>
      </section>

      <Reveal>
        <BusinessSection />
      </Reveal>

      {/* HOW IT WORKS */}
      <section className="bg-ink-soft/[0.03] dark:bg-paper/[0.03] border-y border-slate-200 dark:border-line">
        <Reveal className="max-w-6xl mx-auto px-5 py-16">
          <div className="font-mono text-xs text-slate dark:text-slate-light mb-2">THE ROUTE</div>
          <h2 className="font-display text-2xl sm:text-3xl font-semibold mb-12 text-ink dark:text-paper">From booking to proof of delivery</h2>
          <HowItWorksDiagram />
        </Reveal>
      </section>

      {/* VEHICLE TYPES — flipped to light, same white-card-with-colored-
          top-border treatment the brand spec calls for on dashboard cards,
          so this reads as one consistent card language across the site
          rather than a one-off. */}
      <section>
        <Reveal className="max-w-6xl mx-auto px-5 py-16">
          <div className="font-mono text-xs text-slate dark:text-slate-light mb-2">AGENT FLEET</div>
          <h2 className="font-display text-2xl sm:text-3xl font-semibold mb-10 text-ink dark:text-paper">Every kind of drop, covered</h2>
          <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-5">
            {VEHICLES.map((v) => (
              <div key={v.name} className="card-tactile rounded-2xl p-6 bg-white dark:bg-ink-soft border-t-4 border-brand-blue shadow-sm">
                <h3 className="font-display text-lg font-semibold mb-2 text-route">{v.name}</h3>
                <p className="text-sm text-slate dark:text-slate-light">{v.detail}</p>
              </div>
            ))}
          </div>
        </Reveal>
      </section>

      <Reveal>
        <ReviewsSection />
      </Reveal>

      {/* FOOTER CTA — bookends the hero, so it gets the exact same
          cream/light (and now dark-mode) treatment as the hero. (Left the
          "Vehicle Fleet" cards above as their own light-with-dark-mode
          treatment rather than a permanent dark band — now that every
          section properly supports both modes, there's no longer a need
          to force one section to stay dark for rhythm; dark mode itself
          provides that rhythm change when it's on.) */}
      <section className="bg-paper text-ink dark:bg-ink dark:text-paper relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
          <div
            className="hero-glow-a absolute top-0 left-1/3 w-[400px] h-[400px] rounded-full blur-[100px] opacity-10 dark:opacity-25"
            style={{ background: "radial-gradient(circle, var(--color-route) 0%, transparent 70%)" }}
          />
          <div className="absolute inset-0 grain-overlay" />
        </div>
        <Reveal className="max-w-6xl mx-auto px-5 py-16 text-center relative">
          <h2 className="font-display text-3xl font-semibold mb-4 text-ink dark:text-paper">Ready to move something?</h2>
          <p className="text-slate dark:text-slate-light mb-8">Get a quote above, or sign up in under a minute.</p>
          <Link to="/signup" className="btn-tactile bg-route hover:bg-route-dark text-ink font-semibold rounded-lg px-7 py-3 transition-colors inline-block">
            Create your account
          </Link>
        </Reveal>
      </section>

    </div>
  );
}
