import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";
import AuthLayout, { Field, inputClass } from "../components/AuthLayout";

export default function Login() {
  const [form, setForm] = useState({ email: "", password: "" });
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
      const data = await api.login(form);
      login(data.token, data.user, data.agent_profile);
      const dest =
        data.user.role === "customer" ? "/customer/dashboard" :
        data.user.role === "agent" ? "/agent/dashboard" : "/admin/dashboard";
      navigate(dest);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout eyebrow="WELCOME BACK" title="Log in to SwiftRoute">
      <form onSubmit={handleSubmit}>
        <Field label="Email">
          <input required type="email" className={inputClass} value={form.email} onChange={(e) => update("email", e.target.value)} placeholder="you@example.com" />
        </Field>
        <Field label="Password">
          <input required type="password" className={inputClass} value={form.password} onChange={(e) => update("password", e.target.value)} placeholder="Your password" />
        </Field>

        {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

        <button disabled={loading} className="w-full bg-route hover:bg-route-dark text-ink font-semibold rounded-lg px-4 py-2.5 transition-colors disabled:opacity-60">
          {loading ? "Logging in…" : "Log in"}
        </button>
      </form>
      <p className="text-sm text-slate mt-6">
        New to SwiftRoute? <Link to="/signup" className="text-ink font-semibold underline">Create an account</Link>
      </p>
    </AuthLayout>
  );
}
