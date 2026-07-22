const SUPPORT_EMAIL = "support@pickandearn.com.ng";

export default function PrivacyPolicy() {
  return (
    <div className="max-w-3xl mx-auto px-5 py-16">
      <div className="font-mono text-xs text-slate mb-2">LEGAL</div>
      <h1 className="font-display text-3xl font-semibold mb-4">Privacy Policy</h1>
      <p className="text-xs text-slate mb-8">Last updated: {new Date().toLocaleDateString("en-NG", { year: "numeric", month: "long", day: "numeric" })}</p>

      <div className="border border-amber-300 bg-amber-50 rounded-xl p-4 mb-8 text-sm text-amber-900">
        <strong>Before you publish this:</strong> this is a starting template, not a legally
        reviewed document. Have a lawyer familiar with Nigeria's Data Protection Act (NDPA/NDPR)
        review it before treating it as your final policy — particularly the sections on
        biometric (face verification) data, which usually need extra care.
      </div>

      <div className="text-sm text-slate space-y-6 leading-relaxed">
        <section>
          <h2 className="font-display text-lg font-semibold text-ink mb-2">What we collect</h2>
          <p>
            When you create an account, we collect your name, email, phone number, and password
            (stored as a secure hash, never in plain text). Customers additionally provide
            delivery addresses and recipient details for each order. Agents additionally provide
            vehicle details and a face photo captured through their camera at signup, used to
            verify their identity at login and shown to customers once they accept a delivery.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-ink mb-2">Biometric data (agent face verification)</h2>
          <p>
            Agent accounts require a live-captured face photo. This photo is used for two
            purposes only: (1) confirming it's really you at login, by comparing a live selfie
            against your signup photo through a third-party face-matching service, and (2)
            showing customers who is delivering their order. We do not use this photo for any
            other form of identification or share it with anyone beyond what's described here.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-ink mb-2">Payments</h2>
          <p>
            Payments are processed by Paystack. We never see or store your full card details —
            those are handled entirely by Paystack's own secure systems. We store the outcome of
            a transaction (amount, status, reference) for your order history and receipts.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-ink mb-2">How we use your information</h2>
          <p>
            To create and manage your account, match deliveries with agents, process payments,
            send status updates (email/SMS), and provide customer support. We don't sell your
            personal information to third parties.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-ink mb-2">Who we share it with</h2>
          <p>
            An agent assigned to your delivery sees your delivery address, recipient details, and
            phone number — only what's needed to complete that job. A customer sees the assigned
            agent's name, phone number, and photo. We share data with service providers who help
            us operate (payment processing, SMS/email delivery, mapping) only as needed to
            provide those services.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-ink mb-2">Your rights</h2>
          <p>
            You can request a copy of the personal data we hold about you, ask us to correct it,
            or request deletion of your account, by contacting us at{" "}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="text-ink underline">{SUPPORT_EMAIL}</a>.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-ink mb-2">Contact</h2>
          <p>
            Questions about this policy or how your data is handled: {" "}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="text-ink underline">{SUPPORT_EMAIL}</a>.
          </p>
        </section>
      </div>
    </div>
  );
}
