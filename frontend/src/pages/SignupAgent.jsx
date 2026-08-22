import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";
import AuthLayout, { Field, inputClass } from "../components/AuthLayout";
import LivenessCheck from "../components/LivenessCheck";
import WizardStepper from "../components/WizardStepper";
import { useWizardSteps } from "../hooks/useWizardSteps";
import Button from "../components/Button";

const VEHICLES = [
  { value: "self", label: "Self", detail: "On foot, local errands" },
  { value: "bike", label: "Bike", detail: "Dispatch rider" },
  { value: "cab", label: "Cab", detail: "Car / bulkier loads" },
];

const CITIES = ["Lagos", "Ota", "Ogun", "Abuja", "Port Harcourt", "Ibadan", "Kano", "Enugu", "Benin City"];

const STEPS = [
  { key: "account", label: "Account" },
  { key: "verify", label: "Verify ID" },
  { key: "vehicle", label: "Vehicle" },
  { key: "photo", label: "Photo" },
  { key: "confirm", label: "Confirm" },
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

  // Clears the error the moment a step change happens — a validation
  // message from "you forgot your NIN" on step 2 has no business still
  // being on screen after successfully navigating to step 4.
  const wizard = useWizardSteps(STEPS.length, { onStepChange: () => setError("") });

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

  // Per-step validation lives here, next to the step definitions, rather
  // than centralized in the wizard hook — the hook only manages "which
  // step am I on", it has no business knowing what a valid NIN looks like.
  function validateStep(index) {
    if (index === 0) {
      if (!form.full_name.trim()) return "Enter your full name.";
      if (!form.phone.trim()) return "Enter your phone number.";
      if (!EMAIL_RE.test(form.email)) return "Enter a valid email address.";
      if (form.password.length < 6) return "Password must be at least 6 characters.";
      return null;
    }
    if (index === 1) {
      if (!form.date_of_birth) return "Enter your date of birth.";
      if (form.nin.length !== 11) return "NIN must be exactly 11 digits.";
      return null;
    }
    if (index === 2) {
      if (needsVehicleDetails) {
        if (!form.vehicle_make.trim()) return `Enter your ${form.vehicle_type === "cab" ? "car" : "bike"} make/model.`;
        if (!form.vehicle_plate.trim()) return "Enter your plate number.";
        if (!form.license_number.trim()) return "Enter your license/permit number.";
      }
      return null;
    }
    if (index === 3) {
      if (!identityComplete) return "Complete the liveness check before continuing.";
      return null;
    }
    return null;
  }

  function handleNext() {
    const validationError = validateStep(wizard.currentIndex);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError("");
    wizard.next();
  }

  async function handleSubmit(e) {
    e.preventDefault();
    // Belt-and-suspenders: re-check everything, not just the current
    // step — someone could reach step 5, click a completed step's circle
    // to jump back, change an answer to something invalid, and never
    // click "Next" again to re-trigger that step's own validation.
    for (let i = 0; i < STEPS.length - 1; i++) {
      const validationError = validateStep(i);
      if (validationError) {
        setError(validationError);
        wizard.goTo(i);
        return;
      }
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

  const maskedNin = form.nin ? `${"•".repeat(Math.max(0, form.nin.length - 4))}${form.nin.slice(-4)}` : "—";

  return (
    <AuthLayout
      eyebrow="[WB-02] DELIVER & EARN"
      title="Register as an agent"
      subtitle="Your account needs admin approval before you can accept deliveries."
      wide
    >
      {form.referral_code && (
        <p className="text-xs text-route bg-route/10 border border-route/30 rounded-lg px-3 py-2 mb-4">
          Referral code <span className="font-mono font-semibold">{form.referral_code}</span> applied.
        </p>
      )}

      <WizardStepper steps={STEPS} currentIndex={wizard.currentIndex} onStepClick={wizard.goTo} className="mb-8" />

      <form onSubmit={handleSubmit}>
        {/* STEP 1 — account */}
        {wizard.currentIndex === 0 && (
          <div>
            <div className="grid sm:grid-cols-2 gap-x-4">
              <Field label="Full name">
                <input className={inputClass} value={form.full_name} onChange={(e) => update("full_name", e.target.value)} placeholder="Tunde Bello" />
              </Field>
              <Field label="Phone number">
                <input className={inputClass} value={form.phone} onChange={(e) => update("phone", e.target.value)} placeholder="0803 333 4444" />
              </Field>
            </div>
            <Field label="Email">
              <input type="email" className={inputClass} value={form.email} onChange={(e) => update("email", e.target.value)} placeholder="you@example.com" />
            </Field>
            <Field label="Password">
              <input type="password" minLength={6} className={inputClass} value={form.password} onChange={(e) => update("password", e.target.value)} placeholder="At least 6 characters" />
            </Field>
            <Field label="City you operate in">
              <select className={inputClass} value={form.city} onChange={(e) => update("city", e.target.value)}>
                {CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
          </div>
        )}

        {/* STEP 2 — identity verification */}
        {wizard.currentIndex === 1 && (
          <div>
            <p className="text-xs text-slate dark:text-slate-light mb-3">
              Required for every agent — bike, cab, and self. We check your NIN is a valid, well-formed
              number; date of birth is used for a basic sanity check, not matched against an external record.
            </p>
            <div className="grid sm:grid-cols-2 gap-x-4">
              <Field label="Date of birth">
                <input
                  type="date"
                  className={inputClass}
                  value={form.date_of_birth}
                  onChange={(e) => update("date_of_birth", e.target.value)}
                />
              </Field>
              <Field label="NIN (National Identification Number)">
                <input
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
        )}

        {/* STEP 3 — vehicle */}
        {wizard.currentIndex === 2 && (
          <div>
            <span className="block text-sm font-medium text-ink dark:text-paper mb-1.5">Vehicle type</span>
            <div className="grid grid-cols-3 gap-3 mb-4">
              {VEHICLES.map((v) => (
                <button
                  type="button"
                  key={v.value}
                  onClick={() => update("vehicle_type", v.value)}
                  className={`text-left border rounded-lg px-3 py-2.5 transition-colors ${
                    form.vehicle_type === v.value
                      ? "border-ink dark:border-paper bg-ink text-paper dark:bg-paper dark:text-ink"
                      : "border-slate-300 dark:border-line hover:border-slate-400 dark:hover:border-slate-light"
                  }`}
                >
                  <div className="font-semibold text-sm">{v.label}</div>
                  <div className={`text-xs ${form.vehicle_type === v.value ? "text-slate-light dark:text-slate" : "text-slate dark:text-slate-light"}`}>{v.detail}</div>
                </button>
              ))}
            </div>

            {needsVehicleDetails && (
              <div className="grid sm:grid-cols-2 gap-x-4">
                <Field label={form.vehicle_type === "cab" ? "Car make/model" : "Bike make/model"}>
                  <input className={inputClass} value={form.vehicle_make} onChange={(e) => update("vehicle_make", e.target.value)} placeholder={form.vehicle_type === "cab" ? "Toyota Corolla" : "Honda CB125"} />
                </Field>
                <Field label="Plate number">
                  <input className={inputClass} value={form.vehicle_plate} onChange={(e) => update("vehicle_plate", e.target.value)} placeholder="LND-123XY" />
                </Field>
                <Field label="Driver's license / rider permit number">
                  <input className={inputClass} value={form.license_number} onChange={(e) => update("license_number", e.target.value)} placeholder="LIC-9987" />
                </Field>
              </div>
            )}
          </div>
        )}

        {/* STEP 4 — photo / liveness */}
        {wizard.currentIndex === 3 && (
          <div>
            <p className="text-xs text-slate dark:text-slate-light mb-3">
              Required — confirms a real person is signing up, not a photo of a photo. This picture is also
              what customers see once you accept their delivery, and what your login selfie is compared against.
            </p>
            {form.profile_photo ? (
              <div className="flex items-center gap-3">
                <img src={form.profile_photo} alt="Your captured photo" className="w-16 h-16 rounded-full object-cover border border-slate-300 dark:border-line" />
                <button type="button" onClick={handleRetakePhoto} className="text-xs font-semibold text-ink dark:text-paper underline">
                  Retake photo
                </button>
              </div>
            ) : (
              <LivenessCheck onCapture={handleLivenessCapture} title="Capture your face" />
            )}
          </div>
        )}

        {/* STEP 5 — confirm & submit */}
        {wizard.currentIndex === 4 && (
          <div>
            <p className="text-xs text-slate dark:text-slate-light mb-4">
              Check everything below before submitting — you can still jump back to any step to fix something.
            </p>
            <dl className="border border-slate-200 dark:border-line rounded-xl divide-y divide-slate-200 dark:divide-line text-sm">
              <SummaryRow label="Name" value={form.full_name} />
              <SummaryRow label="Phone" value={form.phone} />
              <SummaryRow label="Email" value={form.email} />
              <SummaryRow label="City" value={form.city} />
              <SummaryRow label="Date of birth" value={form.date_of_birth} />
              <SummaryRow label="NIN" value={maskedNin} mono />
              <SummaryRow label="Vehicle" value={VEHICLES.find((v) => v.value === form.vehicle_type)?.label} />
              {needsVehicleDetails && (
                <>
                  <SummaryRow label="Make/model" value={form.vehicle_make} />
                  <SummaryRow label="Plate number" value={form.vehicle_plate} mono />
                  <SummaryRow label="License number" value={form.license_number} mono />
                </>
              )}
              <div className="flex items-center justify-between px-4 py-2.5">
                <dt className="text-slate dark:text-slate-light">Photo</dt>
                <dd>
                  {form.profile_photo && (
                    <img src={form.profile_photo} alt="Captured" className="w-10 h-10 rounded-full object-cover border border-slate-300 dark:border-line" />
                  )}
                </dd>
              </div>
            </dl>
          </div>
        )}

        {error && <p className="text-sm text-signal mt-4">{error}</p>}

        <div className="flex items-center gap-3 mt-6">
          {!wizard.isFirst && (
            <Button type="button" variant="secondary" onClick={wizard.back}>
              Back
            </Button>
          )}
          {wizard.isLast ? (
            <Button type="submit" loading={loading} loadingText="Verifying your details…" fullWidth className="flex-1">
              Submit application
            </Button>
          ) : (
            <Button type="button" onClick={handleNext} fullWidth className="flex-1">
              Continue
            </Button>
          )}
        </div>
      </form>
      <p className="text-sm text-slate dark:text-slate-light mt-6">
        Already have an account? <Link to="/login" className="text-ink dark:text-paper font-semibold underline">Log in</Link>
      </p>
    </AuthLayout>
  );
}

function SummaryRow({ label, value, mono }) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5">
      <dt className="text-slate dark:text-slate-light">{label}</dt>
      <dd className={`text-ink dark:text-paper font-medium ${mono ? "font-mono text-xs" : ""}`}>{value || "—"}</dd>
    </div>
  );
}
