import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";
import AuthLayout, { Field, inputClass } from "../components/AuthLayout";

export default function SignupCustomer() {
  const [form, setForm] = useState({ full_name: "", email: "", phone: "", password: "", is_business: false, company_name: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  function update(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data = await api.signupCustomer(form);
      login(data.token, data.user, null);
      navigate("/customer/dashboard");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout eyebrow="[WB-01] SEND DELIVERIES" title="Create your customer account">
      <form onSubmit={handleSubmit}>
        <Field label="Full name">
          <input required className={inputClass} value={form.full_name} onChange={(e) => update("full_name", e.target.value)} placeholder="Amaka Obi" />
        </Field>
        <Field label="Email">
          <input required type="email" className={inputClass} value={form.email} onChange={(e) => update("email", e.target.value)} placeholder="you@example.com" />
        </Field>
        <Field label="Phone number">
          <input required className={inputClass} value={form.phone} onChange={(e) => update("phone", e.target.value)} placeholder="0801 234 5678" />
        </Field>
        <Field label="Password">
          <input required type="password" minLength={6} className={inputClass} value={form.password} onChange={(e) => update("password", e.target.value)} placeholder="At least 6 characters" />
        </Field>

        <label className="flex items-start gap-2.5 mb-4 cursor-pointer">
          <input
            type="checkbox"
            checked={form.is_business}
            onChange={(e) => update("is_business", e.target.checked)}
            className="mt-0.5"
          />
          <span className="text-sm text-ink">
            I'm signing up as a business
            <span className="block text-xs text-slate">Unlocks bulk delivery uploads, invoices, and spend reports.</span>
          </span>
        </label>

        {form.is_business && (
          <Field label="Company name">
            <input required className={inputClass} value={form.company_name} onChange={(e) => update("company_name", e.target.value)} placeholder="Obi Trading Co" />
          </Field>
        )}

        {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

        <button disabled={loading} className="w-full bg-route hover:bg-route-dark text-ink font-semibold rounded-lg px-4 py-2.5 transition-colors disabled:opacity-60">
          {loading ? "Creating account…" : "Create account"}
        </button>
      </form>
      <p className="text-sm text-slate mt-6">
        Already have an account? <Link to="/login" className="text-ink font-semibold underline">Log in</Link>
      </p>
    </AuthLayout>
  );
}
