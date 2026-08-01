import { useEffect, useState, useCallback } from "react";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";
import StatusBadge from "../components/StatusBadge";

// Ride statuses are a different string set than delivery statuses
// (in_progress/completed vs in_transit/delivered) — a small local badge
// here rather than assuming StatusBadge's internals handle arbitrary
// values gracefully, same approach used on the customer/agent ride pages.
const RIDE_STATUS_LABEL = {
  pending: "Finding driver",
  accepted: "Accepted",
  in_progress: "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
};
const RIDE_STATUS_COLOR = {
  pending: "bg-amber-100 text-amber-800",
  accepted: "bg-blue-100 text-blue-800",
  in_progress: "bg-blue-100 text-blue-800",
  completed: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-slate-100 text-slate-600",
};
function RideStatusBadge({ status }) {
  return (
    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${RIDE_STATUS_COLOR[status] || "bg-slate-100 text-slate-600"}`}>
      {RIDE_STATUS_LABEL[status] || status}
    </span>
  );
}

export default function AdminDashboard() {
  const { token } = useAuth();
  const [tab, setTab] = useState("agents");
  const [stats, setStats] = useState(null);
  const [agents, setAgents] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [deliveries, setDeliveries] = useState([]);
  const [rides, setRides] = useState([]);
  const [busyId, setBusyId] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadAll = useCallback(async () => {
    try {
      const [s, a, c, d, r] = await Promise.all([
        api.adminStats(token), api.adminAgents(token), api.adminCustomers(token), api.adminDeliveries(token), api.adminRides(token),
      ]);
      setStats(s); setAgents(a); setCustomers(c); setDeliveries(d); setRides(r);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { loadAll(); }, [loadAll]);

  async function setAgentApproval(id, status) {
    setBusyId(id);
    try {
      await api.setAgentStatus(token, id, status);
      await loadAll();
    } catch (err) {
      alert(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function toggleUserStatus(id, current) {
    setBusyId(id);
    try {
      await api.setUserStatus(token, id, current === "active" ? "suspended" : "active");
      await loadAll();
    } catch (err) {
      alert(err.message);
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <div className="max-w-6xl mx-auto px-5 py-10 text-slate">Loading dashboard…</div>;

  const totalPlatformRevenue = stats.revenue + stats.rideRevenue;

  return (
    <div className="max-w-6xl mx-auto px-5 py-10">
      <div className="font-mono text-xs text-slate mb-2">ADMIN DASHBOARD</div>
      <h1 className="font-display text-3xl font-semibold mb-8">Network overview</h1>

      <div className="grid sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-4">
        <Stat label="Customers" value={stats.totalUsers} />
        <Stat label="Agents" value={stats.totalAgents} />
        <Stat label="Pending approvals" value={stats.pendingAgents} highlight={stats.pendingAgents > 0} />
        <Stat label="Active deliveries" value={stats.activeDeliveries} />
        <Stat label="Completed deliveries" value={stats.completedDeliveries} />
        <Stat label="Delivery revenue" value={`₦${Math.round(stats.revenue).toLocaleString()}`} />
      </div>
      <div className="grid sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-10">
        <Stat label="Active rides" value={stats.activeRides} />
        <Stat label="Completed rides" value={stats.completedRides} />
        <Stat label="Ride revenue" value={`₦${Math.round(stats.rideRevenue).toLocaleString()}`} />
        <Stat label="Total platform revenue" value={`₦${Math.round(totalPlatformRevenue).toLocaleString()}`} highlight />
      </div>

      <div className="flex gap-2 mb-6 border-b border-slate-200 flex-wrap">
        <TabButton active={tab === "agents"} onClick={() => setTab("agents")}>Agents ({agents.length})</TabButton>
        <TabButton active={tab === "customers"} onClick={() => setTab("customers")}>Customers ({customers.length})</TabButton>
        <TabButton active={tab === "deliveries"} onClick={() => setTab("deliveries")}>Deliveries ({deliveries.length})</TabButton>
        <TabButton active={tab === "rides"} onClick={() => setTab("rides")}>Rides ({rides.length})</TabButton>
      </div>

      {tab === "agents" && (
        <div className="overflow-x-auto border border-slate-200 rounded-xl">
          <table className="w-full text-sm">
            <thead className="bg-paper text-left text-xs text-slate uppercase font-mono">
              <tr>
                <th className="px-4 py-3">Agent</th>
                <th className="px-4 py-3">Vehicle</th>
                <th className="px-4 py-3">City</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Deliveries</th>
                <th className="px-4 py-3">Rides</th>
                <th className="px-4 py-3">Wallet</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {agents.map((a) => (
                <tr key={a.id} className="border-t border-slate-100">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {a.profile_photo ? (
                        <img src={a.profile_photo} alt={a.full_name} className="w-10 h-10 rounded-full object-cover border border-slate-200 shrink-0" />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-paper border border-slate-200 shrink-0" />
                      )}
                      <div>
                        <div className="font-medium">{a.full_name}</div>
                        <div className="text-xs text-slate">{a.email} · {a.phone}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 capitalize">
                    {a.vehicle_type}
                    {a.vehicle_plate && <div className="text-xs text-slate font-mono">{a.vehicle_plate}</div>}
                  </td>
                  <td className="px-4 py-3">{a.city}</td>
                  <td className="px-4 py-3"><StatusBadge status={a.approval_status} /></td>
                  <td className="px-4 py-3">{a.total_deliveries}</td>
                  <td className="px-4 py-3">{a.vehicle_type === "cab" ? a.total_rides : <span className="text-slate">—</span>}</td>
                  <td className="px-4 py-3 font-mono">₦{a.wallet_balance.toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2 flex-wrap">
                      {a.approval_status !== "approved" && (
                        <ActionBtn busy={busyId === a.id} onClick={() => setAgentApproval(a.id, "approved")} label="Approve" tone="positive" />
                      )}
                      {a.approval_status !== "rejected" && a.approval_status === "pending" && (
                        <ActionBtn busy={busyId === a.id} onClick={() => setAgentApproval(a.id, "rejected")} label="Reject" tone="negative" />
                      )}
                      {a.approval_status === "approved" && (
                        <ActionBtn busy={busyId === a.id} onClick={() => setAgentApproval(a.id, "suspended")} label="Suspend" tone="negative" />
                      )}
                      {a.approval_status === "suspended" && (
                        <ActionBtn busy={busyId === a.id} onClick={() => setAgentApproval(a.id, "approved")} label="Reinstate" tone="positive" />
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {agents.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-slate">No agents have registered yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === "customers" && (
        <div className="overflow-x-auto border border-slate-200 rounded-xl">
          <table className="w-full text-sm">
            <thead className="bg-paper text-left text-xs text-slate uppercase font-mono">
              <tr>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Joined</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.id} className="border-t border-slate-100">
                  <td className="px-4 py-3">
                    <div className="font-medium">{c.full_name}</div>
                    <div className="text-xs text-slate">{c.email} · {c.phone}</div>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate font-mono">{c.created_at}</td>
                  <td className="px-4 py-3 capitalize">{c.status}</td>
                  <td className="px-4 py-3">
                    <ActionBtn
                      busy={busyId === c.id}
                      onClick={() => toggleUserStatus(c.id, c.status)}
                      label={c.status === "active" ? "Suspend" : "Reactivate"}
                      tone={c.status === "active" ? "negative" : "positive"}
                    />
                  </td>
                </tr>
              ))}
              {customers.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-slate">No customers yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === "deliveries" && (
        <div className="overflow-x-auto border border-slate-200 rounded-xl">
          <table className="w-full text-sm">
            <thead className="bg-paper text-left text-xs text-slate uppercase font-mono">
              <tr>
                <th className="px-4 py-3">Tracking</th>
                <th className="px-4 py-3">Route</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Agent</th>
                <th className="px-4 py-3">Price</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {deliveries.map((d) => (
                <tr key={d.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-mono text-xs">{d.tracking_code}</td>
                  <td className="px-4 py-3">{d.pickup_city} → {d.dropoff_city}</td>
                  <td className="px-4 py-3">{d.customer_name}</td>
                  <td className="px-4 py-3">{d.agent_name || <span className="text-slate">Unassigned</span>}</td>
                  <td className="px-4 py-3 font-mono">₦{d.price.toLocaleString()}</td>
                  <td className="px-4 py-3"><StatusBadge status={d.status} /></td>
                </tr>
              ))}
              {deliveries.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-slate">No deliveries yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === "rides" && (
        <div className="overflow-x-auto border border-slate-200 rounded-xl">
          <table className="w-full text-sm">
            <thead className="bg-paper text-left text-xs text-slate uppercase font-mono">
              <tr>
                <th className="px-4 py-3">Route</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Driver</th>
                <th className="px-4 py-3">Fare</th>
                <th className="px-4 py-3">Payment</th>
                <th className="px-4 py-3">Rating</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {rides.map((r) => (
                <tr key={r.id} className="border-t border-slate-100">
                  <td className="px-4 py-3">
                    <div className="max-w-xs truncate">{r.pickup_address} → {r.dropoff_address}</div>
                    {r.distance_km && <div className="text-xs text-slate">{r.distance_km} km</div>}
                  </td>
                  <td className="px-4 py-3">{r.customer_name}</td>
                  <td className="px-4 py-3">{r.agent_name || <span className="text-slate">Unassigned</span>}</td>
                  <td className="px-4 py-3 font-mono">₦{r.price.toLocaleString()}</td>
                  <td className="px-4 py-3 capitalize">
                    <span className={r.payment_status === "paid" ? "text-emerald-700" : "text-amber-700"}>
                      {r.payment_status}
                    </span>
                  </td>
                  <td className="px-4 py-3">{r.review_rating ? `${r.review_rating} ★` : <span className="text-slate">—</span>}</td>
                  <td className="px-4 py-3"><RideStatusBadge status={r.status} /></td>
                </tr>
              ))}
              {rides.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-slate">No rides yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, highlight }) {
  return (
    <div className={`border rounded-xl p-4 ${highlight ? "border-signal bg-orange-50" : "border-slate-200 bg-white"}`}>
      <div className="text-xs text-slate mb-1">{label}</div>
      <div className="font-mono font-semibold text-xl">{value}</div>
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

function ActionBtn({ onClick, label, tone, busy }) {
  const tones = {
    positive: "bg-emerald-600 hover:bg-emerald-700 text-white",
    negative: "bg-red-600 hover:bg-red-700 text-white",
  };
  return (
    <button disabled={busy} onClick={onClick} className={`text-xs font-semibold rounded-lg px-3 py-1.5 transition-colors disabled:opacity-60 ${tones[tone]}`}>
      {busy ? "…" : label}
    </button>
  );
}
