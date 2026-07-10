import { useEffect, useState, useCallback } from "react";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";
import StatusBadge from "../components/StatusBadge";
import { Field, inputClass } from "../components/AuthLayout";

const CITIES = ["Lagos", "Abuja", "Port Harcourt", "Ibadan", "Kano", "Enugu", "Benin City"];
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

  useEffect(() => {
    if (!form.pickup_city || !form.dropoff_city) return;
    const t = setTimeout(async () => {
      try {
        const res = await api.estimate(token, {
          pickup_city: form.pickup_city, dropoff_city: form.dropoff_city, preferred_vehicle: form.preferred_vehicle,
        });
        setEstimate(res.price);
      } catch {
        setEstimate(null);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [form.pickup_city, form.dropoff_city, form.preferred_vehicle, token]);

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
              <span className="text-sm text-slate">Estimated price</span>
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
                      <div className="font-semibold text-sm">{d.package_type} · {d.pickup_city} → {d.dropoff_city}</div>
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
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
