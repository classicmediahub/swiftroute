import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";
import AuthLayout, { Field, inputClass } from "../components/AuthLayout";
import FaceCapture from "../components/FaceCapture";

const VEHICLES = [
  { value: "self", label: "Self", detail: "On foot, local errands" },
  { value: "bike", label: "Bike", detail: "Dispatch rider" },
  { value: "cab", label: "Cab", detail: "Car / bulkier loads" },
];

const CITIES = ["Lagos", "Ogun", "Abuja", "Port Harcourt", "Ibadan", "Kano", "Enugu", "Benin City"];

export default function SignupAgent() {
  const [form, setForm] = useState({
    full_name: "", email: "", phone: "", password: "",
    vehicle_type: "bike", vehicle_make: "", vehicle_plate: "", license_number: "", city: "Lagos",
    profile_photo: null,
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  function update(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const needsVehicleDetails = form.vehicle_type === "bike" || form.vehicle_type === "cab";

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.profile_photo) {
      setError("A face photo is required — capture one below before submitting.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const data = await api.signupAgent(form);
      login(data.token, data.user, data.agent_profile);
      navigate("/agent/dashboard");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      eyebrow="[WB-02] DELIVER & EARN"
      title="Register as an agent"
      subtitle="Your account needs admin approval before you can accept deliveries."
      wide
    >
      <form onSubmit={handleSubmit}>
        <div className="grid sm:grid-cols-2 gap-x-4">
          <Field label="Full name">
            <input required className={inputClass} value={form.full_name} onChange={(e) => update("full_name", e.target.value)} placeholder="Tunde Bello" />
          </Field>
          <Field label="Phone number">
            <input required className={inputClass} value={form.phone} onChange={(e) => update("phone", e.target.value)} placeholder="0803 333 4444" />
          </Field>
        </div>
        <Field label="Email">
          <input required type="email" className={inputClass} value={form.email} onChange={(e) => update("email", e.target.value)} placeholder="you@example.com" />
        </Field>
        <Field label="Password">
          <input required type="password" minLength={6} className={inputClass} value={form.password} onChange={(e) => update("password", e.target.value)} placeholder="At least 6 characters" />
        </Field>
        <Field label="City you operate in">
          <select className={inputClass} value={form.city} onChange={(e) => update("city", e.target.value)}>
            {CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>

        <span className="block text-sm font-medium text-ink mb-1.5">Vehicle type</span>
        <div className="grid grid-cols-3 gap-3 mb-4">
          {VEHICLES.map((v) => (
            <button
              type="button"
              key={v.value}
              onClick={() => update("vehicle_type", v.value)}
              className={`text-left border rounded-lg px-3 py-2.5 transition-colors ${
                form.vehicle_type === v.value ? "border-ink bg-ink text-paper" : "border-slate-300 hover:border-slate-400"
              }`}
            >
              <div className="font-semibold text-sm">{v.label}</div>
              <div className={`text-xs ${form.vehicle_type === v.value ? "text-slate-light" : "text-slate"}`}>{v.detail}</div>
            </button>
          ))}
        </div>

        {needsVehicleDetails && (
          <div className="grid sm:grid-cols-2 gap-x-4 border-t border-slate-200 pt-4 mb-2">
            <Field label={form.vehicle_type === "cab" ? "Car make/model" : "Bike make/model"}>
              <input required className={inputClass} value={form.vehicle_make} onChange={(e) => update("vehicle_make", e.target.value)} placeholder={form.vehicle_type === "cab" ? "Toyota Corolla" : "Honda CB125"} />
            </Field>
            <Field label="Plate number">
              <input required className={inputClass} value={form.vehicle_plate} onChange={(e) => update("vehicle_plate", e.target.value)} placeholder="LND-123XY" />
            </Field>
            <Field label="Driver's license / rider permit number">
              <input required className={inputClass} value={form.license_number} onChange={(e) => update("license_number", e.target.value)} placeholder="LIC-9987" />
            </Field>
          </div>
        )}

        <div className="border-t border-slate-200 pt-4 mb-4">
          <span className="block text-sm font-medium text-ink mb-2">Identity photo</span>
          <p className="text-xs text-slate mb-3">
            Required — this photo is used to verify it's really you every time you log in, and customers will see it once you accept their delivery.
          </p>
          {form.profile_photo ? (
            <div className="flex items-center gap-3">
              <img src={form.profile_photo} alt="Your captured photo" className="w-16 h-16 rounded-full object-cover border border-slate-300" />
              <button type="button" onClick={() => update("profile_photo", null)} className="text-xs font-semibold text-ink underline">
                Retake photo
              </button>
            </div>
          ) : (
            <FaceCapture onCapture={(photo) => update("profile_photo", photo)} title="Capture your face" />
          )}
        </div>

        {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

        <button disabled={loading || !form.profile_photo} className="w-full bg-route hover:bg-route-dark text-ink font-semibold rounded-lg px-4 py-2.5 transition-colors disabled:opacity-60">
          {loading ? "Submitting…" : "Submit application"}
        </button>
      </form>
      <p className="text-sm text-slate mt-6">
        Already have an account? <Link to="/login" className="text-ink font-semibold underline">Log in</Link>
      </p>
    </AuthLayout>
  );
}
