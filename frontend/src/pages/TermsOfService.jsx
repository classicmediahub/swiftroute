const SUPPORT_EMAIL = "support@pickandearn.com.ng";

export default function TermsOfService() {
  return (
    <div className="max-w-3xl mx-auto px-5 py-16">
      <div className="font-mono text-xs text-slate mb-2">LEGAL</div>
      <h1 className="font-display text-3xl font-semibold mb-4">Terms of Service</h1>
      <p className="text-xs text-slate mb-8">Last updated: {new Date().toLocaleDateString("en-NG", { year: "numeric", month: "long", day: "numeric" })}</p>

      <div className="border border-amber-300 bg-amber-50 rounded-xl p-4 mb-8 text-sm text-amber-900">
        <strong>Before you publish this:</strong> this is a starting template, not a legally
        reviewed document. Have a lawyer review it before treating it as your final terms —
        especially the liability, cancellation, and refund sections, which should match how your
        business actually operates.
      </div>

      <div className="text-sm text-slate space-y-6 leading-relaxed">
        <section>
          <h2 className="font-display text-lg font-semibold text-ink mb-2">Using PickAndEarn</h2>
          <p>
            By creating an account, you agree to provide accurate information and to use
            PickAndEarn only for lawful purposes. You're responsible for keeping your login
            details secure.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-ink mb-2">Deliveries & payment</h2>
          <p>
            Prices are calculated based on real driving distance and the vehicle type selected,
            and are confirmed before payment. Payment is required upfront, either by card/bank
            transfer or from your PickAndEarn wallet, before an agent is matched to your delivery.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-ink mb-2">Cancellations</h2>
          <p>
            A delivery can be cancelled while it's still pending or has just been accepted by an
            agent, but not once it's been picked up. Cancelling a wallet-paid delivery refunds the
            amount to your wallet automatically. Cancelling a card-paid delivery is currently
            handled manually — contact us at {" "}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="text-ink underline">{SUPPORT_EMAIL}</a>{" "}
            for a refund.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-ink mb-2">Agents</h2>
          <p>
            Agents are independent — they are not PickAndEarn employees. Registering as an agent
            requires a live face-verification photo and (for bike/cab agents) a valid vehicle
            plate and license number. All agent accounts are reviewed before approval, and
            PickAndEarn reserves the right to suspend or reject an agent account.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-ink mb-2">Prohibited items</h2>
          <p>
            You may not use PickAndEarn to send anything illegal, hazardous, or that violates
            Nigerian law, including but not limited to weapons, illegal drugs, or stolen goods.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-ink mb-2">Limitation of liability</h2>
          <p>
            PickAndEarn facilitates the connection between customers and independent delivery
            agents. While we vet agents before approval, we are not liable for loss, damage, or
            delay beyond what's reasonably within our control. Contact us as soon as possible if
            something goes wrong with a delivery so we can help resolve it.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-ink mb-2">Changes to these terms</h2>
          <p>We may update these terms from time to time. Continued use of PickAndEarn after a change means you accept the updated terms.</p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-ink mb-2">Contact</h2>
          <p>
            Questions about these terms: {" "}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="text-ink underline">{SUPPORT_EMAIL}</a>.
          </p>
        </section>
      </div>
    </div>
  );
}
