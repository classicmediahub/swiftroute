import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api";

export default function RedeemLocker() {
  const [params] = useSearchParams();
  const [trackingCode, setTrackingCode] = useState(params.get("code") || "");
  const [pickupCode, setPickupCode] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!trackingCode.trim() || !pickupCode.trim()) return;
    setError("");
    setLoading(true);
    setResult(null);
    try {
      const data = await api.redeemLocker({
        tracking_code: trackingCode.trim().toUpperCase(),
        pickup_code: pickupCode.trim(),
      });
      setResult(data.delivery);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-xl mx-auto px-5 py-16">
      <div className="font-mono text-xs text-slate mb-2">LOCKER PICKUP</div>
      <h1 className="font-display text-3xl font-semibold mb-3">Collect your package</h1>
      <p className="text-sm text-slate mb-8">
        Enter your tracking code and the 6-digit pickup code your agent shared with you — both together confirm
        it's really you (or whoever you've asked to collect it) picking up.
      </p>

      {!result && (
        <form onSubmit={handleSubmit} className="space-y-3 mb-8">
          <div>
            <label className="block text-xs font-mono text-slate uppercase mb-1.5">Tracking code</label>
            <input
              value={trackingCode}
              onChange={(e) => setTrackingCode(e.target.value)}
              placeholder="e.g. PAE-Y3BCKLH"
              className="w-full border border-slate-300 rounded-lg px-3.5 py-2.5 text-sm font-mono focus:border-ink focus:ring-1 focus:ring-ink outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-mono text-slate uppercase mb-1.5">Pickup code</label>
            <input
              value={pickupCode}
              onChange={(e) => setPickupCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              placeholder="6-digit code"
              className="w-full border border-slate-300 rounded-lg px-3.5 py-2.5 text-sm font-mono tracking-widest focus:border-ink focus:ring-1 focus:ring-ink outline-none"
            />
          </div>
          <button
            disabled={loading || !trackingCode.trim() || !pickupCode.trim()}
            className="w-full bg-route hover:bg-route-dark text-ink font-semibold rounded-lg px-5 py-2.5 transition-colors disabled:opacity-60"
          >
            {loading ? "Checking…" : "Collect package"}
          </button>
        </form>
      )}

      {error && (
        <div className="border border-red-200 bg-red-50 text-red-700 text-sm rounded-xl p-4 mb-6">{error}</div>
      )}

      {result && (
        <div className="border border-delivered/40 bg-delivered/10 rounded-2xl p-6 text-center">
          <div className="w-12 h-12 rounded-full bg-delivered text-white flex items-center justify-center mx-auto mb-4 text-2xl">
            ✓
          </div>
          <div className="font-display font-semibold text-lg mb-1">Package collected!</div>
          <div className="text-sm text-slate mb-4">
            {result.tracking_code} · {result.package_type} · {result.pickup_city} → {result.dropoff_city}
          </div>
          <p className="text-xs text-slate">This delivery is now marked as delivered. Thanks for using Pick N' Earn.</p>
        </div>
      )}

      <p className="text-sm text-slate mt-8">
        Not what you're looking for?{" "}
        <Link to="/track" className="text-ink font-semibold underline">Track a delivery</Link> instead.
      </p>
    </div>
  );
}
