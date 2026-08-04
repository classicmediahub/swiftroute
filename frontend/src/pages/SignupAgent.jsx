import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";
import AuthLayout, { Field, inputClass } from "../components/AuthLayout";
import LivenessCheck from "../components/LivenessCheck";

const VEHICLES = [
  { value: "self", label: "Self", detail: "On foot, local errands" },
  { value: "bike", label: "Bike", detail: "Dispatch rider" },
  { value: "cab", label: "Cab", detail: "Car / bulkier loads" },
];

const CITIES = ["Lagos", "Ota", "Ogun", "Abuja", "Port Harcourt", "Ibadan", "Kano", "Enugu", "Benin City"];

export default function SignupAgent() {
  const [params] = useSearchParams();
  const [form, setForm] = useState({
    full_name: "", email: "", phone: "", password: "",
    vehicle_type: "bike", vehicle_make: "", vehicle_plate: "", license_number: "", city: "Lagos",
    profile_photo: null, date_of_birth: "", nin: "",
    liveness_challenge: null, liveness_samples: null,
    referral_code: params.get("ref") || "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  function update(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function handleLivenessCapture({ photo, challenge, samples }) {
    setForm((f) => ({ ...f, profile_photo: photo, liveness_challenge: challenge, liveness_samples: samples }));
  }

  function handleRetakePhoto() {
    setForm((f) => ({ ...f, profile_photo: null, liveness_challenge: null, liveness_samples: null }));
  }

  const needsVehicleDetails = form.vehicle_type === "bike" || form.vehicle_type === "cab";
  const identityComplete = Boolean(form.profile_photo && form.liveness_challenge && form.liveness_samples);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!identityComplete) {
      setError("Complete the liveness check below before submitting.");
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
        {form.referral_code && (
          <p className="text-xs text-route bg-route/10 border border-route/30 rounded-lg px-3 py-2 mb-4">
            Referral code <span className="font-mono font-semibold">{form.referral_code}</span> applied.
          </p>
        )}
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

        <div className="border-t border-slate-200 pt-4 mb-2">
          <span className="block text-sm font-medium text-ink mb-1.5">Identity verification</span>
          <p className="text-xs text-slate mb-3">
            Required for every agent — bike, cab, and self. We check your NIN is a valid, well-formed
            number; date of birth is used for a basic sanity check, not matched against an external record.
          </p>
          <div className="grid sm:grid-cols-2 gap-x-4">
            <Field label="Date of birth">
              <input
                required
                type="date"
                className={inputClass}
                value={form.date_of_birth}
                onChange={(e) => update("date_of_birth", e.target.value)}
              />
            </Field>
            <Field label="NIN (National Identification Number)">
              <input
                required
                inputMode="numeric"
                pattern="\d{11}"
                maxLength={11}
                className={inputClass}
                value={form.nin}
                onChange={(e) => update("nin", e.target.value.replace(/\D/g, "").slice(0, 11))}
                placeholder="11-digit NIN"
              />
            </Field>
          </div>
        </div>

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
          <span className="block text-sm font-medium text-ink mb-2">Identity photo — liveness check</span>
          <p className="text-xs text-slate mb-3">
            Required — confirms a real person is signing up, not a photo of a photo. This picture is also
            what customers see once you accept their delivery, and what your login selfie is compared against.
          </p>
          {form.profile_photo ? (
            <div className="flex items-center gap-3">
              <img src={form.profile_photo} alt="Your captured photo" className="w-16 h-16 rounded-full object-cover border border-slate-300" />
              <button type="button" onClick={handleRetakePhoto} className="text-xs font-semibold text-ink underline">
                Retake photo
              </button>
            </div>
          ) : (
            <LivenessCheck onCapture={handleLivenessCapture} title="Capture your face" />
          )}
        </div>

        {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

        <button disabled={loading || !identityComplete} className="w-full bg-route hover:bg-route-dark text-ink font-semibold rounded-lg px-4 py-2.5 transition-colors disabled:opacity-60">
          {loading ? "Verifying your details…" : "Submit application"}
        </button>
      </form>
      <p className="text-sm text-slate mt-6">
        Already have an account? <Link to="/login" className="text-ink font-semibold underline">Log in</Link>
      </p>
    </AuthLayout>
  );
}
