import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";
import ChatPanel from "../components/ChatPanel";
import SOSButton from "../components/SOSButton";
import { useUnreadMessages } from "../hooks/useUnreadMessages";
import { SkeletonCardList } from "../components/Skeleton";
import EmptyState from "../components/EmptyState";
import { Store, MessageCircle, UtensilsCrossed } from "lucide-react";

const CITIES = ["Lagos", "Ota", "Ogun", "Abuja", "Port Harcourt", "Ibadan", "Kano", "Enugu", "Benin City"];
const CATEGORIES = [
  { value: "", label: "All categories" },
  { value: "restaurant", label: "Restaurants" },
  { value: "eatery", label: "Eateries" },
  { value: "supermarket", label: "Supermarkets" },
  { value: "pharmacy", label: "Pharmacies" },
];

const STAGE_ORDER = ["placed", "preparing", "ready_for_pickup", "picked_up", "delivered"];
const STAGE_LABELS = {
  placed: "Order placed",
  preparing: "Being prepared",
  ready_for_pickup: "Ready — finding a rider",
  picked_up: "On the way",
  delivered: "Delivered",
};
const ACTIVE_STATUSES = ["preparing", "ready_for_pickup", "picked_up"];
const POLL_INTERVAL_MS = 8000;

export default function FoodHome() {
  const { token } = useAuth();
  const [tab, setTab] = useState("browse");

  const [outlets, setOutlets] = useState([]);
  const [loadingOutlets, setLoadingOutlets] = useState(true);
  const [city, setCity] = useState("");
  const [category, setCategory] = useState("");

  const [orders, setOrders] = useState([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [chatOpenId, setChatOpenId] = useState(null);

  const unreadCount = useUnreadMessages(token, tab !== "mine");

  useEffect(() => {
    setLoadingOutlets(true);
    api.listOutlets({ city: city || undefined, category: category || undefined })
      .then(setOutlets)
      .catch(() => setOutlets([]))
      .finally(() => setLoadingOutlets(false));
  }, [city, category]);

  const loadOrders = useCallback(async () => {
    try {
      setOrders(await api.myFoodOrders(token));
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingOrders(false);
    }
  }, [token]);

  useEffect(() => { loadOrders(); }, [loadOrders]);

  const hasActiveOrder = orders.some((o) => ACTIVE_STATUSES.includes(o.status));
  useEffect(() => {
    if (tab !== "mine" || !hasActiveOrder) return;
    const interval = setInterval(loadOrders, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [tab, hasActiveOrder, loadOrders]);

  async function handleCancel(id) {
    try {
      await api.cancelFoodOrder(token, id);
      await loadOrders();
    } catch (err) {
      alert(err.message);
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-5 py-12">
      <div className="font-mono text-xs text-slate dark:text-slate-light mb-2">FOOD & GROCERIES</div>
      <h1 className="font-display text-3xl font-semibold mb-8 text-ink dark:text-paper">What are you in the mood for?</h1>

      <div className="flex gap-2 mb-6 border-b border-slate-200 dark:border-line">
        <TabButton active={tab === "browse"} onClick={() => setTab("browse")}>Browse</TabButton>
        <TabButton active={tab === "mine"} onClick={() => setTab("mine")}>
          My orders ({orders.length})
          {unreadCount > 0 && (
            <span className="ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-signal text-white text-[10px] font-semibold align-middle">
              {unreadCount}
            </span>
          )}
        </TabButton>
      </div>

      {tab === "browse" && (
        <div>
          <div className="flex gap-3 mb-6">
            <select
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="border border-slate-300 dark:border-line rounded-lg px-3.5 py-2 text-sm bg-white dark:bg-ink outline-none"
            >
              <option value="">All cities</option>
              {CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="border border-slate-300 dark:border-line rounded-lg px-3.5 py-2 text-sm bg-white dark:bg-ink outline-none"
            >
              {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>

          {loadingOutlets ? (
            <SkeletonCardList count={3} />
          ) : outlets.length === 0 ? (
            <EmptyState icon={Store} title="No outlets found" description="Try a different city or category." />
          ) : (
            <div className="grid sm:grid-cols-2 gap-4">
              {outlets.map((o) => (
                <Link
                  key={o.user_id}
                  to={`/food/${o.user_id}`}
                  className={`border border-slate-200 dark:border-line rounded-2xl p-5 bg-white dark:bg-ink-soft hover:border-ink dark:hover:border-paper transition-colors flex gap-3 ${!o.is_open ? "opacity-60" : ""}`}
                >
                  {o.logo_photo ? (
                    <img src={o.logo_photo} alt={o.business_name} className="w-14 h-14 rounded-xl object-cover border border-slate-200 dark:border-line shrink-0" />
                  ) : (
                    <div className="w-14 h-14 rounded-xl bg-ink dark:bg-paper text-paper dark:text-ink flex items-center justify-center shrink-0">
                      <Store className="w-6 h-6" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="font-display font-semibold text-ink dark:text-paper truncate">{o.business_name}</div>
                    <div className="text-xs text-slate dark:text-slate-light capitalize mb-1">{o.category} · {o.city}</div>
                    {o.description && <div className="text-xs text-slate dark:text-slate-light line-clamp-2">{o.description}</div>}
                    {!o.is_open && <div className="text-xs font-semibold text-red-600 mt-1">Closed now</div>}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "mine" && (
        loadingOrders ? (
          <SkeletonCardList count={2} />
        ) : orders.length === 0 ? (
          <EmptyState icon={UtensilsCrossed} title="No food orders yet" description="Order from an outlet and it'll show up here." />
        ) : (
          <div className="space-y-4">
            {orders.map((o) => {
              const currentIndex = STAGE_ORDER.indexOf(o.status);
              return (
                <div key={o.id} className="border border-slate-200 dark:border-line rounded-2xl p-5 bg-white dark:bg-ink-soft">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="font-mono text-xs text-slate dark:text-slate-light mb-1">{o.tracking_code}</div>
                      <div className="font-display font-semibold text-ink dark:text-paper">{o.outlet_name} · ₦{o.price.toLocaleString()}</div>
                    </div>
                    {["cancelled", "rejected"].includes(o.status) ? (
                      <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-600">
                        {o.status === "rejected" ? "Rejected" : "Cancelled"}
                      </span>
                    ) : (
                      <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-route/20 text-route-dark">{STAGE_LABELS[o.status]}</span>
                    )}
                  </div>

                  {!["cancelled", "rejected"].includes(o.status) && (
                    <div className="flex items-center gap-1 mb-3">
                      {STAGE_ORDER.map((stage, i) => (
                        <div key={stage} className={`flex-1 h-1.5 rounded-full ${i <= currentIndex ? "bg-delivered" : "bg-slate-200 dark:bg-white/10"}`} />
                      ))}
                    </div>
                  )}

                  <ul className="text-xs text-slate dark:text-slate-light mb-2">
                    {o.items.map((item, i) => <li key={i}>{item.quantity}× {item.name}</li>)}
                  </ul>
                  {o.status === "rejected" && o.rejection_reason && (
                    <div className="text-xs text-red-600 mb-2">Reason: {o.rejection_reason}</div>
                  )}

                  {o.agent_name && (
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-xs text-slate dark:text-slate-light">Rider: {o.agent_name} · {o.agent_phone}</div>
                      {ACTIVE_STATUSES.includes(o.status) && (
                        <button
                          onClick={() => setChatOpenId(chatOpenId === o.id ? null : o.id)}
                          className="flex items-center gap-1 text-xs font-semibold text-route-dark hover:underline shrink-0"
                        >
                          <MessageCircle className="w-3.5 h-3.5" />
                          {chatOpenId === o.id ? "Hide chat" : "Message rider"}
                        </button>
                      )}
                    </div>
                  )}

                  {chatOpenId === o.id && (
                    <div className="mb-3">
                      <ChatPanel token={token} tripType="food" tripId={o.id} myRole="customer" otherPartyName={o.agent_name} />
                    </div>
                  )}

                  {ACTIVE_STATUSES.includes(o.status) && (
                    <div className="mb-3">
                      <SOSButton token={token} tripType="food" tripId={o.id} />
                    </div>
                  )}

                  {o.status === "placed" && (
                    <button onClick={() => handleCancel(o.id)} className="text-xs font-semibold text-red-600 hover:underline">
                      Cancel order
                    </button>
                  )}
                </div>
              );
            })}
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
