import { useEffect, useState, useCallback } from "react";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";
import StatusBadge from "../components/StatusBadge";
import { Users, UserCheck, Package, Car, Lock } from "lucide-react";
import { SkeletonStatGrid, SkeletonTable } from "../components/Skeleton";
import EmptyState from "../components/EmptyState";

const SIDEBAR_ITEMS = [
  { key: "agents", label: "Agents", icon: UserCheck },
  { key: "customers", label: "Customers", icon: Users },
  { key: "deliveries", label: "Deliveries", icon: Package },
  { key: "rides", label: "Rides", icon: Car },
  { key: "lockers", label: "Lockers", icon: Lock },
];

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
  cancelled: "bg-slate-100 text-slate dark:text-slate-light-600",
};
function RideStatusBadge({ status }) {
  return (
    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${RIDE_STATUS_COLOR[status] || "bg-slate-100 text-slate dark:text-slate-light-600"}`}>
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
  const [lockers, setLockers] = useState([]);
  const [institutions, setInstitutions] = useState([]);
  const [busyId, setBusyId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showLockerForm, setShowLockerForm] = useState(false);
  const [lockerForm, setLockerForm] = useState({
    name: "", city: "Lagos", address: "", institution_id: "", total_slots: 20,
  });
  const [lockerFormError, setLockerFormError] = useState("");
  const [lockerSubmitting, setLockerSubmitting] = useState(false);

  const loadAll = useCallback(async () => {
    try {
      const [s, a, c, d, r, l, i] = await Promise.all([
        api.adminStats(token), api.adminAgents(token), api.adminCustomers(token), api.adminDeliveries(token), api.adminRides(token),
        api.adminLockers(token), api.listInstitutions(token),
      ]);
      setStats(s); setAgents(a); setCustomers(c); setDeliveries(d); setRides(r); setLockers(l); setInstitutions(i);
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

  async function handleCreateLocker(e) {
    e.preventDefault();
    if (!lockerForm.name.trim() || !lockerForm.city.trim()) return;
    setLockerSubmitting(true);
    setLockerFormError("");
    try {
      await api.createLocker(token, {
        name: lockerForm.name.trim(),
        city: lockerForm.city.trim(),
        address: lockerForm.address.trim() || undefined,
        institution_id: lockerForm.institution_id || undefined,
        total_slots: Number(lockerForm.total_slots) || 20,
      });
      setLockerForm({ name: "", city: "Lagos", address: "", institution_id: "", total_slots: 20 });
      setShowLockerForm(false);
      await loadAll();
    } catch (err) {
      setLockerFormError(err.message);
    } finally {
      setLockerSubmitting(false);
    }
  }

  async function toggleLockerStatus(id, current) {
    setBusyId(id);
    try {
      await api.setLockerStatus(token, id, !current);
      await loadAll();
    } catch (err) {
      alert(err.message);
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col md:flex-row min-h-screen">
        <aside className="md:w-56 md:shrink-0 bg-ink text-paper">
          <div className="px-5 py-6 hidden md:block">
            <div className="font-mono text-xs text-slate-light">ADMIN</div>
            <div className="font-display text-lg font-semibold">Network overview</div>
          </div>
        </aside>
        <main className="flex-1 min-w-0 px-5 py-8 md:px-8 md:py-10">
          <SkeletonStatGrid count={6} />
        </main>
      </div>
    );
  }

  const totalPlatformRevenue = stats.revenue + stats.rideRevenue;

  return (
    <div className="flex flex-col md:flex-row min-h-screen">
      {/* SIDEBAR — dark wine chrome regardless of site theme, same
          "always-dark" treatment as the Navbar and Footer, so all three
          brand-chrome surfaces read as one consistent dark band rather
          than the sidebar looking like a mistake in light mode. Collapses
          to a horizontal scrollable bar on mobile instead of disappearing
          — a real off-canvas drawer felt like more mechanism than this
          admin-only screen needs. */}
      <aside className="md:w-56 md:shrink-0 bg-ink text-paper">
        <div className="px-5 py-6 hidden md:block">
          <div className="font-mono text-xs text-slate-light">ADMIN</div>
          <div className="font-display text-lg font-semibold">Network overview</div>
        </div>
        <nav className="flex md:flex-col overflow-x-auto md:overflow-visible px-3 md:px-3 py-3 md:py-0 gap-1">
          {SIDEBAR_ITEMS.map(({ key, label, icon: Icon }) => {
            const active = tab === key;
            const count = { agents, customers, deliveries, rides, lockers }[key].length;
            return (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`flex items-center gap-2.5 shrink-0 md:w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  active ? "bg-route text-ink dark:text-paper" : "text-slate-light hover:bg-white/5 hover:text-paper"
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="flex-1">{label}</span>
                <span className={`font-mono text-xs ${active ? "text-ink/70" : "text-slate-light"}`}>{count}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      <main className="flex-1 min-w-0 px-5 py-8 md:px-8 md:py-10">
        <div className="font-mono text-xs text-slate dark:text-slate-light mb-2 md:hidden">ADMIN DASHBOARD</div>
        <h1 className="font-display text-3xl font-semibold mb-8 text-ink dark:text-paper hidden md:block">
          {SIDEBAR_ITEMS.find((i) => i.key === tab)?.label}
        </h1>

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

      {tab === "agents" && (
        <div className="overflow-x-auto border border-slate-200 dark:border-line rounded-xl">
          <table className="w-full text-sm">
            <thead className="bg-paper dark:bg-white/5 text-left text-xs text-slate dark:text-slate-light uppercase font-mono">
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
                <tr key={a.id} className="border-t border-slate-100 dark:border-line">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {a.profile_photo ? (
                        <img src={a.profile_photo} alt={a.full_name} className="w-10 h-10 rounded-full object-cover border border-slate-200 dark:border-line shrink-0" />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-paper dark:bg-white/5 border border-slate-200 dark:border-line shrink-0" />
                      )}
                      <div>
                        <div className="font-medium">{a.full_name}</div>
                        <div className="text-xs text-slate dark:text-slate-light">{a.email} · {a.phone}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 capitalize">
                    {a.vehicle_type}
                    {a.vehicle_plate && <div className="text-xs text-slate dark:text-slate-light font-mono">{a.vehicle_plate}</div>}
                  </td>
                  <td className="px-4 py-3">{a.city}</td>
                  <td className="px-4 py-3"><StatusBadge status={a.approval_status} /></td>
                  <td className="px-4 py-3">{a.total_deliveries}</td>
                  <td className="px-4 py-3">{a.vehicle_type === "cab" ? a.total_rides : <span className="text-slate dark:text-slate-light">—</span>}</td>
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
                <tr><td colSpan={8}><EmptyState icon={UserCheck} title="No agents have registered yet." description="Once agents sign up, they'll show up here for approval." /></td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === "customers" && (
        <div className="overflow-x-auto border border-slate-200 dark:border-line rounded-xl">
          <table className="w-full text-sm">
            <thead className="bg-paper dark:bg-white/5 text-left text-xs text-slate dark:text-slate-light uppercase font-mono">
              <tr>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Joined</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.id} className="border-t border-slate-100 dark:border-line">
                  <td className="px-4 py-3">
                    <div className="font-medium">{c.full_name}</div>
                    <div className="text-xs text-slate dark:text-slate-light">{c.email} · {c.phone}</div>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate dark:text-slate-light font-mono">{c.created_at}</td>
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
                <tr><td colSpan={4}><EmptyState icon={Users} title="No customers yet." description="Registered customers will appear here." /></td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === "deliveries" && (
        <div className="overflow-x-auto border border-slate-200 dark:border-line rounded-xl">
          <table className="w-full text-sm">
            <thead className="bg-paper dark:bg-white/5 text-left text-xs text-slate dark:text-slate-light uppercase font-mono">
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
                <tr key={d.id} className="border-t border-slate-100 dark:border-line">
                  <td className="px-4 py-3 font-mono text-xs">{d.tracking_code}</td>
                  <td className="px-4 py-3">{d.pickup_city} → {d.dropoff_city}</td>
                  <td className="px-4 py-3">{d.customer_name}</td>
                  <td className="px-4 py-3">{d.agent_name || <span className="text-slate dark:text-slate-light">Unassigned</span>}</td>
                  <td className="px-4 py-3 font-mono">₦{d.price.toLocaleString()}</td>
                  <td className="px-4 py-3"><StatusBadge status={d.status} /></td>
                </tr>
              ))}
              {deliveries.length === 0 && (
                <tr><td colSpan={6}><EmptyState icon={Package} title="No deliveries yet." description="Deliveries booked on the platform will show up here." /></td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === "rides" && (
        <div className="overflow-x-auto border border-slate-200 dark:border-line rounded-xl">
          <table className="w-full text-sm">
            <thead className="bg-paper dark:bg-white/5 text-left text-xs text-slate dark:text-slate-light uppercase font-mono">
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
                <tr key={r.id} className="border-t border-slate-100 dark:border-line">
                  <td className="px-4 py-3">
                    <div className="max-w-xs truncate">{r.pickup_address} → {r.dropoff_address}</div>
                    {r.distance_km && <div className="text-xs text-slate dark:text-slate-light">{r.distance_km} km</div>}
                  </td>
                  <td className="px-4 py-3">{r.customer_name}</td>
                  <td className="px-4 py-3">{r.agent_name || <span className="text-slate dark:text-slate-light">Unassigned</span>}</td>
                  <td className="px-4 py-3 font-mono">₦{r.price.toLocaleString()}</td>
                  <td className="px-4 py-3 capitalize">
                    <span className={r.payment_status === "paid" ? "text-emerald-700" : "text-amber-700"}>
                      {r.payment_status}
                    </span>
                  </td>
                  <td className="px-4 py-3">{r.review_rating ? `${r.review_rating} ★` : <span className="text-slate dark:text-slate-light">—</span>}</td>
                  <td className="px-4 py-3"><RideStatusBadge status={r.status} /></td>
                </tr>
              ))}
              {rides.length === 0 && (
                <tr><td colSpan={7}><EmptyState icon={Car} title="No rides yet." description="Rides booked on the platform will show up here." /></td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === "lockers" && (
        <div>
          <div className="mb-4">
            <button
              onClick={() => setShowLockerForm((v) => !v)}
              className="text-sm font-semibold bg-ink text-paper rounded-lg px-4 py-2.5"
            >
              {showLockerForm ? "Cancel" : "+ Add a locker"}
            </button>
          </div>

          {showLockerForm && (
            <form onSubmit={handleCreateLocker} className="border border-slate-200 dark:border-line rounded-xl p-5 mb-6 bg-white dark:bg-ink-soft grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-mono text-slate dark:text-slate-light uppercase mb-1.5">Name</label>
                <input
                  required
                  className="w-full border border-slate-300 dark:border-line rounded-lg px-3 py-2 text-sm"
                  placeholder="Covenant University Main Gate Locker"
                  value={lockerForm.name}
                  onChange={(e) => setLockerForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-xs font-mono text-slate dark:text-slate-light uppercase mb-1.5">Institution (optional — leave blank for a standalone city locker)</label>
                <select
                  className="w-full border border-slate-300 dark:border-line rounded-lg px-3 py-2 text-sm"
                  value={lockerForm.institution_id}
                  onChange={(e) => setLockerForm((f) => ({ ...f, institution_id: e.target.value }))}
                >
                  <option value="">Standalone (not tied to an institution)</option>
                  {institutions.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-mono text-slate dark:text-slate-light uppercase mb-1.5">City</label>
                <input
                  required
                  className="w-full border border-slate-300 dark:border-line rounded-lg px-3 py-2 text-sm"
                  placeholder="Lagos"
                  value={lockerForm.city}
                  onChange={(e) => setLockerForm((f) => ({ ...f, city: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-xs font-mono text-slate dark:text-slate-light uppercase mb-1.5">Total slots</label>
                <input
                  type="number"
                  min={1}
                  className="w-full border border-slate-300 dark:border-line rounded-lg px-3 py-2 text-sm"
                  value={lockerForm.total_slots}
                  onChange={(e) => setLockerForm((f) => ({ ...f, total_slots: e.target.value }))}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-mono text-slate dark:text-slate-light uppercase mb-1.5">Address / description (optional)</label>
                <input
                  className="w-full border border-slate-300 dark:border-line rounded-lg px-3 py-2 text-sm"
                  placeholder="Beside the security post, Main Gate"
                  value={lockerForm.address}
                  onChange={(e) => setLockerForm((f) => ({ ...f, address: e.target.value }))}
                />
              </div>
              {lockerFormError && <p className="sm:col-span-2 text-sm text-red-600">{lockerFormError}</p>}
              <div className="sm:col-span-2">
                <button
                  disabled={lockerSubmitting}
                  className="text-sm font-semibold bg-route hover:bg-route-dark text-ink dark:text-paper rounded-lg px-4 py-2.5 disabled:opacity-60"
                >
                  {lockerSubmitting ? "Creating…" : "Create locker"}
                </button>
              </div>
            </form>
          )}

          <div className="overflow-x-auto border border-slate-200 dark:border-line rounded-xl">
            <table className="w-full text-sm">
              <thead className="bg-paper dark:bg-white/5 text-left text-xs text-slate dark:text-slate-light uppercase font-mono">
                <tr>
                  <th className="px-4 py-3">Locker</th>
                  <th className="px-4 py-3">Location</th>
                  <th className="px-4 py-3">Slots</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {lockers.map((l) => (
                  <tr key={l.id} className="border-t border-slate-100 dark:border-line">
                    <td className="px-4 py-3">
                      <div className="font-medium">{l.name}</div>
                      {l.address && <div className="text-xs text-slate dark:text-slate-light">{l.address}</div>}
                    </td>
                    <td className="px-4 py-3">
                      {l.institution_name ? (
                        <span>{l.institution_name}</span>
                      ) : (
                        <span>{l.city} <span className="text-slate dark:text-slate-light text-xs">(standalone)</span></span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono">{l.total_slots}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${l.is_active ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate dark:text-slate-light-600"}`}>
                        {l.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <ActionBtn
                        busy={busyId === l.id}
                        onClick={() => toggleLockerStatus(l.id, l.is_active)}
                        label={l.is_active ? "Deactivate" : "Activate"}
                        tone={l.is_active ? "negative" : "positive"}
                      />
                    </td>
                  </tr>
                ))}
                {lockers.length === 0 && (
                  <tr><td colSpan={5}><EmptyState icon={Lock} title="No lockers yet" description="Add your first locker above to get started." /></td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
      </main>
    </div>
  );
}

function Stat({ label, value, highlight }) {
  return (
    <div className={`border-t-4 rounded-xl p-4 bg-white dark:bg-ink-soft shadow-sm ${highlight ? "border-signal" : "border-brand-blue"}`}>
      <div className="text-xs text-slate dark:text-slate-light mb-1">{label}</div>
      <div className="font-mono font-semibold text-xl text-ink dark:text-paper">{value}</div>
    </div>
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
