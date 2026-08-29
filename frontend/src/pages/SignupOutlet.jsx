import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";
import AuthLayout, { Field, inputClass } from "../components/AuthLayout";

const CATEGORIES = [
  { value: "restaurant", label: "Restaurant" },
  { value: "eatery", label: "Eatery / local food" },
  { value: "supermarket", label: "Supermarket" },
  { value: "pharmacy", label: "Pharmacy" },
  { value: "other", label: "Other" },
];

const CITIES = ["Lagos", "Ota", "Ogun", "Abuja", "Port Harcourt", "Ibadan", "Kano", "Enugu", "Benin City"];

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function SignupOutlet() {
  const [params] = useSearchParams();
  const [form, setForm] = useState({
    full_name: "", email: "", phone: "", password: "",
    business_name: "", category: "restaurant", description: "",
    address: "", city: "Lagos", open_time: "09:00", close_time: "21:00",
    logo_photo: null,
    referral_code: params.get("ref") || "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  function update(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleLogoChange(file) {
    if (!file) return;
    const base64 = await fileToBase64(file);
    update("logo_photo", base64);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data = await api.signupOutlet(form);
      login(data.token, data.user, null, data.outlet_profile);
      navigate("/outlet/dashboard");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout eyebrow="[WB-04] PARTNER WITH US" title="Register your business" subtitle="Requires admin approval before you can start receiving orders." wide>
      <form onSubmit={handleSubmit}>
        {form.referral_code && (
          <p className="text-xs text-route bg-route/10 border border-route/30 rounded-lg px-3 py-2 mb-4">
            Referral code <span className="font-mono font-semibold">{form.referral_code}</span> applied.
          </p>
        )}

        <div className="mb-6">
          <div className="text-xs font-mono text-slate dark:text-slate-light uppercase mb-3">Your account</div>
          <div className="grid sm:grid-cols-2 gap-x-4">
            <Field label="Your full name">
              <input required className={inputClass} value={form.full_name} onChange={(e) => update("full_name", e.target.value)} placeholder="Amaka Obi" />
            </Field>
            <Field label="Phone number">
              <input required className={inputClass} value={form.phone} onChange={(e) => update("phone", e.target.value)} placeholder="0801 234 5678" />
            </Field>
          </div>
          <Field label="Email">
            <input required type="email" className={inputClass} value={form.email} onChange={(e) => update("email", e.target.value)} placeholder="you@example.com" />
          </Field>
          <Field label="Password">
            <input required type="password" minLength={6} className={inputClass} value={form.password} onChange={(e) => update("password", e.target.value)} placeholder="At least 6 characters" />
          </Field>
        </div>

        <div className="mb-6">
          <div className="text-xs font-mono text-slate dark:text-slate-light uppercase mb-3">Business details</div>
          <Field label="Business name">
            <input required className={inputClass} value={form.business_name} onChange={(e) => update("business_name", e.target.value)} placeholder="Mama Nkechi's Kitchen" />
          </Field>
          <div className="grid sm:grid-cols-2 gap-x-4">
            <Field label="Category">
              <select className={inputClass} value={form.category} onChange={(e) => update("category", e.target.value)}>
                {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </Field>
            <Field label="City">
              <select className={inputClass} value={form.city} onChange={(e) => update("city", e.target.value)}>
                {CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Business address">
            <input required className={inputClass} value={form.address} onChange={(e) => update("address", e.target.value)} placeholder="14 Allen Avenue, Ikeja" />
          </Field>
          <Field label="Short description (optional)">
            <input className={inputClass} value={form.description} onChange={(e) => update("description", e.target.value)} placeholder="Home-style Nigerian dishes, ready in 20 minutes" />
          </Field>
          <div className="grid sm:grid-cols-2 gap-x-4">
            <Field label="Opens at">
              <input type="time" className={inputClass} value={form.open_time} onChange={(e) => update("open_time", e.target.value)} />
            </Field>
            <Field label="Closes at">
              <input type="time" className={inputClass} value={form.close_time} onChange={(e) => update("close_time", e.target.value)} />
            </Field>
          </div>
          <Field label="Logo (optional)">
            {form.logo_photo ? (
              <div className="flex items-center gap-3">
                <img src={form.logo_photo} alt="Logo preview" className="w-14 h-14 rounded-lg object-cover border border-slate-300 dark:border-line" />
                <button type="button" onClick={() => update("logo_photo", null)} className="text-xs font-semibold text-ink dark:text-paper underline">
                  Remove
                </button>
              </div>
            ) : (
              <label className="flex items-center justify-center border border-dashed border-slate-300 dark:border-line rounded-lg px-3.5 py-4 text-sm text-slate dark:text-slate-light cursor-pointer hover:border-slate-400">
                Upload a logo
                <input type="file" accept="image/*" className="hidden" onChange={(e) => handleLogoChange(e.target.files[0])} />
              </label>
            )}
          </Field>
        </div>

        {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

        <button disabled={loading} className="w-full bg-route hover:bg-route-dark text-ink font-semibold rounded-lg px-4 py-2.5 transition-colors disabled:opacity-60">
          {loading ? "Creating account…" : "Register business"}
        </button>
      </form>
      <p className="text-sm text-slate dark:text-slate-light mt-6">
        Already have an account? <Link to="/login" className="text-ink dark:text-paper font-semibold underline">Log in</Link>
      </p>
    </AuthLayout>
  );
}
