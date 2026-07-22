export default function About() {
  return (
    <div className="max-w-3xl mx-auto px-5 py-16">
      <div className="font-mono text-xs text-slate mb-2">ABOUT</div>
      <h1 className="font-display text-3xl font-semibold mb-6">About PickAndEarn</h1>

      <div className="prose-sm text-slate space-y-4 leading-relaxed">
        <p>
          PickAndEarn is a Nigerian on-demand delivery network connecting customers who need
          something moved with verified agents — on foot, on a bike, or by cab — who can move it.
          We started in Lagos and Ogun State, matching deliveries to nearby agents in minutes and
          giving customers a live, trackable view of their parcel from pickup to drop-off.
        </p>
        <p>
          Every agent on the platform goes through an approval process before they can accept a
          single job, and every delivery is priced transparently using real driving distance —
          not a guess. We built this because too many delivery experiences in Nigeria leave
          customers wondering where their package is and whether the price they were quoted is
          the price they'll actually pay. We wanted to fix both.
        </p>
        <p>
          PickAndEarn is still early — we're a small, growing operation, not a large logistics
          company yet. We'd rather be honest about that than pretend otherwise. If you're a
          customer, a business, or someone looking to earn as an agent, we're glad you're here
          this early.
        </p>
      </div>
    </div>
  );
}
