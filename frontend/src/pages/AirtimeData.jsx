import { useEffect, useState, useCallback } from "react";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";
import { SkeletonCardList } from "../components/Skeleton";
import EmptyState from "../components/EmptyState";
import { Smartphone, Wifi, Clock } from "lucide-react";

const NETWORKS = [
  { id: "mtn", label: "MTN" },
  { id: "glo", label: "Glo" },
  { id: "airtel", label: "Airtel" },
  { id: "9mobile", label: "9mobile" },
];

const QUICK_AMOUNTS = [100, 200, 500, 1000, 2000, 5000];

const STATUS_LABEL = { delivered: "Delivered", pending: "Processing", failed: "Failed" };
const STATUS_STYLE = {
  delivered: "bg-delivered/15 text-delivered",
  pending: "bg-amber-100 text-amber-800",
  failed: "bg-red-100 text-red-700",
};

export default function AirtimeData() {
  const { token, refresh } = useAuth();
  const [tab, setTab] = useState("buy"); // "buy" | "history"

  const [mode, setMode] = useState("airtime"); // "airtime" | "data"
  const [network, setNetwork] = useState("mtn");
  const [phone, setPhone] = useState("");
  const [amount, setAmount] = useState("");

  const [plans, setPlans] = useState([]);
  const [loadingPlans, setLoadingPlans] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null); // { status, message } after a purchase attempt

  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  // Data plans are network-specific and reset the moment either mode or
  // network changes — never trust a plan picked under a different network
  // to still be valid.
  useEffect(() => {
    setSelectedPlan(null);
    if (mode !== "data") return;
    setLoadingPlans(true);
    api.billDataPlans(token, network)
      .then(setPlans)
      .catch(() => setPlans([]))
      .finally(() => setLoadingPlans(false));
  }, [mode, network, token]);

  const loadHistory = useCallback(async () => {
    try {
      setHistory(await api.myBillPayments(token));
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingHistory(false);
    }
  }, [token]);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  const canSubmit = phone.length === 11 && (mode === "airtime" ? Number(amount) >= 50 : Boolean(selectedPlan));

  async function handleSubmit(e) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError("");
    setResult(null);
    try {
      const res =
        mode === "airtime"
          ? await api.buyAirtime(token, { network, phone, amount: Number(amount) })
          : await api.buyData(token, { network, phone, variation_code: selectedPlan.code });
      setResult({ status: res.status, message: res.message });
      setAmount("");
      setSelectedPlan(null);
      await Promise.all([refresh(), loadHistory()]);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-5 py-10">
      <div className="font-mono text-xs text-slate dark:text-slate-light mb-2">AIRTIME & DATA</div>
      <h1 className="font-display text-3xl font-semibold mb-8 text-ink dark:text-paper">Top up your phone</h1>

      <div className="flex gap-2 mb-6 border-b border-slate-200 dark:border-line">
        <TabButton active={tab === "buy"} onClick={() => setTab("buy")}>Buy</TabButton>
        <TabButton active={tab === "history"} onClick={() => setTab("history")}>History ({history.length})</TabButton>
      </div>

      {tab === "buy" && (
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setMode("airtime")}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium border transition-colors ${
                mode === "airtime" ? "bg-ink text-paper border-ink dark:bg-paper dark:text-ink dark:border-paper" : "border-slate-300 dark:border-line text-slate dark:text-slate-light"
              }`}
            >
              <Smartphone className="w-4 h-4" /> Airtime
            </button>
            <button
              type="button"
              onClick={() => setMode("data")}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium border transition-colors ${
                mode === "data" ? "bg-ink text-paper border-ink dark:bg-paper dark:text-ink dark:border-paper" : "border-slate-300 dark:border-line text-slate dark:text-slate-light"
              }`}
            >
              <Wifi className="w-4 h-4" /> Data
            </button>
          </div>

          <div>
            <label className="block text-xs font-mono text-slate dark:text-slate-light uppercase mb-2">Network</label>
            <div className="flex flex-wrap gap-2">
              {NETWORKS.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => setNetwork(n.id)}
                  className={`text-sm font-medium px-4 py-3 min-h-[44px] rounded-full border transition-colors ${
                    network === n.id
                      ? "bg-route text-ink border-route"
                      : "border-slate-300 dark:border-line text-slate dark:text-slate-light hover:text-ink dark:hover:text-paper"
                  }`}
                >
                  {n.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-mono text-slate dark:text-slate-light uppercase mb-2">Phone number</label>
            <input
              type="tel"
              inputMode="numeric"
              maxLength={11}
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
              placeholder="08012345678"
              required
              className="w-full border border-slate-300 dark:border-line rounded-lg px-3.5 py-2.5 text-sm bg-white dark:bg-ink outline-none"
            />
          </div>

          {mode === "airtime" ? (
            <div>
              <label className="block text-xs font-mono text-slate dark:text-slate-light uppercase mb-2">Amount</label>
              <div className="flex flex-wrap gap-2 mb-2.5">
                {QUICK_AMOUNTS.map((a) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => setAmount(String(a))}
                    className={`text-xs font-semibold px-3.5 py-2.5 min-h-[40px] rounded-full border transition-colors ${
                      Number(amount) === a ? "bg-route text-ink border-route" : "border-slate-300 dark:border-line text-slate dark:text-slate-light"
                    }`}
                  >
                    ₦{a.toLocaleString()}
                  </button>
                ))}
              </div>
              <input
                type="number"
                min={50}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Or enter a custom amount"
                className="w-full border border-slate-300 dark:border-line rounded-lg px-3.5 py-2.5 text-sm bg-white dark:bg-ink outline-none"
              />
            </div>
          ) : (
            <div>
              <label className="block text-xs font-mono text-slate dark:text-slate-light uppercase mb-2">Data plan</label>
              {loadingPlans ? (
                <SkeletonCardList count={3} />
              ) : plans.length === 0 ? (
                <p className="text-sm text-slate dark:text-slate-light">Couldn't load plans for this network — try again shortly.</p>
              ) : (
                <div className="grid sm:grid-cols-2 gap-2.5">
                  {plans.map((p) => (
                    <button
                      key={p.code}
                      type="button"
                      onClick={() => setSelectedPlan(p)}
                      className={`text-left border rounded-xl px-3.5 py-2.5 transition-colors ${
                        selectedPlan?.code === p.code
                          ? "border-route bg-route/10"
                          : "border-slate-200 dark:border-line hover:border-ink dark:hover:border-paper"
                      }`}
                    >
                      <div className="text-sm font-medium text-ink dark:text-paper">{p.name}</div>
                      <div className="font-mono text-xs text-slate dark:text-slate-light mt-0.5">₦{p.amount.toLocaleString()}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}
          {result && (
            <p className={`text-sm ${result.status === "delivered" ? "text-delivered" : "text-amber-700"}`}>
              {result.status === "delivered" ? "Purchase successful!" : result.message || "Your purchase is processing."}
            </p>
          )}

          <button
            type="submit"
            disabled={!canSubmit || submitting}
            className="w-full bg-route hover:bg-route-dark text-ink font-semibold rounded-lg px-4 py-3 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? "Processing…" : mode === "airtime" ? `Buy ${amount ? `₦${Number(amount).toLocaleString()} ` : ""}airtime` : "Buy data plan"}
          </button>
        </form>
      )}

      {tab === "history" && (
        loadingHistory ? (
          <SkeletonCardList count={3} />
        ) : history.length === 0 ? (
          <EmptyState icon={Clock} title="No purchases yet" description="Airtime and data top-ups will show up here." />
        ) : (
          <div className="space-y-3">
            {history.map((h) => (
              <div key={h.id} className="border border-slate-200 dark:border-line rounded-xl p-4 bg-white dark:bg-ink-soft flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-ink dark:text-paper">
                    {h.type === "airtime" ? `₦${Number(h.amount).toLocaleString()} airtime` : h.variation_name}
                  </div>
                  <div className="text-xs text-slate dark:text-slate-light mt-0.5">
                    {h.network.toUpperCase()} · {h.phone} · {new Date(h.created_at).toLocaleString()}
                  </div>
                </div>
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 ${STATUS_STYLE[h.status]}`}>
                  {STATUS_LABEL[h.status]}
                </span>
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
