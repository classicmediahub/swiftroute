import { useEffect, useState, useCallback } from "react";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";
import StatusBadge from "../components/StatusBadge";
import StarRating from "../components/StarRating";

const NEXT_LABEL = {
  accepted: "Mark picked up",
  picked_up: "Mark in transit",
  in_transit: "Mark delivered",
};

export default function AgentDashboard() {
  const { token, agentProfile, refresh } = useAuth();
  const [tab, setTab] = useState("available");
  const [available, setAvailable] = useState([]);
  const [assigned, setAssigned] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");

  const isApproved = agentProfile?.approval_status === "approved";

  const loadAll = useCallback(async () => {
    if (!isApproved) { setLoading(false); return; }
    try {
      const [avail, mine] = await Promise.all([api.availableDeliveries(token), api.assignedDeliveries(token)]);
      setAvailable(avail);
      setAssigned(mine);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token, isApproved]);

  useEffect(() => { loadAll(); }, [loadAll]);

  async function handleAccept(id) {
    setBusyId(id);
    try {
      await api.acceptDelivery(token, id);
      await loadAll();
      setTab("mine");
    } catch (err) {
      alert(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function handleAdvance(id) {
    setBusyId(id);
    try {
      await api.advanceDelivery(token, id);
      await loadAll();
      await refresh();
    } catch (err) {
      alert(err.message);
    } finally {
      setBusyId(null);
    }
  }

  if (!agentProfile) {
    return <div className="max-w-4xl mx-auto px-5 py-10 text-slate">Loading profile…</div>;
  }

  return (
    <div className="max-w-5xl mx-auto px-5 py-10">
      <div className="font-mono text-xs text-slate mb-2">AGENT DASHBOARD</div>
      <h1 className="font-display text-3xl font-semibold mb-6">Your jobs</h1>

      {/* Profile summary */}
      <div className="grid sm:grid-cols-5 gap-4 mb-8">
        <SummaryCard label="Vehicle" value={agentProfile.vehicle_type} />
        <SummaryCard label="Approval" custom={<StatusBadge status={agentProfile.approval_status} />} />
        <SummaryCard label="Deliveries done" value={agentProfile.total_deliveries} />
        <SummaryCard
          label="Rating"
          custom={
            agentProfile.total_deliveries > 0 ? (
              <div className="flex items-center gap-1.5">
                <StarRating value={Math.round(agentProfile.rating)} readOnly size={14} />
                <span className="font-mono text-xs text-slate">{Number(agentProfile.rating).toFixed(1)}</span>
              </div>
            ) : (
              <span className="text-xs text-slate">No reviews yet</span>
            )
          }
        />
        <SummaryCard label="Wallet balance" value={`₦${agentProfile.wallet_balance.toLocaleString()}`} />
      </div>

      {!isApproved ? (
        <div className="border border-amber-300 bg-amber-50 rounded-2xl p-6 text-amber-900">
          <h2 className="font-display font-semibold mb-1">Your application is under review</h2>
          <p className="text-sm">
            An admin needs to approve your agent profile before you can see and accept deliveries. This usually
            takes a short while — check back soon.
          </p>
        </div>
      ) : (
        <>
          <div className="flex gap-2 mb-6 border-b border-slate-200">
            <TabButton active={tab === "available"} onClick={() => setTab("available")}>
              Available ({available.length})
            </TabButton>
            <TabButton active={tab === "mine"} onClick={() => setTab("mine")}>
              My deliveries ({assigned.length})
            </TabButton>
          </div>

          {error && <p className="text-sm text-red-600 mb-4">{error}</p>}
          {loading ? (
            <p className="text-sm text-slate">Loading…</p>
          ) : tab === "available" ? (
            available.length === 0 ? (
              <EmptyState text="No pending deliveries match your vehicle type right now." />
            ) : (
              <div className="space-y-3">
                {available.map((d) => (
                  <div key={d.id} className="border border-slate-200 rounded-xl p-4 bg-white flex items-start justify-between gap-4">
                    <div>
                      <div className="font-mono text-xs text-slate mb-1">{d.tracking_code}</div>
                      <div className="font-semibold text-sm mb-1">{d.package_type} · {d.pickup_city} → {d.dropoff_city}</div>
                      <div className="text-xs text-slate space-y-0.5">
                        <div>Pickup: {d.pickup_address}</div>
                        <div>Drop-off: {d.dropoff_address}</div>
                        <div>Customer: {d.customer_name} · {d.customer_phone}</div>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-mono font-semibold mb-2">₦{d.price.toLocaleString()}</div>
                      <button
                        disabled={busyId === d.id}
                        onClick={() => handleAccept(d.id)}
                        className="text-xs font-semibold bg-ink text-paper rounded-lg px-3 py-2 hover:bg-ink-soft transition-colors disabled:opacity-60"
                      >
                        {busyId === d.id ? "Accepting…" : "Accept job"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : assigned.length === 0 ? (
            <EmptyState text="You haven't accepted any deliveries yet." />
          ) : (
            <div className="space-y-3">
              {assigned.map((d) => (
                <div key={d.id} className="border border-slate-200 rounded-xl p-4 bg-white">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className="font-mono text-xs text-slate mb-1">{d.tracking_code}</div>
                      <div className="font-semibold text-sm">{d.package_type} · {d.pickup_city} → {d.dropoff_city}</div>
                    </div>
                    <StatusBadge status={d.status} />
                  </div>
                  <div className="text-xs text-slate space-y-0.5 mb-3">
                    <div>Pickup: {d.pickup_address}</div>
                    <div>Drop-off: {d.dropoff_address} · to {d.recipient_name} ({d.recipient_phone})</div>
                    <div>Customer: {d.customer_name} · {d.customer_phone}</div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-sm font-semibold">₦{d.price.toLocaleString()}</span>
                    {NEXT_LABEL[d.status] && (
                      <button
                        disabled={busyId === d.id}
                        onClick={() => handleAdvance(d.id)}
                        className="text-xs font-semibold bg-route hover:bg-route-dark text-ink rounded-lg px-3 py-2 transition-colors disabled:opacity-60"
                      >
                        {busyId === d.id ? "Updating…" : NEXT_LABEL[d.status]}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function SummaryCard({ label, value, custom }) {
  return (
    <div className="border border-slate-200 rounded-xl p-4 bg-white">
      <div className="text-xs text-slate mb-1">{label}</div>
      {custom || <div className="font-mono font-semibold capitalize">{value}</div>}
    </div>
  );
}

function TabButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
        active ? "border-ink text-ink" : "border-transparent text-slate hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

function EmptyState({ text }) {
  return <div className="border border-dashed border-slate-300 rounded-2xl p-8 text-center text-slate text-sm">{text}</div>;
}
