const STATUS_ORDER = ["pending", "accepted", "picked_up", "in_transit", "delivered", "cancelled"];
const STATUS_LABELS = {
  pending: "Pending", accepted: "Accepted", picked_up: "Picked up",
  in_transit: "In transit", delivered: "Delivered", cancelled: "Cancelled",
};

function startOfMonth() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export default function Reports({ deliveries }) {
  const paid = deliveries.filter((d) => d.payment_status === "paid");
  const totalSpent = paid.reduce((sum, d) => sum + d.price, 0);
  const avgCost = paid.length ? Math.round(totalSpent / paid.length) : 0;

  const thisMonthStart = startOfMonth();
  const spentThisMonth = paid
    .filter((d) => new Date(d.created_at) >= thisMonthStart)
    .reduce((sum, d) => sum + d.price, 0);
  const deliveriesThisMonth = deliveries.filter((d) => new Date(d.created_at) >= thisMonthStart).length;

  const byStatus = STATUS_ORDER.map((s) => ({
    status: s,
    count: deliveries.filter((d) => d.status === s).length,
  })).filter((s) => s.count > 0);

  const maxCount = Math.max(1, ...byStatus.map((s) => s.count));

  return (
    <div className="space-y-5">
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total spent" value={`₦${totalSpent.toLocaleString()}`} />
        <StatCard label="This month" value={`₦${spentThisMonth.toLocaleString()}`} sub={`${deliveriesThisMonth} deliveries`} />
        <StatCard label="Total deliveries" value={deliveries.length} />
        <StatCard label="Avg. cost per delivery" value={`₦${avgCost.toLocaleString()}`} />
      </div>

      <div className="border border-slate-200 rounded-2xl p-6 bg-white">
        <h3 className="font-display font-semibold mb-4">Deliveries by status</h3>
        {byStatus.length === 0 ? (
          <p className="text-sm text-slate">No deliveries yet.</p>
        ) : (
          <div className="space-y-3">
            {byStatus.map((s) => (
              <div key={s.status}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-ink font-medium">{STATUS_LABELS[s.status]}</span>
                  <span className="text-slate font-mono">{s.count}</span>
                </div>
                <div className="h-2 bg-paper rounded-full overflow-hidden">
                  <div className="h-full bg-route" style={{ width: `${(s.count / maxCount) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, sub }) {
  return (
    <div className="border border-slate-200 rounded-xl p-4 bg-white">
      <div className="text-xs text-slate mb-1">{label}</div>
      <div className="font-mono font-semibold text-xl">{value}</div>
      {sub && <div className="text-xs text-slate mt-0.5">{sub}</div>}
    </div>
  );
}
