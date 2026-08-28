import { useEffect, useState, useCallback, useRef } from "react";
import { api } from "../api";
import ChatPanel from "./ChatPanel";
import SOSButton from "./SOSButton";
import { SkeletonCardList } from "./Skeleton";
import EmptyState from "./EmptyState";
import { Flame, MessageCircle, Camera } from "lucide-react";

const STAGE_LABELS = { pending: "Available", accepted: "Accepted", en_route: "On the way", filling: "Filling", completed: "Completed" };
const NEXT_ACTION_LABEL = { accepted: "Start heading over", en_route: "Arrived — start filling", filling: "Mark complete" };
const ACTIVE_STATUSES = ["accepted", "en_route", "filling"];
const POLL_INTERVAL_MS = 10000;

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function GasJobsPanel({ token }) {
  const [tab, setTab] = useState("available");
  const [available, setAvailable] = useState([]);
  const [assigned, setAssigned] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [chatOpenId, setChatOpenId] = useState(null);
  const [photoDrafts, setPhotoDrafts] = useState({}); // { [orderId]: base64 }
  const pollRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const [a, m] = await Promise.all([api.availableGasOrders(token), api.assignedGasOrders(token)]);
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
      await api.acceptGasOrder(token, id);
      await load();
      setTab("mine");
    } catch (err) {
      alert(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function handlePhotoChange(orderId, file) {
    if (!file) return;
    const base64 = await fileToBase64(file);
    setPhotoDrafts((prev) => ({ ...prev, [orderId]: base64 }));
  }

  async function handleAdvance(order) {
    setBusyId(order.id);
    try {
      const payload = {};
      if (order.status === "filling") {
        // Require a photo on the final step — the actual proof that gas
        // was delivered, same trust signal as a delivery's proof-of-drop
        // photo. Earlier steps don't need one.
        if (!photoDrafts[order.id]) {
          alert("Take a photo of the filled cylinder before marking this complete");
          setBusyId(null);
          return;
        }
        payload.proof_photo = photoDrafts[order.id];
      }
      await api.advanceGasOrder(token, order.id, payload);
      setPhotoDrafts((prev) => { const next = { ...prev }; delete next[order.id]; return next; });
      await load();
    } catch (err) {
      alert(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function handleAgentCancel(id) {
    if (!confirm("Back out of this job? It'll go back to the available list for another gas agent.")) return;
    setBusyId(id);
    try {
      await api.agentCancelGasOrder(token, id);
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
          <EmptyState icon={Flame} title="No gas orders available right now" description="New orders will show up here as customers place them." />
        ) : (
          <div className="space-y-4">
            {available.map((o) => (
              <div key={o.id} className="border border-slate-200 dark:border-line rounded-2xl p-5 bg-white dark:bg-ink-soft">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="font-mono text-xs text-slate dark:text-slate-light mb-1">{o.tracking_code}</div>
                    <div className="font-display font-semibold text-ink dark:text-paper">{o.cylinder_size_kg}kg refill · ₦{o.price.toLocaleString()}</div>
                  </div>
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-route/20 text-route-dark">
                    ₦{(o.gas_cost + o.transport_fee * 0.8).toLocaleString()} for you
                  </span>
                </div>
                <div className="text-sm text-ink dark:text-paper mb-1">{o.address}{o.landmark && ` (${o.landmark})`}, {o.city}</div>
                <div className="text-xs text-slate dark:text-slate-light mb-2">
                  ₦{o.gas_cost.toLocaleString()} gas cost (reimbursed in full) + ₦{o.transport_fee.toLocaleString()} transport (you keep 80%)
                  {o.distance_km != null && ` · ~${o.distance_km}km`}
                </div>
                {o.note && <div className="text-xs text-slate dark:text-slate-light mb-3">Note: {o.note}</div>}
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
          <EmptyState icon={Flame} title="No gas jobs yet" description="Accepted jobs will show up here." />
        ) : (
          <div className="space-y-4">
            {assigned.map((o) => (
              <div key={o.id} className="border border-slate-200 dark:border-line rounded-2xl p-5 bg-white dark:bg-ink-soft">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="font-mono text-xs text-slate dark:text-slate-light mb-1">{o.tracking_code}</div>
                    <div className="font-display font-semibold text-ink dark:text-paper">{o.cylinder_size_kg}kg refill · ₦{o.price.toLocaleString()}</div>
                  </div>
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${o.status === "cancelled" ? "bg-slate-100 text-slate-600" : "bg-route/20 text-route-dark"}`}>
                    {STAGE_LABELS[o.status] || o.status}
                  </span>
                </div>
                <div className="text-sm text-ink dark:text-paper mb-1">{o.address}{o.landmark && ` (${o.landmark})`}</div>
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
                    <ChatPanel token={token} tripType="gas" tripId={o.id} myRole="agent" otherPartyName={o.customer_name} />
                  </div>
                )}

                {ACTIVE_STATUSES.includes(o.status) && (
                  <div className="mb-3">
                    <SOSButton token={token} tripType="gas" tripId={o.id} />
                  </div>
                )}

                {o.status === "filling" && (
                  <div className="mb-3 border border-slate-200 dark:border-line rounded-lg p-3">
                    <div className="text-xs font-semibold text-ink dark:text-paper mb-2">Proof of fill (required to complete)</div>
                    {photoDrafts[o.id] ? (
                      <div className="flex items-center gap-3">
                        <img src={photoDrafts[o.id]} alt="Proof preview" className="w-16 h-16 rounded-lg object-cover border border-slate-200 dark:border-line" />
                        <label className="text-xs font-semibold text-route-dark hover:underline cursor-pointer">
                          Retake
                          <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => handlePhotoChange(o.id, e.target.files[0])} />
                        </label>
                      </div>
                    ) : (
                      <label className="flex items-center gap-2 text-sm text-slate dark:text-slate-light border border-dashed border-slate-300 dark:border-line rounded-lg px-3 py-2.5 cursor-pointer hover:border-slate-400">
                        <Camera className="w-4 h-4 shrink-0" />
                        Take a photo
                        <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => handlePhotoChange(o.id, e.target.files[0])} />
                      </label>
                    )}
                  </div>
                )}

                {NEXT_ACTION_LABEL[o.status] && (
                  <div className="flex gap-2">
                    <button
                      disabled={busyId === o.id}
                      onClick={() => handleAdvance(o)}
                      className="bg-route hover:bg-route-dark text-ink font-semibold rounded-lg px-4 py-2 text-sm transition-colors disabled:opacity-60"
                    >
                      {busyId === o.id ? "Updating…" : NEXT_ACTION_LABEL[o.status]}
                    </button>
                    {o.status === "accepted" && (
                      <button
                        disabled={busyId === o.id}
                        onClick={() => handleAgentCancel(o.id)}
                        className="text-sm text-red-600 hover:underline"
                      >
                        Can't do this job
                      </button>
                    )}
                  </div>
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
