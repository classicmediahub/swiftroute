import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";
import AuthLayout, { Field, inputClass } from "../components/AuthLayout";

export default function SignupAdmin() {
  const [form, setForm] = useState({ full_name: "", email: "", phone: "", password: "", invite_code: "" });
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
      const data = await api.signupAdmin(form);
      login(data.token, data.user, null);
      navigate("/admin/dashboard");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout eyebrow="[WB-03] PLATFORM ADMIN" title="Create an admin account" subtitle="Requires a valid invite code from an existing admin.">
      <form onSubmit={handleSubmit}>
        <Field label="Full name">
          <input required className={inputClass} value={form.full_name} onChange={(e) => update("full_name", e.target.value)} placeholder="Site Admin" />
        </Field>
        <Field label="Email">
          <input required type="email" className={inputClass} value={form.email} onChange={(e) => update("email", e.target.value)} placeholder="admin@swiftroute.com" />
        </Field>
        <Field label="Phone number">
          <input required className={inputClass} value={form.phone} onChange={(e) => update("phone", e.target.value)} placeholder="0805 555 6666" />
        </Field>
        <Field label="Password">
          <input required type="password" minLength={6} className={inputClass} value={form.password} onChange={(e) => update("password", e.target.value)} placeholder="At least 6 characters" />
        </Field>
        <Field label="Admin invite code">
          <input required className={`${inputClass} font-mono`} value={form.invite_code} onChange={(e) => update("invite_code", e.target.value)} placeholder="SWIFTROUTE-ADMIN-2026" />
        </Field>

        {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

        <button disabled={loading} className="w-full bg-ink hover:bg-ink-soft text-paper font-semibold rounded-lg px-4 py-2.5 transition-colors disabled:opacity-60">
          {loading ? "Creating account…" : "Create admin account"}
        </button>
      </form>
      <p className="text-sm text-slate mt-6">
        Already have an account? <Link to="/login" className="text-ink font-semibold underline">Log in</Link>
      </p>
    </AuthLayout>
  );
}
