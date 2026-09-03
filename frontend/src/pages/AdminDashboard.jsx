import { useEffect, useState, useCallback } from "react";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";
import StatusBadge from "../components/StatusBadge";
import { Users, UserCheck, Package, Car, Lock, Landmark, AlertTriangle, Store, MapPin, Compass, Shirt } from "lucide-react";
import { SkeletonStatGrid, SkeletonTable } from "../components/Skeleton";
import EmptyState from "../components/EmptyState";
import CountUp from "../components/CountUp";
import CommandPalette from "../components/CommandPalette";
import PinMap from "../components/PinMap";
import { Search } from "lucide-react";

const SIDEBAR_ITEMS = [
  { key: "agents", label: "Agents", icon: UserCheck },
  { key: "customers", label: "Customers", icon: Users },
  { key: "deliveries", label: "Deliveries", icon: Package },
  { key: "rides", label: "Rides", icon: Car },
  { key: "lockers", label: "Lockers", icon: Lock },
  { key: "landmarks", label: "Landmarks", icon: MapPin },
  { key: "areas", label: "Areas", icon: Compass },
  { key: "uniforms", label: "Uniforms", icon: Shirt },
  { key: "withdrawals", label: "Withdrawals", icon: Landmark },
  { key: "outlets", label: "Outlets", icon: Store },
  { key: "sos", label: "SOS Alerts", icon: AlertTriangle },
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
  const [paletteOpen, setPaletteOpen] = useState(false);

  // Cmd+K on Mac, Ctrl+K everywhere else — the near-universal shortcut for
  // "open quick search" (Linear, Notion, Vercel, GitHub all use the same
  // one), registered globally so it works no matter what's focused, not
  // just while a search box happens to already be focused.
  useEffect(() => {
    function handleKeyDown(e) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((open) => !open);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  function handlePaletteSelect(item) {
    setTab(item.tabKey);
  }
  const [stats, setStats] = useState(null);
  const [agents, setAgents] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [deliveries, setDeliveries] = useState([]);
  const [rides, setRides] = useState([]);
  const [lockers, setLockers] = useState([]);
  const [withdrawals, setWithdrawals] = useState([]);
  const [outlets, setOutlets] = useState([]);
  const [sosAlerts, setSosAlerts] = useState([]);
  const [institutions, setInstitutions] = useState([]);
  const [busyId, setBusyId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [rejectingId, setRejectingId] = useState(null);
  const [rejectReason, setRejectReason] = useState("");
  const [showLockerForm, setShowLockerForm] = useState(false);
  const [lockerForm, setLockerForm] = useState({
    name: "", city: "Lagos", address: "", institution_id: "", total_slots: 20,
  });
  const [lockerFormError, setLockerFormError] = useState("");
  const [lockerSubmitting, setLockerSubmitting] = useState(false);
  const [landmarks, setLandmarks] = useState([]);
  const [showLandmarkForm, setShowLandmarkForm] = useState(false);
  const [landmarkForm, setLandmarkForm] = useState({
    institution_id: "", name: "", zone: "", address: "", city: "Lagos", coords: null,
  });
  const [landmarkFormError, setLandmarkFormError] = useState("");
  const [landmarkSubmitting, setLandmarkSubmitting] = useState(false);
  const [gazetteerPoints, setGazetteerPoints] = useState([]);
  const [gazetteerQueue, setGazetteerQueue] = useState([]);
  const [gazetteerForm, setGazetteerForm] = useState({
    name: "", type: "area", city: "Ota", address: "", coords: null,
  });
  const [gazetteerFormError, setGazetteerFormError] = useState("");
  const [gazetteerSubmitting, setGazetteerSubmitting] = useState(false);
  const [uniformOrders, setUniformOrders] = useState([]);
  const [uniformBusyId, setUniformBusyId] = useState(null);

  const loadAll = useCallback(async () => {
    try {
      const [s, a, c, d, r, l, i, w, sos, o, lm, gp, gq, uo] = await Promise.all([
        api.adminStats(token), api.adminAgents(token), api.adminCustomers(token), api.adminDeliveries(token), api.adminRides(token),
        api.adminLockers(token), api.listInstitutions(token), api.adminPendingWithdrawals(token), api.adminActiveSOS(token), api.adminPendingOutlets(token),
        api.adminListLandmarks(token), api.adminGazetteerPoints(token), api.adminGazetteerQueue(token), api.adminUniformOrders(token),
      ]);
      setStats(s); setAgents(a); setCustomers(c); setDeliveries(d); setRides(r); setLockers(l); setInstitutions(i); setWithdrawals(w); setSosAlerts(sos); setOutlets(o); setLandmarks(lm); setGazetteerPoints(gp); setGazetteerQueue(gq); setUniformOrders(uo);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { loadAll(); }, [loadAll]);

  async function handleAdvanceUniform(id, status) {
    setUniformBusyId(id);
    try {
      await api.adminAdvanceUniformStatus(token, id, status);
      await loadAll();
    } catch (err) {
      alert(err.message);
    } finally {
      setUniformBusyId(null);
    }
  }

  // Runs independently of loadAll and much faster — an active SOS alert
  // needs to surface within seconds, not whenever the admin happens to
  // refresh or switch tabs. Keeps running no matter which tab is open, so
  // the banner below can appear even from "Agents" or "Deliveries".
  useEffect(() => {
    const interval = setInterval(() => {
      api.adminActiveSOS(token).then(setSosAlerts).catch(() => {});
    }, 6000);
    return () => clearInterval(interval);
  }, [token]);

  async function handleResolveSOS(id) {
    setBusyId(id);
    try {
      await api.resolveSOS(token, id);
      setSosAlerts((prev) => prev.filter((a) => a.id !== id));
    } catch (err) {
      alert(err.message);
    } finally {
      setBusyId(null);
    }
  }

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

  async function handleCreateLandmark(e) {
    e.preventDefault();
    if (!landmarkForm.institution_id || !landmarkForm.name.trim() || !landmarkForm.coords) {
      setLandmarkFormError("Pick an institution, give it a name, and set a location on the map below.");
      return;
    }
    setLandmarkSubmitting(true);
    setLandmarkFormError("");
    try {
      await api.adminCreateLandmark(token, {
        institution_id: landmarkForm.institution_id,
        name: landmarkForm.name.trim(),
        zone: landmarkForm.zone.trim() || undefined,
        latitude: landmarkForm.coords.lat,
        longitude: landmarkForm.coords.lng,
      });
      setLandmarkForm({ institution_id: "", name: "", zone: "", address: "", city: "Lagos", coords: null });
      setShowLandmarkForm(false);
      await loadAll();
    } catch (err) {
      setLandmarkFormError(err.message);
    } finally {
      setLandmarkSubmitting(false);
    }
  }

  // Clicking a name in the pinning queue loads it into the (shared) form
  // below with a sensible default search query, so PinMap's "Find address
  // on map" button has something reasonable to try before the admin drags
  // the pin to the exact spot.
  function handlePickQueueItem(name) {
    setGazetteerForm({ name, type: "area", city: "Ota", address: `${name}, Ota, Ogun State, Nigeria`, coords: null });
    setGazetteerFormError("");
  }

  async function handleSaveGazetteerPoint(e) {
    e.preventDefault();
    if (!gazetteerForm.name.trim() || !gazetteerForm.coords) {
      setGazetteerFormError("Give it a name and set a location on the map below.");
      return;
    }
    setGazetteerSubmitting(true);
    setGazetteerFormError("");
    try {
      await api.adminCreateGazetteerPoint(token, {
        name: gazetteerForm.name.trim(),
        type: gazetteerForm.type,
        city: gazetteerForm.city.trim() || "Ota",
        latitude: gazetteerForm.coords.lat,
        longitude: gazetteerForm.coords.lng,
      });
      setGazetteerForm({ name: "", type: "area", city: "Ota", address: "", coords: null });
      await loadAll();
    } catch (err) {
      setGazetteerFormError(err.message);
    } finally {
      setGazetteerSubmitting(false);
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

  async function handleApproveWithdrawal(id) {
    setBusyId(id);
    try {
      await api.approveWithdrawal(token, id);
      await loadAll();
    } catch (err) {
      alert(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function handleRejectWithdrawal(id) {
    setBusyId(id);
    try {
      await api.rejectWithdrawal(token, id, rejectReason.trim() || undefined);
      setRejectingId(null);
      setRejectReason("");
      await loadAll();
    } catch (err) {
      alert(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function handleApproveOutlet(id) {
    setBusyId(id);
    try {
      await api.approveOutlet(token, id);
      await loadAll();
    } catch (err) {
      alert(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function handleRejectOutlet(id) {
    if (!confirm("Reject this outlet's application? They'll stay unable to receive orders.")) return;
    setBusyId(id);
    try {
      await api.rejectOutlet(token, id);
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
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        agents={agents}
        customers={customers}
        deliveries={deliveries}
        rides={rides}
        onSelect={handlePaletteSelect}
      />
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
        <div className="px-3 pb-3 hidden md:block">
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="w-full flex items-center gap-2 text-left px-3 py-2 rounded-lg text-sm text-slate-light bg-white/5 hover:bg-white/10 transition-colors"
          >
            <Search className="w-4 h-4 shrink-0" />
            <span className="flex-1">Search…</span>
            <kbd className="text-[10px] font-mono border border-white/15 rounded px-1.5 py-0.5">⌘K</kbd>
          </button>
        </div>
        <nav className="flex md:flex-col overflow-x-auto md:overflow-visible px-3 md:px-3 py-3 md:py-0 gap-1">
          {SIDEBAR_ITEMS.map(({ key, label, icon: Icon }) => {
            const active = tab === key;
            const count = { agents, customers, deliveries, rides, lockers, landmarks, areas: gazetteerQueue, uniforms: uniformOrders.filter((o) => o.status === "pending"), withdrawals, outlets, sos: sosAlerts }[key].length;
            const isSosWithAlerts = key === "sos" && count > 0;
            return (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`flex items-center gap-2.5 shrink-0 md:w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? isSosWithAlerts ? "bg-red-600 text-white" : "bg-route text-ink dark:text-paper"
                    : isSosWithAlerts ? "text-red-300 bg-red-950/40 hover:bg-red-950/60 animate-pulse" : "text-slate-light hover:bg-white/5 hover:text-paper"
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="flex-1">{label}</span>
                <span className={`font-mono text-xs ${active ? "text-ink/70" : isSosWithAlerts ? "text-red-300" : "text-slate-light"}`}>{count}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      <main className="flex-1 min-w-0 px-5 py-8 md:px-8 md:py-10">
        <div className="flex items-center justify-between mb-2 md:hidden">
          <div className="font-mono text-xs text-slate dark:text-slate-light">ADMIN DASHBOARD</div>
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            aria-label="Search"
            className="flex items-center justify-center w-9 h-9 -mr-1.5 text-slate dark:text-slate-light"
          >
            <Search className="w-4.5 h-4.5" />
          </button>
        </div>
        <h1 className="font-display text-3xl font-semibold mb-8 text-ink dark:text-paper hidden md:block">
          {SIDEBAR_ITEMS.find((i) => i.key === tab)?.label}
        </h1>

        {sosAlerts.length > 0 && tab !== "sos" && (
          <button
            onClick={() => setTab("sos")}
            className="w-full flex items-center gap-2.5 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-xl px-4 py-3 mb-6 transition-colors"
          >
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {sosAlerts.length} active SOS alert{sosAlerts.length > 1 ? "s" : ""} — click to view
          </button>
        )}

        <div className="grid sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-4">
          <Stat label="Customers" value={stats.totalUsers} />
          <Stat label="Agents" value={stats.totalAgents} />
          <Stat label="Pending approvals" value={stats.pendingAgents} highlight={stats.pendingAgents > 0} />
          <Stat label="Active deliveries" value={stats.activeDeliveries} />
          <Stat label="Completed deliveries" value={stats.completedDeliveries} />
          <Stat label="Delivery revenue" value={Math.round(stats.revenue)} prefix="₦" />
        </div>
        <div className="grid sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-10">
          <Stat label="Active rides" value={stats.activeRides} />
          <Stat label="Completed rides" value={stats.completedRides} />
          <Stat label="Ride revenue" value={Math.round(stats.rideRevenue)} prefix="₦" />
          <Stat label="Total platform revenue" value={Math.round(totalPlatformRevenue)} prefix="₦" highlight />
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

      {tab === "landmarks" && (
        <div>
          <div className="mb-4">
            <button
              onClick={() => setShowLandmarkForm((v) => !v)}
              className="text-sm font-semibold bg-ink text-paper rounded-lg px-4 py-2.5"
            >
              {showLandmarkForm ? "Cancel" : "+ Add a landmark"}
            </button>
          </div>

          {showLandmarkForm && (
            <form onSubmit={handleCreateLandmark} className="border border-slate-200 dark:border-line rounded-xl p-5 mb-6 bg-white dark:bg-ink-soft grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-mono text-slate dark:text-slate-light uppercase mb-1.5">Institution</label>
                <select
                  required
                  className="w-full border border-slate-300 dark:border-line rounded-lg px-3 py-2 text-sm"
                  value={landmarkForm.institution_id}
                  onChange={(e) => setLandmarkForm((f) => ({ ...f, institution_id: e.target.value }))}
                >
                  <option value="">Select institution</option>
                  {institutions.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-mono text-slate dark:text-slate-light uppercase mb-1.5">Name</label>
                <input
                  required
                  className="w-full border border-slate-300 dark:border-line rounded-lg px-3 py-2 text-sm"
                  placeholder="Behind Faculty of Engineering"
                  value={landmarkForm.name}
                  onChange={(e) => setLandmarkForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-xs font-mono text-slate dark:text-slate-light uppercase mb-1.5">Zone (optional)</label>
                <input
                  className="w-full border border-slate-300 dark:border-line rounded-lg px-3 py-2 text-sm"
                  placeholder="North campus"
                  value={landmarkForm.zone}
                  onChange={(e) => setLandmarkForm((f) => ({ ...f, zone: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-xs font-mono text-slate dark:text-slate-light uppercase mb-1.5">City (used for address search)</label>
                <input
                  className="w-full border border-slate-300 dark:border-line rounded-lg px-3 py-2 text-sm"
                  value={landmarkForm.city}
                  onChange={(e) => setLandmarkForm((f) => ({ ...f, city: e.target.value }))}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-mono text-slate dark:text-slate-light uppercase mb-1.5">Address to search (optional — or just click/drag the pin below)</label>
                <input
                  className="w-full border border-slate-300 dark:border-line rounded-lg px-3 py-2 text-sm"
                  placeholder="e.g. Covenant University Main Gate"
                  value={landmarkForm.address}
                  onChange={(e) => setLandmarkForm((f) => ({ ...f, address: e.target.value }))}
                />
              </div>
              <div className="sm:col-span-2">
                <PinMap
                  token={token}
                  address={landmarkForm.address}
                  city={landmarkForm.city}
                  coords={landmarkForm.coords}
                  onCoordsChange={(coords) => setLandmarkForm((f) => ({ ...f, coords }))}
                  suggestOpen
                />
              </div>
              {landmarkFormError && <p className="sm:col-span-2 text-sm text-red-600">{landmarkFormError}</p>}
              <div className="sm:col-span-2">
                <button
                  disabled={landmarkSubmitting}
                  className="text-sm font-semibold bg-route hover:bg-route-dark text-ink dark:text-paper rounded-lg px-4 py-2.5 disabled:opacity-60"
                >
                  {landmarkSubmitting ? "Saving…" : "Save landmark"}
                </button>
              </div>
            </form>
          )}

          <div className="overflow-x-auto border border-slate-200 dark:border-line rounded-xl">
            <table className="w-full text-sm">
              <thead className="bg-paper dark:bg-white/5 text-left text-xs text-slate dark:text-slate-light uppercase font-mono">
                <tr>
                  <th className="px-4 py-3">Landmark</th>
                  <th className="px-4 py-3">Institution</th>
                  <th className="px-4 py-3">Zone</th>
                  <th className="px-4 py-3">Coordinates</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {landmarks.map((l) => (
                  <tr key={l.id} className="border-t border-slate-100 dark:border-line">
                    <td className="px-4 py-3 font-medium">{l.name}</td>
                    <td className="px-4 py-3">{l.institution_name}</td>
                    <td className="px-4 py-3">{l.zone || <span className="text-slate dark:text-slate-light">—</span>}</td>
                    <td className="px-4 py-3 font-mono text-xs">
                      {l.latitude != null ? `${Number(l.latitude).toFixed(5)}, ${Number(l.longitude).toFixed(5)}` : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${l.is_verified ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate dark:text-slate-light-600"}`}>
                        {l.is_verified ? "Verified" : "Unverified"}
                      </span>
                    </td>
                  </tr>
                ))}
                {landmarks.length === 0 && (
                  <tr><td colSpan={5}><EmptyState icon={MapPin} title="No landmarks yet" description="Add one above, or wait for crowd-sourced submissions to get confirmed." /></td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {tab === "areas" && (
        <div>
          <p className="text-sm text-slate dark:text-slate-light mb-6 max-w-2xl">
            Mapbox is unreliable across several Ogun State towns — pin them here once and every future
            ride, delivery, food, and gas booking in that area will use this coordinate instead of a live
            geocode. Pick a name from the queue below, or add a new one that isn't on the list yet
            (e.g. Sango, Owode, Ketu Adie Owe).
          </p>

          {gazetteerQueue.length > 0 && (
            <div className="mb-6">
              <div className="text-xs font-mono text-slate dark:text-slate-light uppercase mb-2">
                Still needs pinning ({gazetteerQueue.length})
              </div>
              <div className="flex flex-wrap gap-2">
                {gazetteerQueue.map((name) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => handlePickQueueItem(name)}
                    className={`text-xs font-medium rounded-full px-3 py-1.5 border transition-colors ${
                      gazetteerForm.name === name
                        ? "bg-route text-ink border-route"
                        : "border-slate-300 dark:border-line text-ink dark:text-paper hover:bg-paper dark:hover:bg-white/5"
                    }`}
                  >
                    {name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <form onSubmit={handleSaveGazetteerPoint} className="border border-slate-200 dark:border-line rounded-xl p-5 mb-6 bg-white dark:bg-ink-soft grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-mono text-slate dark:text-slate-light uppercase mb-1.5">Name</label>
              <input
                required
                className="w-full border border-slate-300 dark:border-line rounded-lg px-3 py-2 text-sm"
                placeholder="Agbara"
                value={gazetteerForm.name}
                onChange={(e) => setGazetteerForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-xs font-mono text-slate dark:text-slate-light uppercase mb-1.5">Type</label>
              <select
                className="w-full border border-slate-300 dark:border-line rounded-lg px-3 py-2 text-sm"
                value={gazetteerForm.type}
                onChange={(e) => setGazetteerForm((f) => ({ ...f, type: e.target.value }))}
              >
                <option value="area">Area / town</option>
                <option value="road">Road</option>
                <option value="landmark">Landmark</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-mono text-slate dark:text-slate-light uppercase mb-1.5">City / town</label>
              <input
                className="w-full border border-slate-300 dark:border-line rounded-lg px-3 py-2 text-sm"
                value={gazetteerForm.city}
                onChange={(e) => setGazetteerForm((f) => ({ ...f, city: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-xs font-mono text-slate dark:text-slate-light uppercase mb-1.5">Address to search (optional — or just pin it below)</label>
              <input
                className="w-full border border-slate-300 dark:border-line rounded-lg px-3 py-2 text-sm"
                placeholder="e.g. Agbara, Ota, Ogun State, Nigeria"
                value={gazetteerForm.address}
                onChange={(e) => setGazetteerForm((f) => ({ ...f, address: e.target.value }))}
              />
            </div>
            <div className="sm:col-span-2">
              <PinMap
                token={token}
                address={gazetteerForm.address}
                city={gazetteerForm.city}
                coords={gazetteerForm.coords}
                onCoordsChange={(coords) => setGazetteerForm((f) => ({ ...f, coords }))}
                suggestOpen
              />
            </div>
            {gazetteerFormError && <p className="sm:col-span-2 text-sm text-red-600">{gazetteerFormError}</p>}
            <div className="sm:col-span-2">
              <button
                disabled={gazetteerSubmitting}
                className="text-sm font-semibold bg-route hover:bg-route-dark text-ink dark:text-paper rounded-lg px-4 py-2.5 disabled:opacity-60"
              >
                {gazetteerSubmitting ? "Saving…" : "Save point"}
              </button>
            </div>
          </form>

          <div className="overflow-x-auto border border-slate-200 dark:border-line rounded-xl">
            <table className="w-full text-sm">
              <thead className="bg-paper dark:bg-white/5 text-left text-xs text-slate dark:text-slate-light uppercase font-mono">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">City</th>
                  <th className="px-4 py-3">Coordinates</th>
                  <th className="px-4 py-3">Added</th>
                </tr>
              </thead>
              <tbody>
                {gazetteerPoints.map((g) => (
                  <tr key={g.id} className="border-t border-slate-100 dark:border-line">
                    <td className="px-4 py-3 font-medium">{g.name}</td>
                    <td className="px-4 py-3 capitalize">{g.type}</td>
                    <td className="px-4 py-3">{g.city}</td>
                    <td className="px-4 py-3 font-mono text-xs">
                      {Number(g.latitude).toFixed(5)}, {Number(g.longitude).toFixed(5)}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate dark:text-slate-light">
                      {new Date(g.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
                {gazetteerPoints.length === 0 && (
                  <tr><td colSpan={5}><EmptyState icon={Compass} title="No points pinned yet" description="Pick a name from the queue above, or add a new one manually." /></td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {tab === "uniforms" && (
        <div className="overflow-x-auto border border-slate-200 dark:border-line rounded-xl">
          <table className="w-full text-sm">
            <thead className="bg-paper dark:bg-white/5 text-left text-xs text-slate dark:text-slate-light uppercase font-mono">
              <tr>
                <th className="px-4 py-3">Agent</th>
                <th className="px-4 py-3">City</th>
                <th className="px-4 py-3">Size</th>
                <th className="px-4 py-3">Charged</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {uniformOrders.map((o) => (
                <tr key={o.id} className="border-t border-slate-100 dark:border-line">
                  <td className="px-4 py-3">
                    <div className="font-medium">{o.agent_name}</div>
                    <div className="text-xs text-slate dark:text-slate-light">{o.agent_phone}</div>
                  </td>
                  <td className="px-4 py-3">{o.city}</td>
                  <td className="px-4 py-3">
                    {o.cloth_size || <span className="text-slate dark:text-slate-light">Awaiting agent</span>}
                  </td>
                  <td className="px-4 py-3 font-mono">₦{Number(o.amount).toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                      o.status === "delivered" ? "bg-delivered/15 text-delivered" :
                      o.status === "shipped" ? "bg-amber-100 text-amber-800" :
                      o.status === "pending" ? "bg-route/20 text-route-dark" : "bg-slate-100 text-slate-600"
                    }`}>
                      {o.status === "awaiting_size" ? "Awaiting size" : o.status === "pending" ? "Ready to ship" : o.status === "shipped" ? "Shipped" : "Delivered"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {o.status === "pending" && (
                      <button
                        disabled={uniformBusyId === o.id}
                        onClick={() => handleAdvanceUniform(o.id, "shipped")}
                        className="text-xs font-semibold text-route-dark underline disabled:opacity-50"
                      >
                        Mark shipped
                      </button>
                    )}
                    {o.status === "shipped" && (
                      <button
                        disabled={uniformBusyId === o.id}
                        onClick={() => handleAdvanceUniform(o.id, "delivered")}
                        className="text-xs font-semibold text-route-dark underline disabled:opacity-50"
                      >
                        Mark delivered
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {uniformOrders.length === 0 && (
                <tr><td colSpan={6}><EmptyState icon={Shirt} title="No uniform orders yet" description="Orders are created automatically when an agent is approved." /></td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      {tab === "withdrawals" && (
        <div className="overflow-x-auto border border-slate-200 dark:border-line rounded-xl">
          <table className="w-full text-sm">
            <thead className="bg-paper dark:bg-white/5 text-left text-xs text-slate dark:text-slate-light uppercase font-mono">
              <tr>
                <th className="px-4 py-3">Agent</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Bank</th>
                <th className="px-4 py-3">Requested</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {withdrawals.map((w) => (
                <tr key={w.id} className="border-t border-slate-100 dark:border-line align-top">
                  <td className="px-4 py-3">
                    <div className="font-medium">{w.agent_name}</div>
                    <div className="text-xs text-slate dark:text-slate-light">{w.agent_email} · {w.agent_phone}</div>
                  </td>
                  <td className="px-4 py-3 font-mono font-semibold">₦{w.amount.toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <div>{w.bank_name}</div>
                    <div className="text-xs text-slate dark:text-slate-light font-mono">{w.account_number}</div>
                    <div className="text-xs text-slate dark:text-slate-light">{w.account_name}</div>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate dark:text-slate-light">
                    {new Date(w.requested_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    {rejectingId === w.id ? (
                      <div className="flex flex-col gap-1.5 min-w-[180px]">
                        <input
                          autoFocus
                          value={rejectReason}
                          onChange={(e) => setRejectReason(e.target.value)}
                          placeholder="Reason (optional)"
                          className="text-xs border border-slate-300 dark:border-line rounded-lg px-2.5 py-1.5 bg-white dark:bg-ink outline-none"
                        />
                        <div className="flex gap-2">
                          <ActionBtn busy={busyId === w.id} onClick={() => handleRejectWithdrawal(w.id)} label="Confirm reject" tone="negative" />
                          <button onClick={() => { setRejectingId(null); setRejectReason(""); }} className="text-xs text-slate dark:text-slate-light hover:text-ink dark:hover:text-paper">
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex gap-2 flex-wrap">
                        <ActionBtn busy={busyId === w.id} onClick={() => handleApproveWithdrawal(w.id)} label="Approve & pay" tone="positive" />
                        <ActionBtn busy={busyId === w.id} onClick={() => setRejectingId(w.id)} label="Reject" tone="negative" />
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {withdrawals.length === 0 && (
                <tr><td colSpan={5}><EmptyState icon={Landmark} title="No withdrawals awaiting review" description="Agent withdrawal requests submitted on Mondays and Thursdays will show up here." /></td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      {tab === "outlets" && (
        <div className="space-y-4">
          {outlets.map((o) => (
            <div key={o.user_id} className="border border-slate-200 dark:border-line rounded-2xl p-5 bg-white dark:bg-ink-soft">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex items-start gap-3">
                  {o.logo_photo ? (
                    <img src={o.logo_photo} alt={o.business_name} className="w-12 h-12 rounded-xl object-cover border border-slate-200 dark:border-line shrink-0" />
                  ) : (
                    <div className="w-12 h-12 rounded-xl bg-ink dark:bg-paper text-paper dark:text-ink flex items-center justify-center shrink-0">
                      <Store className="w-5 h-5" />
                    </div>
                  )}
                  <div>
                    <div className="font-display font-semibold text-ink dark:text-paper">{o.business_name}</div>
                    <div className="text-xs text-slate dark:text-slate-light capitalize mb-1">{o.category} · {o.city}</div>
                    <div className="text-sm text-ink dark:text-paper">{o.address}</div>
                    {o.description && <div className="text-xs text-slate dark:text-slate-light mt-1">{o.description}</div>}
                    <div className="text-xs text-slate dark:text-slate-light mt-2">
                      Owner: {o.owner_name} · {o.email} · {o.owner_phone}
                    </div>
                    <div className="text-xs text-slate dark:text-slate-light">
                      Hours: {o.open_time || "—"}–{o.close_time || "—"} · Applied {new Date(o.created_at).toLocaleDateString()}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 flex-wrap shrink-0">
                  <ActionBtn busy={busyId === o.user_id} onClick={() => handleApproveOutlet(o.user_id)} label="Approve" tone="positive" />
                  <ActionBtn busy={busyId === o.user_id} onClick={() => handleRejectOutlet(o.user_id)} label="Reject" tone="negative" />
                </div>
              </div>
            </div>
          ))}
          {outlets.length === 0 && (
            <EmptyState icon={Store} title="No outlets awaiting review" description="New restaurant, eatery, and supermarket applications will show up here." />
          )}
        </div>
      )}
      {tab === "sos" && (
        <div className="space-y-4">
          {sosAlerts.map((a) => {
            const link = a.lat != null && a.lng != null ? `https://www.google.com/maps?q=${a.lat},${a.lng}` : null;
            return (
              <div key={a.id} className="border-2 border-red-300 bg-red-50 dark:bg-red-950/20 dark:border-red-800 rounded-2xl p-5">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                      <span className="font-display font-semibold text-lg text-ink dark:text-paper">{a.full_name}</span>
                      <span className="text-xs font-mono text-slate dark:text-slate-light">({a.role})</span>
                    </div>
                    <div className="text-sm text-slate dark:text-slate-light">
                      {a.trip_type === "ride" ? "Ride" : "Delivery"} #{a.trip_id.slice(0, 8)} · Triggered {new Date(a.created_at).toLocaleString()}
                    </div>
                    <div className="text-sm text-ink dark:text-paper mt-1">Phone: {a.phone}</div>
                    {a.emergency_contact_phone && (
                      <div className="text-sm text-ink dark:text-paper">
                        Emergency contact: {a.emergency_contact_name} · {a.emergency_contact_phone}
                      </div>
                    )}
                    {link ? (
                      <a href={link} target="_blank" rel="noreferrer" className="inline-block text-sm font-semibold text-route-dark hover:underline mt-2">
                        View last known location →
                      </a>
                    ) : (
                      <div className="text-sm text-slate dark:text-slate-light mt-2">Location not available</div>
                    )}
                  </div>
                  <ActionBtn busy={busyId === a.id} onClick={() => handleResolveSOS(a.id)} label="Mark resolved" tone="positive" />
                </div>
              </div>
            );
          })}
          {sosAlerts.length === 0 && (
            <EmptyState icon={AlertTriangle} title="No active SOS alerts" description="Emergency alerts triggered by customers or agents during an active trip will show up here." />
          )}
        </div>
      )}
      </main>
    </div>
  );
}

function Stat({ label, value, prefix, highlight }) {
  return (
    <div className={`border-t-4 rounded-xl p-4 bg-white dark:bg-ink-soft shadow-sm ${highlight ? "border-signal" : "border-brand-blue"}`}>
      <div className="text-xs text-slate dark:text-slate-light mb-1">{label}</div>
      <div className="font-mono font-semibold text-xl text-ink dark:text-paper">
        <CountUp value={value} prefix={prefix} />
      </div>
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
