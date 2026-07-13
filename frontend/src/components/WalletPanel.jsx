import { useEffect, useState, useCallback } from "react";
import { api } from "../api";

const TYPE_LABELS = {
  topup: "Wallet top-up",
  delivery_payment: "Delivery payment",
  refund: "Refund",
};

export default function WalletPanel({ token }) {
  const [wallet, setWallet] = useState(null);
  const [amount, setAmount] = useState("");
  const [error, setError] = useState("");
  const [funding, setFunding] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const load = useCallback(() => {
    api.getWallet(token).then(setWallet).catch(() => {});
  }, [token]);

  useEffect(() => { load(); }, [load]);

  async function handleFund(e) {
    e.preventDefault();
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt < 100) {
      setError("Enter an amount of at least ₦100");
      return;
    }
    setError("");
    setFunding(true);
    try {
      const data = await api.fundWallet(token, { amount: amt });
      window.location.href = data.authorization_url;
    } catch (err) {
      setError(err.message);
      setFunding(false);
    }
  }

  if (!wallet) return null;

  return (
    <div className="border border-slate-200 rounded-2xl p-6 bg-white mb-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="text-xs text-slate mb-1">Wallet balance</div>
          <div className="font-mono font-semibold text-2xl">₦{wallet.balance.toLocaleString()}</div>
        </div>
        <button
          onClick={() => setShowHistory((s) => !s)}
          className="text-xs text-slate hover:text-ink underline"
        >
          {showHistory ? "Hide history" : "View history"}
        </button>
      </div>

      <form onSubmit={handleFund} className="flex gap-2 mb-2">
        <input
          type="number"
          min="100"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Amount to add (₦)"
          className="flex-1 border border-slate-300 rounded-lg px-3.5 py-2 text-sm focus:border-ink focus:ring-1 focus:ring-ink outline-none"
        />
        <button
          disabled={funding}
          className="bg-route hover:bg-route-dark text-ink font-semibold rounded-lg px-4 py-2 text-sm transition-colors disabled:opacity-60"
        >
          {funding ? "Redirecting…" : "Top up"}
        </button>
      </form>
      {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
      <p className="text-xs text-slate">
        Fund your wallet once, then pay for deliveries instantly without going through checkout each time.
      </p>

      {showHistory && (
        <div className="mt-4 border-t border-slate-100 pt-4 space-y-2 max-h-64 overflow-y-auto">
          {wallet.transactions.length === 0 ? (
            <p className="text-xs text-slate">No transactions yet.</p>
          ) : (
            wallet.transactions.map((t) => (
              <div key={t.id} className="flex items-center justify-between text-xs">
                <div>
                  <div className="font-medium text-ink">{TYPE_LABELS[t.type] || t.type}</div>
                  <div className="text-slate">{new Date(t.created_at).toLocaleString()}</div>
                </div>
                <span className={`font-mono font-semibold ${t.amount >= 0 ? "text-delivered" : "text-ink"}`}>
                  {t.amount >= 0 ? "+" : ""}₦{t.amount.toLocaleString()}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
