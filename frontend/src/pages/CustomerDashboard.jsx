import { useEffect, useState, useCallback } from "react";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";
import StatusBadge from "../components/StatusBadge";
import { Field, inputClass } from "../components/AuthLayout";
import StarRating from "../components/StarRating";
import ReviewForm from "../components/ReviewForm";
import { lazy, Suspense } from "react";
const DeliveryMap = lazy(() => import("../components/DeliveryMap"));

const CITIES = ["Lagos", "Ogun", "Abuja", "Port Harcourt", "Ibadan", "Kano", "Enugu", "Benin City"];
const PACKAGE_TYPES = ["Documents", "Small parcel", "Food", "Electronics", "Fragile item", "Other"];
const VEHICLES = [
  { value: "any", label: "Any available" },
  { value: "self", label: "Self" },
  { value: "bike", label: "Bike" },
  { value: "cab", label: "Cab" },
];

const emptyForm = {
  package_type: "Documents", package_note: "",
  pickup_address: "", pickup_city: "Lagos",
  dropoff_address: "", dropoff_city: "Lagos",
  recipient_name: "", recipient_phone: "",
  preferred_vehicle: "any",
};

export default function CustomerDashboard() {
  const { token } = useAuth();
  const [form, setForm] = useState(emptyForm);
  const [estimate, setEstimate] = useState(null);
  const [estimateDistance, setEstimateDistance] = useState(null);
  const [deliveries, setDeliveries] = useState([]);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loadingList, setLoadingList] = useState(true);

  const loadDeliveries = useCallback(async () => {
    try {
      const rows = await api.myDeliveries(token);
      setDeliveries(rows);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingList(false);
    }
  }, [token]);

  useEffect(() => { loadDeliveries(); }, [loadDeliveries]);

  // Poll for updates while at least one delivery is actively moving, so the
  // agent's live position and status stay reasonably fresh without the
  // customer needing to manually refresh.
  useEffect(() => {
    const hasActive = deliveries.some((d) => ["accepted", "picked_up", "in_transit"].includes(d.status));
    if (!hasActive) return;
    const t = setInterval(loadDeliveries, 8000);
    return () => clearInterval(t);
  }, [deliveries, loadDeliveries]);

  useEffect(() => {
    if (!form.pickup_city || !form.dropoff_city) return;
    const t = setTimeout(async () => {
      try {
        const res = await api.estimate(token, {
          pickup_city: form.pickup_city,
          dropoff_city: form.dropoff_city,
          preferred_vehicle: form.preferred_vehicle,
          // Only send addresses once they're reasonably complete — avoids
          // geocoding "1" or "12 A" while the person is still typing.
          pickup_address: form.pickup_address.trim().length > 5 ? form.pickup_address : undefined,
          dropoff_address: form.dropoff_address.trim().length > 5 ? form.dropoff_address : undefined,
        });
        setEstimate(res.price);
        setEstimateDistance(res.distanceKm);
      } catch {
        setEstimate(null);
        setEstimateDistance(null);
      }
    }, 500);
    return () => clearTimeout(t);
  }, [form.pickup_city, form.dropoff_city, form.pickup_address, form.dropoff_address, form.preferred_vehicle, token]);

  function update(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const data = await api.createDelivery(token, form);
      if (data.authorization_url) {
        // Full-page redirect to Paystack's hosted checkout. Don't reset
        // submitting/state here — the browser is about to navigate away.
        window.location.href = data.authorization_url;
        return;
      }
      // Shouldn't normally happen, but handle it rather than leaving the
      // button stuck in a loading state.
      setForm(emptyForm);
      setEstimate(null);
      setEstimateDistance(null);
      await loadDeliveries();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRetryPayment(id) {
    try {
      const data = await api.retryPayment(token, id);
      window.location.href = data.authorization_url;
    } catch (err) {
      alert(err.message);
    }
  }

  async function handleCancel(id) {
    try {
      await api.cancelDelivery(token, id);
      await loadDeliveries();
    } catch (err) {
      alert(err.message);
    }
  }

  return (
    <div className="max-w-6xl mx-auto px-5 py-10">
      <div className="font-mono text-xs text-slate mb-2">CUSTOMER DASHBOARD</div>
      <h1 className="font-display text-3xl font-semibold mb-8">Send a new delivery</h1>

      <div className="grid lg:grid-cols-5 gap-8">
        <form onSubmit={handleSubmit} className="lg:col-span-2 border border-slate-200 rounded-2xl p-6 bg-white h-fit">
          <Field label="What are you sending?">
            <select className={inputClass} value={form.package_type} onChange={(e) => update("package_type", e.target.value)}>
              {PACKAGE_TYPES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </Field>
          <Field label="Note for the agent (optional)">
            <input className={inputClass} value={form.package_note} onChange={(e) => update("package_note", e.target.value)} placeholder="Fragile — handle with care" />
          </Field>

          <div className="grid grid-cols-2 gap-x-3">
            <Field label="Pickup address">
              <input required className={inputClass} value={form.pickup_address} onChange={(e) => update("pickup_address", e.target.value)} placeholder="12 Allen Ave" />
            </Field>
            <Field label="Pickup city">
              <select className={inputClass} value={form.pickup_city} onChange={(e) => update("pickup_city", e.target.value)}>
                {CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-x-3">
            <Field label="Drop-off address">
              <input required className={inputClass} value={form.dropoff_address} onChange={(e) => update("dropoff_address", e.target.value)} placeholder="5 Admiralty Way" />
            </Field>
            <Field label="Drop-off city">
              <select className={inputClass} value={form.dropoff_city} onChange={(e) => update("dropoff_city", e.target.value)}>
                {CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-x-3">
            <Field label="Recipient name">
              <input required className={inputClass} value={form.recipient_name} onChange={(e) => update("recipient_name", e.target.value)} placeholder="John Doe" />
            </Field>
            <Field label="Recipient phone">
              <input required className={inputClass} value={form.recipient_phone} onChange={(e) => update("recipient_phone", e.target.value)} placeholder="0809 999 8888" />
            </Field>
          </div>

          <span className="block text-sm font-medium text-ink mb-1.5">Preferred vehicle</span>
          <div className="grid grid-cols-4 gap-2 mb-4">
            {VEHICLES.map((v) => (
              <button type="button" key={v.value} onClick={() => update("preferred_vehicle", v.value)}
                className={`text-xs font-medium rounded-lg px-2 py-2 border transition-colors ${
                  form.preferred_vehicle === v.value ? "border-ink bg-ink text-paper" : "border-slate-300 hover:border-slate-400"
                }`}>
                {v.label}
              </button>
            ))}
          </div>

          {estimate !== null && (
            <div className="flex items-center justify-between bg-paper border border-slate-200 rounded-lg px-4 py-3 mb-4">
              <div>
                <span className="text-sm text-slate">Estimated price</span>
                {estimateDistance !== null && (
                  <div className="text-xs text-slate">≈ {estimateDistance} km driving distance</div>
                )}
              </div>
              <span className="font-mono font-semibold text-lg">₦{estimate.toLocaleString()}</span>
            </div>
          )}

          {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

          <button disabled={submitting} className="w-full bg-route hover:bg-route-dark text-ink font-semibold rounded-lg px-4 py-2.5 transition-colors disabled:opacity-60">
            {submitting ? "Redirecting to payment…" : "Continue to payment"}
          </button>
        </form>

        <div className="lg:col-span-3">
          <h2 className="font-display text-lg font-semibold mb-4">Your deliveries</h2>
          {loadingList ? (
            <p className="text-sm text-slate">Loading…</p>
          ) : deliveries.length === 0 ? (
            <div className="border border-dashed border-slate-300 rounded-2xl p-8 text-center text-slate text-sm">
              No deliveries yet. Post your first one on the left.
            </div>
          ) : (
            <div className="space-y-3">
              {deliveries.map((d) => (
                <div key={d.id} className="border border-slate-200 rounded-xl p-4 bg-white">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className="font-mono text-xs text-slate mb-1">{d.tracking_code}</div>
                      <div className="font-semibold text-sm">
                        {d.package_type} · {d.pickup_city} → {d.dropoff_city}
                        {d.distance_km && <span className="text-slate font-normal"> · {d.distance_km} km</span>}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1.5">
                      <StatusBadge status={d.status} />
                      {d.payment_status !== "paid" && <StatusBadge status={d.payment_status} />}
                    </div>
                  </div>
                  <div className="text-xs text-slate space-y-0.5 mb-2">
                    <div>Pickup: {d.pickup_address}</div>
                    <div>Drop-off: {d.dropoff_address} · to {d.recipient_name}</div>
                    {d.agent_name && <div>Agent: {d.agent_name} · {d.agent_phone}</div>}
                  </div>

                  {["accepted", "picked_up", "in_transit"].includes(d.status) && (
                    <div className="mb-3">
                      <Suspense fallback={<div style={{ height: 220 }} className="rounded-xl bg-paper border border-slate-200 animate-pulse" />}>
                        <DeliveryMap
                          height={220}
                          pickup={d.pickup_lat != null ? { lat: d.pickup_lat, lng: d.pickup_lng } : null}
                          dropoff={d.dropoff_lat != null ? { lat: d.dropoff_lat, lng: d.dropoff_lng } : null}
                          current={d.current_lat != null ? { lat: d.current_lat, lng: d.current_lng } : null}
                        />
                      </Suspense>
                      {d.current_lat != null && (
                        <p className="text-xs text-slate mt-1.5">
                          Agent location last updated {new Date(d.location_updated_at).toLocaleTimeString()}
                        </p>
                      )}
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-sm font-semibold">₦{d.price.toLocaleString()}</span>
                    <div className="flex items-center gap-3">
                      {["unpaid", "failed"].includes(d.payment_status) && d.status !== "cancelled" && (
                        <button onClick={() => handleRetryPayment(d.id)} className="text-xs bg-route hover:bg-route-dark text-ink font-semibold rounded-lg px-3 py-1.5 transition-colors">
                          Complete payment
                        </button>
                      )}
                      {["pending", "accepted"].includes(d.status) && (
                        <button onClick={() => handleCancel(d.id)} className="text-xs text-red-600 font-medium hover:underline">
                          Cancel
                        </button>
                      )}
                    </div>
                  </div>

                  {d.status === "delivered" && (
                    d.review_rating ? (
                      <div className="border-t border-slate-100 mt-3 pt-3 flex items-center gap-2">
                        <StarRating value={d.review_rating} readOnly size={16} />
                        {d.review_comment && <span className="text-xs text-slate">"{d.review_comment}"</span>}
                      </div>
                    ) : (
                      <ReviewForm deliveryId={d.id} token={token} onSubmitted={loadDeliveries} />
                    )
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
