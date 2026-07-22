const WHATSAPP_NUMBER = "2348147412719";
const SUPPORT_EMAIL = "support@pickandearn.com.ng";

export default function Contact() {
  return (
    <div className="max-w-2xl mx-auto px-5 py-16">
      <div className="font-mono text-xs text-slate mb-2">CONTACT</div>
      <h1 className="font-display text-3xl font-semibold mb-6">Get in touch</h1>
      <p className="text-slate mb-8">
        Whether it's a question about a delivery, an issue with your account, or something else
        entirely — here's how to reach us.
      </p>

      <div className="grid sm:grid-cols-2 gap-5">
        <a
          href={`https://wa.me/${WHATSAPP_NUMBER}`}
          target="_blank"
          rel="noopener noreferrer"
          className="border border-slate-200 rounded-2xl p-6 hover:border-ink transition-colors block"
        >
          <div className="font-mono text-xs text-signal mb-3">FASTEST</div>
          <h3 className="font-display text-lg font-semibold mb-1">WhatsApp</h3>
          <p className="text-sm text-slate">Message us directly for the quickest response.</p>
        </a>

        <a
          href={`mailto:${SUPPORT_EMAIL}`}
          className="border border-slate-200 rounded-2xl p-6 hover:border-ink transition-colors block"
        >
          <div className="font-mono text-xs text-signal mb-3">EMAIL</div>
          <h3 className="font-display text-lg font-semibold mb-1">{SUPPORT_EMAIL}</h3>
          <p className="text-sm text-slate">Best for anything that needs more detail or attachments.</p>
        </a>
      </div>

      <p className="text-sm text-slate mt-8">
        If your question is about a specific delivery, please have the tracking code (e.g.{" "}
        <code className="font-mono text-ink">PAE-XXXXXXX</code>) ready — it helps us find your order faster.
      </p>
    </div>
  );
}
