import { useEffect, useState, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { api } from "../api";
import { SkeletonCardList } from "../components/Skeleton";
import EmptyState from "../components/EmptyState";
import { Store, Power, UtensilsCrossed, Package, Plus, Trash2, Camera } from "lucide-react";

const ORDER_STATUS_LABELS = {
  placed: "New order",
  preparing: "Preparing",
  ready_for_pickup: "Waiting for rider",
  picked_up: "Picked up",
  delivered: "Delivered",
  cancelled: "Cancelled",
  rejected: "Rejected",
};

const POLL_INTERVAL_MS = 10000;

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function OutletDashboard() {
  const { token, outletProfile, refresh } = useAuth();
  const [tab, setTab] = useState("orders");

  const [incoming, setIncoming] = useState([]);
  const [history, setHistory] = useState([]);
  const [menu, setMenu] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [toggling, setToggling] = useState(false);

  const isApproved = outletProfile?.approval_status === "approved";

  const load = useCallback(async () => {
    try {
      const [i, m] = await Promise.all([api.incomingFoodOrders(token), api.getMyMenu(token)]);
      setIncoming(i);
      setMenu(m);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const interval = setInterval(load, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [load]);

  useEffect(() => {
    if (tab === "history") api.foodOrderHistory(token).then(setHistory).catch(() => {});
  }, [tab, token]);

  async function handleToggleOpen() {
    setToggling(true);
    try {
      await api.toggleOutletOpen(token);
      await refresh();
    } catch (err) {
      alert(err.message);
    } finally {
      setToggling(false);
    }
  }

  async function handleAccept(id) {
    setBusyId(id);
    try { await api.acceptFoodOrder(token, id); await load(); }
    catch (err) { alert(err.message); }
    finally { setBusyId(null); }
  }

  async function handleReject(id) {
    const reason = prompt("Reason for rejecting (optional):") || undefined;
    setBusyId(id);
    try { await api.rejectFoodOrder(token, id, reason); await load(); }
    catch (err) { alert(err.message); }
    finally { setBusyId(null); }
  }

  async function handleMarkReady(id) {
    setBusyId(id);
    try { await api.markFoodOrderReady(token, id); await load(); }
    catch (err) { alert(err.message); }
    finally { setBusyId(null); }
  }

  if (!outletProfile) return <div className="max-w-4xl mx-auto px-5 py-16"><SkeletonCardList count={2} /></div>;

  return (
    <div className="max-w-4xl mx-auto px-5 py-10">
      <div className="flex items-start justify-between mb-8 flex-wrap gap-4">
        <div className="flex items-center gap-3">
          {outletProfile.logo_photo ? (
            <img src={outletProfile.logo_photo} alt={outletProfile.business_name} className="w-14 h-14 rounded-xl object-cover border border-slate-200 dark:border-line" />
          ) : (
            <div className="w-14 h-14 rounded-xl bg-ink dark:bg-paper text-paper dark:text-ink flex items-center justify-center shrink-0">
              <Store className="w-6 h-6" />
            </div>
          )}
          <div>
            <h1 className="font-display text-2xl font-semibold text-ink dark:text-paper">{outletProfile.business_name}</h1>
            <div className="text-xs text-slate dark:text-slate-light capitalize">{outletProfile.category} · {outletProfile.city}</div>
          </div>
        </div>
        {isApproved && (
          <button
            onClick={handleToggleOpen}
            disabled={toggling}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-60 ${
              outletProfile.is_open ? "bg-delivered/15 text-delivered" : "bg-slate-200 dark:bg-white/10 text-slate dark:text-slate-light"
            }`}
          >
            <Power className="w-4 h-4" />
            {outletProfile.is_open ? "Open — tap to close" : "Closed — tap to open"}
          </button>
        )}
      </div>

      {!isApproved && (
        <div className={`border rounded-2xl p-5 mb-8 ${outletProfile.approval_status === "rejected" ? "border-red-200 bg-red-50 dark:bg-red-950/20" : "border-amber-200 bg-amber-50 dark:bg-amber-950/20"}`}>
          <p className="text-sm font-semibold text-ink dark:text-paper mb-1">
            {outletProfile.approval_status === "rejected" ? "Your application was not approved" : "Awaiting approval"}
          </p>
          <p className="text-xs text-slate dark:text-slate-light">
            {outletProfile.approval_status === "rejected"
              ? "Contact support if you think this was a mistake."
              : "You can set up your menu now, but customers won't be able to order until an admin approves your account."}
          </p>
        </div>
      )}

      <div className="grid grid-cols-3 gap-3 mb-8">
        <SummaryCard label="Wallet balance" value={`₦${outletProfile.wallet_balance.toLocaleString()}`} />
        <SummaryCard label="Total orders" value={outletProfile.total_orders} />
        <SummaryCard label="Hours" value={`${outletProfile.open_time || "—"}–${outletProfile.close_time || "—"}`} />
      </div>

      <div className="flex gap-2 mb-6 border-b border-slate-200 dark:border-line">
        <TabButton active={tab === "orders"} onClick={() => setTab("orders")}>Orders ({incoming.length})</TabButton>
        <TabButton active={tab === "menu"} onClick={() => setTab("menu")}>Menu ({menu.length})</TabButton>
        <TabButton active={tab === "history"} onClick={() => setTab("history")}>History</TabButton>
      </div>

      {loading ? (
        <SkeletonCardList count={2} />
      ) : tab === "orders" ? (
        <OrdersTab orders={incoming} busyId={busyId} onAccept={handleAccept} onReject={handleReject} onMarkReady={handleMarkReady} />
      ) : tab === "menu" ? (
        <MenuTab token={token} menu={menu} onChanged={load} />
      ) : (
        <HistoryTab orders={history} />
      )}
    </div>
  );
}

function OrdersTab({ orders, busyId, onAccept, onReject, onMarkReady }) {
  if (orders.length === 0) {
    return <EmptyState icon={Package} title="No orders right now" description="New orders will show up here as customers place them." />;
  }
  return (
    <div className="space-y-4">
      {orders.map((o) => (
        <div key={o.id} className="border border-slate-200 dark:border-line rounded-2xl p-5 bg-white dark:bg-ink-soft">
          <div className="flex items-start justify-between mb-3">
            <div>
              <div className="font-mono text-xs text-slate dark:text-slate-light mb-1">{o.tracking_code}</div>
              <div className="font-display font-semibold text-ink dark:text-paper">{o.customer_name} · {o.customer_phone}</div>
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-route/20 text-route-dark">{ORDER_STATUS_LABELS[o.status]}</span>
          </div>

          <ul className="text-sm text-ink dark:text-paper mb-2 space-y-0.5">
            {o.items.map((item, i) => (
              <li key={i}>{item.quantity}× {item.name} <span className="text-slate dark:text-slate-light font-mono text-xs">₦{(item.price * item.quantity).toLocaleString()}</span></li>
            ))}
          </ul>
          <div className="text-xs text-slate dark:text-slate-light mb-1">Subtotal: ₦{o.subtotal.toLocaleString()} · You receive: ₦{(o.subtotal - o.platform_commission).toLocaleString()}</div>
          <div className="text-xs text-slate dark:text-slate-light mb-3">Deliver to: {o.delivery_address}, {o.city}{o.landmark && ` (${o.landmark})`}</div>
          {o.note && <div className="text-xs text-slate dark:text-slate-light mb-3">Note: {o.note}</div>}

          {o.status === "placed" && (
            <div className="flex gap-2">
              <button disabled={busyId === o.id} onClick={() => onAccept(o.id)} className="bg-route hover:bg-route-dark text-ink font-semibold rounded-lg px-4 py-2 text-sm transition-colors disabled:opacity-60">
                {busyId === o.id ? "…" : "Accept order"}
              </button>
              <button disabled={busyId === o.id} onClick={() => onReject(o.id)} className="text-sm text-red-600 hover:underline">
                Reject
              </button>
            </div>
          )}
          {o.status === "preparing" && (
            <button disabled={busyId === o.id} onClick={() => onMarkReady(o.id)} className="bg-route hover:bg-route-dark text-ink font-semibold rounded-lg px-4 py-2 text-sm transition-colors disabled:opacity-60">
              {busyId === o.id ? "…" : "Mark ready for pickup"}
            </button>
          )}
          {o.status === "ready_for_pickup" && (
            <p className="text-xs text-slate dark:text-slate-light">
              {o.agent_id ? "A rider has been assigned and is on the way." : "Waiting for a rider to accept this job."}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

function HistoryTab({ orders }) {
  if (orders.length === 0) {
    return <EmptyState icon={Package} title="No past orders yet" description="Completed, cancelled, and rejected orders will show up here." />;
  }
  return (
    <div className="space-y-3">
      {orders.map((o) => (
        <div key={o.id} className="border border-slate-200 dark:border-line rounded-xl p-4 bg-white dark:bg-ink-soft flex items-center justify-between">
          <div>
            <div className="font-mono text-xs text-slate dark:text-slate-light mb-0.5">{o.tracking_code}</div>
            <div className="text-sm text-ink dark:text-paper">{o.customer_name} · ₦{o.subtotal.toLocaleString()}</div>
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-light">
            {ORDER_STATUS_LABELS[o.status] || o.status}
          </span>
        </div>
      ))}
    </div>
  );
}

function MenuTab({ token, menu, onChanged }) {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ name: "", description: "", price: "", category: "", photo: null });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);

  function resetForm() {
    setForm({ name: "", description: "", price: "", category: "", photo: null });
    setEditingId(null);
    setShowForm(false);
    setError("");
  }

  function startEdit(item) {
    setForm({ name: item.name, description: item.description || "", price: item.price, category: item.category || "", photo: item.photo });
    setEditingId(item.id);
    setShowForm(true);
  }

  async function handlePhoto(file) {
    if (!file) return;
    const base64 = await fileToBase64(file);
    setForm((f) => ({ ...f, photo: base64 }));
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!form.name.trim() || !Number(form.price)) {
      setError("Name and a valid price are required");
      return;
    }
    setSaving(true);
    setError("");
    try {
      if (editingId) {
        await api.updateMenuItem(token, editingId, form);
      } else {
        await api.addMenuItem(token, form);
      }
      resetForm();
      await onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(id) {
    setBusyId(id);
    try { await api.toggleMenuItem(token, id); await onChanged(); }
    catch (err) { alert(err.message); }
    finally { setBusyId(null); }
  }

  async function handleDelete(id) {
    if (!confirm("Remove this item from your menu?")) return;
    setBusyId(id);
    try { await api.deleteMenuItem(token, id); await onChanged(); }
    catch (err) { alert(err.message); }
    finally { setBusyId(null); }
  }

  return (
    <div>
      {!showForm && (
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 bg-route hover:bg-route-dark text-ink font-semibold rounded-lg px-4 py-2 text-sm transition-colors mb-5"
        >
          <Plus className="w-4 h-4" /> Add menu item
        </button>
      )}

      {showForm && (
        <form onSubmit={handleSave} className="border border-slate-200 dark:border-line rounded-2xl p-5 mb-5 space-y-3 bg-white dark:bg-ink-soft">
          <div className="text-sm font-semibold text-ink dark:text-paper">{editingId ? "Edit item" : "New item"}</div>
          <input
            required placeholder="Item name" value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            className="w-full border border-slate-300 dark:border-line rounded-lg px-3.5 py-2 text-sm bg-white dark:bg-ink outline-none"
          />
          <input
            placeholder="Description (optional)" value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            className="w-full border border-slate-300 dark:border-line rounded-lg px-3.5 py-2 text-sm bg-white dark:bg-ink outline-none"
          />
          <div className="grid grid-cols-2 gap-3">
            <input
              required type="number" min="1" placeholder="Price (₦)" value={form.price}
              onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
              className="w-full border border-slate-300 dark:border-line rounded-lg px-3.5 py-2 text-sm bg-white dark:bg-ink outline-none"
            />
            <input
              placeholder="Category (e.g. Mains)" value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              className="w-full border border-slate-300 dark:border-line rounded-lg px-3.5 py-2 text-sm bg-white dark:bg-ink outline-none"
            />
          </div>
          {form.photo ? (
            <div className="flex items-center gap-3">
              <img src={form.photo} alt="Preview" className="w-14 h-14 rounded-lg object-cover border border-slate-200 dark:border-line" />
              <label className="text-xs font-semibold text-route-dark hover:underline cursor-pointer">
                Change photo
                <input type="file" accept="image/*" className="hidden" onChange={(e) => handlePhoto(e.target.files[0])} />
              </label>
            </div>
          ) : (
            <label className="flex items-center gap-2 text-sm text-slate dark:text-slate-light border border-dashed border-slate-300 dark:border-line rounded-lg px-3 py-2.5 cursor-pointer hover:border-slate-400 w-fit">
              <Camera className="w-4 h-4 shrink-0" /> Add photo (optional)
              <input type="file" accept="image/*" className="hidden" onChange={(e) => handlePhoto(e.target.files[0])} />
            </label>
          )}
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button disabled={saving} className="bg-route hover:bg-route-dark text-ink font-semibold rounded-lg px-4 py-2 text-sm transition-colors disabled:opacity-60">
              {saving ? "Saving…" : editingId ? "Save changes" : "Add item"}
            </button>
            <button type="button" onClick={resetForm} className="text-sm text-slate dark:text-slate-light hover:text-ink dark:hover:text-paper">
              Cancel
            </button>
          </div>
        </form>
      )}

      {menu.length === 0 ? (
        <EmptyState icon={UtensilsCrossed} title="Your menu is empty" description="Add your first item to start receiving orders." />
      ) : (
        <div className="space-y-2">
          {menu.map((item) => (
            <div key={item.id} className="border border-slate-200 dark:border-line rounded-xl p-3.5 bg-white dark:bg-ink-soft flex items-center gap-3">
              {item.photo && <img src={item.photo} alt={item.name} className="w-12 h-12 rounded-lg object-cover border border-slate-200 dark:border-line shrink-0" />}
              <div className="flex-1 min-w-0">
                <div className={`text-sm font-medium truncate ${item.is_available ? "text-ink dark:text-paper" : "text-slate-400 dark:text-slate-600 line-through"}`}>
                  {item.name}
                </div>
                <div className="text-xs text-slate dark:text-slate-light font-mono">₦{item.price.toLocaleString()}{item.category && ` · ${item.category}`}</div>
              </div>
              <button
                onClick={() => handleToggle(item.id)}
                disabled={busyId === item.id}
                className={`text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 transition-colors ${
                  item.is_available ? "bg-delivered/15 text-delivered" : "bg-slate-200 dark:bg-white/10 text-slate-600 dark:text-slate-light"
                }`}
              >
                {item.is_available ? "Available" : "Sold out"}
              </button>
              <button onClick={() => startEdit(item)} className="text-xs font-semibold text-route-dark hover:underline shrink-0">Edit</button>
              <button onClick={() => handleDelete(item.id)} disabled={busyId === item.id} className="text-red-500 hover:text-red-600 shrink-0">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value }) {
  return (
    <div className="border border-slate-200 dark:border-line rounded-xl p-4 bg-white dark:bg-ink-soft">
      <div className="text-xs text-slate dark:text-slate-light mb-1">{label}</div>
      <div className="font-display font-semibold text-ink dark:text-paper">{value}</div>
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
