const STYLES = {
  pending: "bg-amber-100 text-amber-800 border-amber-300",
  accepted: "bg-blue-100 text-blue-800 border-blue-300",
  picked_up: "bg-indigo-100 text-indigo-800 border-indigo-300",
  in_transit: "bg-purple-100 text-purple-800 border-purple-300",
  delivered: "bg-emerald-100 text-emerald-800 border-emerald-300",
  cancelled: "bg-slate-200 text-slate-600 border-slate-300",
  pending_approval: "bg-amber-100 text-amber-800 border-amber-300",
  approved: "bg-emerald-100 text-emerald-800 border-emerald-300",
  rejected: "bg-red-100 text-red-700 border-red-300",
  suspended: "bg-red-100 text-red-700 border-red-300",
  unpaid: "bg-amber-100 text-amber-800 border-amber-300",
  paid: "bg-emerald-100 text-emerald-800 border-emerald-300",
  failed: "bg-red-100 text-red-700 border-red-300",
};

const LABELS = {
  pending: "Pending",
  accepted: "Accepted",
  picked_up: "Picked up",
  in_transit: "In transit",
  delivered: "Delivered",
  cancelled: "Cancelled",
  approved: "Approved",
  rejected: "Rejected",
  suspended: "Suspended",
  unpaid: "Unpaid",
  paid: "Paid",
  failed: "Payment failed",
};

export default function StatusBadge({ status }) {
  const style = STYLES[status] || "bg-slate-100 text-slate-700 border-slate-300";
  const label = LABELS[status] || status;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border font-mono ${style}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
}
