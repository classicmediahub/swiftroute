import { useEffect, useState, useCallback, useRef } from "react";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";
import ChatPanel from "../components/ChatPanel";
import SOSButton from "../components/SOSButton";
import { useUnreadMessages } from "../hooks/useUnreadMessages";
import { SkeletonCardList } from "../components/Skeleton";
import EmptyState from "../components/EmptyState";
import { Flame, MessageCircle } from "lucide-react";

const STAGE_ORDER = ["pending", "accepted", "en_route", "filling", "completed"];
const STAGE_LABELS = {
  pending: "Order placed",
  accepted: "Agent assigned",
  en_route: "Agent on the way",
  filling: "Filling your cylinder",
  completed: "Completed",
};
const ACTIVE_STATUSES = ["accepted", "en_route", "filling"];
const POLL_INTERVAL_MS = 8000;

export default function RequestGas() {
  const { token } = useAuth();
  const [tab, setTab] = useState("request");

  const [sizes, setSizes] = useState([]);
  const [cylinderSize, setCylinderSize] = useState(null);
  const [address, setAddress] = useState("");
  const [landmark, setLandmark] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [note, setNote] = useState("");

  const [quote, setQuote] = useState(null);
  const [estimating, setEstimating] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState("");
  const [walletBalance, setWalletBalance] = useState(0);

  const [orders, setOrders] = useState([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [chatOpenId, setChatOpenId] = useState(null);
  const pollRef = useRef(null);

  const unreadCount = useUnreadMessages(token, tab !== "mine");

  const loadOrders = useCallback(async () => {
    try {
      setOrders(await api.myGasOrders(token));
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingOrders(false);
    }
  }, [token]);

  useEffect(() => {
    loadOrders();
    api.getWallet(token).then((w) => setWalletBalance(w.balance)).catch(() => {});
    api.gasCylinderSizes(token).then((d) => {
      setSizes(d.sizes_kg);
      setCylinderSize((prev) => prev ?? d.sizes_kg[1] ?? d.sizes_kg[0]); // default to the 2nd size (usually 5–6kg, the most common household refill) rather than the smallest
    }).catch(() => {});
  }, [loadOrders, token]);

  const hasActiveOrder = orders.some((o) => ACTIVE_STATUSES.includes(o.status));
  useEffect(() => {
    if (tab !== "mine" || !hasActiveOrder) {
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }
    pollRef.current = setInterval(loadOrders, POLL_INTERVAL_MS);
    return () => clearInterval(pollRef.current);
  }, [tab, hasActiveOrder, loadOrders]);

  useEffect(() => {
    if (!cylinderSize) return;
    setEstimating(true);
    const t = setTimeout(() => {
      api.gasEstimate(token, cylinderSize).then(setQuote).catch(() => setQuote(null)).finally(() => setEstimating(false));
    }, 200);
    return () => clearTimeout(t);
  }, [cylinderSize, token]);

  async function handleRequest(payment_method) {
    if (!address.trim() || !contactPhone.trim()) {
      setError("Enter your address and a contact phone number");
      return;
    }
    if (payment_method === "wallet" && quote && walletBalance < quote.price) {
      setError(`Insufficient wallet balance. You have ₦${walletBalance.toLocaleString()}, this order costs ₦${quote.price.toLocaleString()}.`);
      return;
    }
    setError("");
    setRequesting(true);
    try {
      const data = await api.createGasOrder(token, {
        address, landmark, contact_phone: contactPhone, cylinder_size_kg: cylinderSize, note, payment_method,
      });
      if (data.authorization_url) {
        window.location.href = data.authorization_url;
        return;
      }
      setAddress(""); setLandmark(""); setContactPhone(""); setNote("");
      await loadOrders();
      api.getWallet(token).then((w) => setWalletBalance(w.balance)).catch(() => {});
      setTab("mine");
    } catch (err) {
      setError(err.message);
    } finally {
      setRequesting(false);
    }
  }

  async function handleCancel(id) {
    try {
      await api.cancelGasOrder(token, id);
      await loadOrders();
    } catch (err) {
      alert(err.message);
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-5 py-12">
      <div className="font-mono text-xs text-slate dark:text-slate-light mb-2">COOKING GAS</div>
      <h1 className="font-display text-3xl font-semibold mb-8 text-ink dark:text-paper">Gas finished? We'll fill it.</h1>

      <div className="flex gap-2 mb-6 border-b border-slate-200 dark:border-line">
        <TabButton active={tab === "request"} onClick={() => setTab("request")}>Order a refill</TabButton>
        <TabButton active={tab === "mine"} onClick={() => setTab("mine")}>
          My orders ({orders.length})
          {unreadCount > 0 && (
            <span className="ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-signal text-white text-[10px] font-semibold align-middle">
              {unreadCount}
            </span>
          )}
        </TabButton>
      </div>

      {tab === "request" && (
        <div>
          <div className="mb-5">
            <label className="block text-sm font-medium text-ink dark:text-paper mb-2">Cylinder size</label>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {sizes.map((kg) => (
                <button
                  key={kg}
                  onClick={() => setCylinderSize(kg)}
                  className={`text-center border rounded-lg py-2.5 text-sm font-mono font-semibold transition-colors ${
                    cylinderSize === kg
                      ? "border-ink dark:border-paper bg-ink text-paper dark:bg-paper dark:text-ink"
                      : "border-slate-300 dark:border-line hover:border-slate-400 dark:hover:border-slate-light text-ink dark:text-paper"
                  }`}
                >
                  {kg}kg
                </button>
              ))}
            </div>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-ink dark:text-paper mb-1.5">Your address</label>
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="House number, street, area"
              className="w-full border border-slate-300 dark:border-line rounded-lg px-3.5 py-2.5 text-sm bg-white dark:bg-ink outline-none"
            />
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium text-ink dark:text-paper mb-1.5">Nearby landmark (optional)</label>
            <input
              value={landmark}
              onChange={(e) => setLandmark(e.target.value)}
              placeholder="e.g. behind Total filling station"
              className="w-full border border-slate-300 dark:border-line rounded-lg px-3.5 py-2.5 text-sm bg-white dark:bg-ink outline-none"
            />
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium text-ink dark:text-paper mb-1.5">Contact phone</label>
            <input
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
              placeholder="0801 234 5678"
              className="w-full border border-slate-300 dark:border-line rounded-lg px-3.5 py-2.5 text-sm bg-white dark:bg-ink outline-none"
            />
          </div>
          <div className="mb-6">
            <label className="block text-sm font-medium text-ink dark:text-paper mb-1.5">Note for the agent (optional)</label>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. gate code, which floor"
              className="w-full border border-slate-300 dark:border-line rounded-lg px-3.5 py-2.5 text-sm bg-white dark:bg-ink outline-none"
            />
          </div>

          {quote && (
            <div className="border border-slate-200 dark:border-line rounded-xl p-4 mb-4 bg-paper dark:bg-white/5">
              <div className="flex items-center justify-between text-sm mb-1">
                <span className="text-slate dark:text-slate-light">{cylinderSize}kg × ₦{quote.pricePerKg.toLocaleString()}/kg</span>
                <span className="font-mono text-ink dark:text-paper">₦{(cylinderSize * quote.pricePerKg).toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between text-sm mb-2">
                <span className="text-slate dark:text-slate-light">Callout fee</span>
                <span className="font-mono text-ink dark:text-paper">₦{quote.calloutFee.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between text-base font-semibold border-t border-slate-200 dark:border-line pt-2">
                <span className="text-ink dark:text-paper">Total</span>
                <span className="font-mono text-ink dark:text-paper">₦{quote.price.toLocaleString()}</span>
              </div>
            </div>
          )}

          {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

          <div className="flex gap-2">
            <button
              disabled={requesting || estimating || !quote}
              onClick={() => handleRequest("wallet")}
              className="flex-1 bg-route hover:bg-route-dark text-ink font-semibold rounded-lg px-4 py-2.5 text-sm transition-colors disabled:opacity-60"
            >
              {requesting ? "Placing order…" : `Pay with wallet (₦${walletBalance.toLocaleString()})`}
            </button>
            <button
              disabled={requesting || estimating || !quote}
              onClick={() => handleRequest("paystack")}
              className="flex-1 bg-ink dark:bg-paper hover:opacity-90 text-paper dark:text-ink font-semibold rounded-lg px-4 py-2.5 text-sm transition-colors disabled:opacity-60"
            >
              Pay with card
            </button>
          </div>
        </div>
      )}

      {tab === "mine" && (
        loadingOrders ? (
          <SkeletonCardList count={2} />
        ) : orders.length === 0 ? (
          <EmptyState icon={Flame} title="No gas orders yet" description="Order a refill and it'll show up here." />
        ) : (
          <div className="space-y-4">
            {orders.map((o) => {
              const currentIndex = STAGE_ORDER.indexOf(o.status);
              return (
                <div key={o.id} className="border border-slate-200 dark:border-line rounded-2xl p-5 bg-white dark:bg-ink-soft">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="font-mono text-xs text-slate dark:text-slate-light mb-1">{o.tracking_code}</div>
                      <div className="font-display font-semibold text-ink dark:text-paper">{o.cylinder_size_kg}kg refill · ₦{o.price.toLocaleString()}</div>
                    </div>
                    {o.status === "cancelled" ? (
                      <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-600">Cancelled</span>
                    ) : (
                      <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-route/20 text-route-dark">{STAGE_LABELS[o.status]}</span>
                    )}
                  </div>

                  {o.status !== "cancelled" && (
                    <div className="flex items-center gap-1 mb-3">
                      {STAGE_ORDER.map((stage, i) => (
                        <div key={stage} className={`flex-1 h-1.5 rounded-full ${i <= currentIndex ? "bg-delivered" : "bg-slate-200 dark:bg-white/10"}`} />
                      ))}
                    </div>
                  )}

                  <div className="text-xs text-slate dark:text-slate-light mb-2">
                    {o.address}{o.landmark && ` (${o.landmark})`}
                  </div>

                  {o.agent_name && (
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-xs text-slate dark:text-slate-light">Agent: {o.agent_name} · {o.agent_phone}</div>
                      {o.status !== "cancelled" && (
                        <button
                          onClick={() => setChatOpenId(chatOpenId === o.id ? null : o.id)}
                          className="flex items-center gap-1 text-xs font-semibold text-route-dark hover:underline shrink-0"
                        >
                          <MessageCircle className="w-3.5 h-3.5" />
                          {chatOpenId === o.id ? "Hide chat" : "Message agent"}
                        </button>
                      )}
                    </div>
                  )}

                  {chatOpenId === o.id && (
                    <div className="mb-3">
                      <ChatPanel token={token} tripType="gas" tripId={o.id} myRole="customer" otherPartyName={o.agent_name} disabled={o.status === "cancelled"} />
                    </div>
                  )}

                  {ACTIVE_STATUSES.includes(o.status) && (
                    <div className="mb-3">
                      <SOSButton token={token} tripType="gas" tripId={o.id} />
                    </div>
                  )}

                  {o.status === "completed" && o.proof_photo && (
                    <div className="mt-3 pt-3 border-t border-slate-100 dark:border-line">
                      <div className="text-xs font-semibold text-slate dark:text-slate-light uppercase mb-2">Proof of fill</div>
                      <img src={o.proof_photo} alt="Proof of gas fill" className="w-full max-h-64 object-cover rounded-xl border border-slate-200 dark:border-line" />
                    </div>
                  )}

                  {["pending", "accepted"].includes(o.status) && (
                    <button onClick={() => handleCancel(o.id)} className="text-xs font-semibold text-red-600 hover:underline mt-2">
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
