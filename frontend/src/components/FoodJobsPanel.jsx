import { useEffect, useState, useCallback, useRef } from "react";
import { api } from "../api";
import ChatPanel from "./ChatPanel";
import SOSButton from "./SOSButton";
import { SkeletonCardList } from "./Skeleton";
import EmptyState from "./EmptyState";
import { UtensilsCrossed, MessageCircle } from "lucide-react";

const STAGE_LABELS = { preparing: "Being prepared", ready_for_pickup: "Ready for pickup", picked_up: "Picked up", delivered: "Delivered" };
const ACTIVE_STATUSES = ["preparing", "ready_for_pickup", "picked_up"];
const POLL_INTERVAL_MS = 10000;

export default function FoodJobsPanel({ token }) {
  const [tab, setTab] = useState("available");
  const [available, setAvailable] = useState([]);
  const [assigned, setAssigned] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [chatOpenId, setChatOpenId] = useState(null);
  const pollRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const [a, m] = await Promise.all([api.availableFoodOrders(token), api.assignedFoodOrders(token)]);
      setAvailable(a);
      setAssigned(m);
      setError("");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const hasActiveJob = assigned.some((o) => ACTIVE_STATUSES.includes(o.status));
  useEffect(() => {
    if (!hasActiveJob && tab !== "available") { if (pollRef.current) clearInterval(pollRef.current); return; }
    pollRef.current = setInterval(load, POLL_INTERVAL_MS);
    return () => clearInterval(pollRef.current);
  }, [hasActiveJob, tab, load]);

  async function handleAccept(id) {
    setBusyId(id);
    try {
      await api.acceptFoodDelivery(token, id);
      await load();
      setTab("mine");
    } catch (err) {
      alert(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function handlePickedUp(id) {
    setBusyId(id);
    try {
      await api.markFoodPickedUp(token, id);
      await load();
    } catch (err) {
      alert(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelivered(id) {
    setBusyId(id);
    try {
      await api.markFoodDelivered(token, id);
      await load();
    } catch (err) {
      alert(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function handleAgentCancel(id) {
    if (!confirm("Back out of this job? It'll go back to the available list for another rider.")) return;
    setBusyId(id);
    try {
      await api.agentCancelFoodOrder(token, id);
      await load();
    } catch (err) {
      alert(err.message);
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <SkeletonCardList count={2} />;

  return (
    <div>
      <div className="flex gap-2 mb-6 border-b border-slate-200 dark:border-line">
        <TabButton active={tab === "available"} onClick={() => setTab("available")}>Available ({available.length})</TabButton>
        <TabButton active={tab === "mine"} onClick={() => setTab("mine")}>My jobs ({assigned.length})</TabButton>
      </div>

      {error && <p className="text-sm text-signal mb-4">{error}</p>}

      {tab === "available" && (
        available.length === 0 ? (
          <EmptyState icon={UtensilsCrossed} title="No food deliveries available right now" description="New orders will show up here once an outlet starts preparing them." />
        ) : (
          <div className="space-y-4">
            {available.map((o) => (
              <div key={o.id} className="border border-slate-200 dark:border-line rounded-2xl p-5 bg-white dark:bg-ink-soft">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="font-mono text-xs text-slate dark:text-slate-light mb-1">{o.tracking_code}</div>
                    <div className="font-display font-semibold text-ink dark:text-paper">{o.outlet_name}</div>
                  </div>
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-route/20 text-route-dark">
                    ₦{(o.delivery_fee * 0.8).toLocaleString()} for you
                  </span>
                </div>
                <div className="text-xs text-slate dark:text-slate-light mb-1">
                  {STAGE_LABELS[o.status]}{o.distance_km != null && ` · ~${o.distance_km}km`}
                </div>
                <div className="text-sm text-ink dark:text-paper mb-1">Pickup: {o.outlet_address}</div>
                <div className="text-sm text-ink dark:text-paper mb-3">Deliver to: {o.delivery_address}, {o.city}{o.landmark && ` (${o.landmark})`}</div>
                <button
                  disabled={busyId === o.id}
                  onClick={() => handleAccept(o.id)}
                  className="bg-route hover:bg-route-dark text-ink font-semibold rounded-lg px-4 py-2 text-sm transition-colors disabled:opacity-60"
                >
                  {busyId === o.id ? "Accepting…" : "Accept job"}
                </button>
              </div>
            ))}
          </div>
        )
      )}

      {tab === "mine" && (
        assigned.length === 0 ? (
          <EmptyState icon={UtensilsCrossed} title="No food jobs yet" description="Accepted jobs will show up here." />
        ) : (
          <div className="space-y-4">
            {assigned.map((o) => (
              <div key={o.id} className="border border-slate-200 dark:border-line rounded-2xl p-5 bg-white dark:bg-ink-soft">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="font-mono text-xs text-slate dark:text-slate-light mb-1">{o.tracking_code}</div>
                    <div className="font-display font-semibold text-ink dark:text-paper">{o.outlet_name}</div>
                  </div>
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${["cancelled", "rejected"].includes(o.status) ? "bg-slate-100 text-slate-600" : "bg-route/20 text-route-dark"}`}>
                    {STAGE_LABELS[o.status] || o.status}
                  </span>
                </div>
                <div className="text-sm text-ink dark:text-paper mb-1">Pickup: {o.outlet_address}</div>
                <div className="text-sm text-ink dark:text-paper mb-2">Deliver to: {o.delivery_address}, {o.city}{o.landmark && ` (${o.landmark})`}</div>
                {o.note && <div className="text-xs text-slate dark:text-slate-light mb-2">Note: {o.note}</div>}

                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs text-slate dark:text-slate-light">Customer: {o.customer_name} · {o.customer_phone}</div>
                  {ACTIVE_STATUSES.includes(o.status) && (
                    <button
                      onClick={() => setChatOpenId(chatOpenId === o.id ? null : o.id)}
                      className="flex items-center gap-1 text-xs font-semibold text-route-dark hover:underline shrink-0"
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                      {chatOpenId === o.id ? "Hide chat" : "Message customer"}
                    </button>
                  )}
                </div>

                {chatOpenId === o.id && (
                  <div className="mb-3">
                    <ChatPanel token={token} tripType="food" tripId={o.id} myRole="agent" otherPartyName={o.customer_name} />
                  </div>
                )}

                {ACTIVE_STATUSES.includes(o.status) && (
                  <div className="mb-3">
                    <SOSButton token={token} tripType="food" tripId={o.id} />
                  </div>
                )}

                {o.status === "preparing" && (
                  <div className="flex gap-2 items-center">
                    <p className="text-xs text-slate dark:text-slate-light">Still being prepared — check back shortly.</p>
                    <button disabled={busyId === o.id} onClick={() => handleAgentCancel(o.id)} className="text-xs font-semibold text-red-600 hover:underline shrink-0">
                      Can't do this job
                    </button>
                  </div>
                )}
                {o.status === "ready_for_pickup" && (
                  <div className="flex gap-2">
                    <button
                      disabled={busyId === o.id}
                      onClick={() => handlePickedUp(o.id)}
                      className="bg-route hover:bg-route-dark text-ink font-semibold rounded-lg px-4 py-2 text-sm transition-colors disabled:opacity-60"
                    >
                      {busyId === o.id ? "…" : "Mark picked up"}
                    </button>
                    <button disabled={busyId === o.id} onClick={() => handleAgentCancel(o.id)} className="text-sm text-red-600 hover:underline">
                      Can't do this job
                    </button>
                  </div>
                )}
                {o.status === "picked_up" && (
                  <button
                    disabled={busyId === o.id}
                    onClick={() => handleDelivered(o.id)}
                    className="bg-route hover:bg-route-dark text-ink font-semibold rounded-lg px-4 py-2 text-sm transition-colors disabled:opacity-60"
                  >
                    {busyId === o.id ? "…" : "Mark delivered"}
                  </button>
                )}
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}

function TabButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`px-1 pb-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
        active ? "border-ink text-ink dark:text-paper dark:border-paper" : "border-transparent text-slate dark:text-slate-light hover:text-ink dark:hover:text-paper"
      }`}
    >
      {children}
    </button>
  );
}
