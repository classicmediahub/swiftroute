import { Link } from "react-router-dom";

const FEATURES = [
  {
    code: "BIZ-01",
    title: "Bulk upload",
    desc: "Drop in a CSV of up to 100 deliveries at once — priced and paid from your wallet in one shot, no manual re-entry.",
  },
  {
    code: "BIZ-02",
    title: "Invoices & reports",
    desc: "Every delivery logged automatically, exportable as CSV for your books, plus spend and volume reports whenever you need them.",
  },
  {
    code: "BIZ-03",
    title: "Developer API",
    desc: "Create and track deliveries straight from your own store — Shopify, WooCommerce, or a custom backend — with webhooks for order status.",
  },
];

export default function BusinessSection() {
  return (
    <section className="bg-ink text-paper">
      <div className="max-w-6xl mx-auto px-5 py-16">
        <div className="grid md:grid-cols-2 gap-10 items-start mb-12">
          <div>
            <div className="font-mono text-xs text-route mb-2">FOR BUSINESSES</div>
            <h2 className="font-display text-2xl sm:text-3xl font-semibold mb-4">
              Built for businesses that ship every day
            </h2>
            <p className="text-slate-light max-w-md">
              A free business account unlocks bulk uploads, invoicing, and API access — same
              network, same pricing, built for higher volume.
            </p>
          </div>
          <div className="flex md:justify-end items-start">
            <Link
              to="/signup/customer?business=1"
              className="bg-route hover:bg-route-dark text-ink font-semibold rounded-lg px-6 py-3 transition-colors inline-block"
            >
              Create a business account
            </Link>
          </div>
        </div>

        <div className="grid sm:grid-cols-3 gap-5">
          {FEATURES.map((f) => (
            <div key={f.code} className="border border-line rounded-2xl p-6">
              <div className="font-mono text-xs text-signal mb-3">[{f.code}]</div>
              <h3 className="font-display text-lg font-semibold mb-2">{f.title}</h3>
              <p className="text-sm text-slate-light">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
