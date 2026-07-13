import StatusBadge from "./StatusBadge";

function exportCsv(deliveries) {
  const headers = ["tracking_code", "date", "package_type", "pickup_city", "dropoff_city", "distance_km", "price", "status", "payment_method"];
  const rows = deliveries.map((d) => [
    d.tracking_code,
    new Date(d.created_at).toLocaleDateString(),
    d.package_type,
    d.pickup_city,
    d.dropoff_city,
    d.distance_km ?? "",
    d.price,
    d.status,
    d.payment_method,
  ]);
  const csv = [headers.join(","), ...rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `pickandearn-invoices-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function Invoices({ deliveries }) {
  const totalSpent = deliveries.filter((d) => d.payment_status === "paid").reduce((sum, d) => sum + d.price, 0);

  return (
    <div className="border border-slate-200 rounded-2xl p-6 bg-white">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="font-display text-lg font-semibold mb-1">Invoices</h2>
          <p className="text-sm text-slate">Every delivery, for your records. Total paid: ₦{totalSpent.toLocaleString()}.</p>
        </div>
        <button
          onClick={() => exportCsv(deliveries)}
          disabled={deliveries.length === 0}
          className="text-xs font-semibold text-ink border border-slate-300 rounded-lg px-3 py-2 hover:border-slate-400 transition-colors disabled:opacity-40 shrink-0"
        >
          Export CSV
        </button>
      </div>

      {deliveries.length === 0 ? (
        <p className="text-sm text-slate">No deliveries yet.</p>
      ) : (
        <div className="overflow-x-auto border border-slate-200 rounded-xl">
          <table className="w-full text-xs">
            <thead className="bg-paper text-left text-slate uppercase font-mono">
              <tr>
                <th className="px-3 py-2">Tracking</th>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Route</th>
                <th className="px-3 py-2">Price</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {deliveries.map((d) => (
                <tr key={d.id} className="border-t border-slate-100">
                  <td className="px-3 py-2 font-mono">{d.tracking_code}</td>
                  <td className="px-3 py-2">{new Date(d.created_at).toLocaleDateString()}</td>
                  <td className="px-3 py-2">{d.pickup_city} → {d.dropoff_city}</td>
                  <td className="px-3 py-2 font-mono">₦{d.price.toLocaleString()}</td>
                  <td className="px-3 py-2"><StatusBadge status={d.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
