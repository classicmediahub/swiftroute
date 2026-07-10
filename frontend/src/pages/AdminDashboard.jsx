import { useEffect, useState, useCallback } from "react";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";
import StatusBadge from "../components/StatusBadge";

export default function AdminDashboard() {
  const { token } = useAuth();
  const [tab, setTab] = useState("agents");
  const [stats, setStats] = useState(null);
  const [agents, setAgents] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [deliveries, setDeliveries] = useState([]);
  const [busyId, setBusyId] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadAll = useCallback(async () => {
    try {
      const [s, a, c, d] = await Promise.all([
        api.adminStats(token), api.adminAgents(token), api.adminCustomers(token), api.adminDeliveries(token),
      ]);
      setStats(s); setAgents(a); setCustomers(c); setDeliveries(d);
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

  return (
    <div className="max-w-6xl mx-auto px-5 py-10">
      <div className="font-mono text-xs text-slate mb-2">ADMIN DASHBOARD</div>
      <h1 className="font-display text-3xl font-semibold mb-8">Network overview</h1>

      <div className="grid sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-10">
        <Stat label="Customers" value={stats.totalUsers} />
        <Stat label="Agents" value={stats.totalAgents} />
        <Stat label="Pending approvals" value={stats.pendingAgents} highlight={stats.pendingAgents > 0} />
        <Stat label="Active deliveries" value={stats.activeDeliveries} />
        <Stat label="Completed" value={stats.completedDeliveries} />
        <Stat label="Platform revenue" value={`₦${Math.round(stats.revenue).toLocaleString()}`} />
      </div>

      <div className="flex gap-2 mb-6 border-b border-slate-200">
        <TabButton active={tab === "agents"} onClick={() => setTab("agents")}>Agents ({agents.length})</TabButton>
        <TabButton active={tab === "customers"} onClick={() => setTab("customers")}>Customers ({customers.length})</TabButton>
        <TabButton active={tab === "deliveries"} onClick={() => setTab("deliveries")}>Deliveries ({deliveries.length})</TabButton>
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
                <th className="px-4 py-3">Wallet</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {agents.map((a) => (
                <tr key={a.id} className="border-t border-slate-100">
                  <td className="px-4 py-3">
                    <div className="font-medium">{a.full_name}</div>
                    <div className="text-xs text-slate">{a.email} · {a.phone}</div>
                  </td>
                  <td className="px-4 py-3 capitalize">
                    {a.vehicle_type}
                    {a.vehicle_plate && <div className="text-xs text-slate font-mono">{a.vehicle_plate}</div>}
                  </td>
                  <td className="px-4 py-3">{a.city}</td>
                  <td className="px-4 py-3"><StatusBadge status={a.approval_status} /></td>
                  <td className="px-4 py-3">{a.total_deliveries}</td>
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
                <tr><td colSpan={7} className="px-4 py-8 text-center text-slate">No agents have registered yet.</td></tr>
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
