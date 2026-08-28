import { useEffect, useState } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";

export default function GasCallback() {
  const [params] = useSearchParams();
  const { token } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState("verifying"); // verifying | paid | failed | error

  useEffect(() => {
    const reference = params.get("reference") || params.get("trxref");
    if (!reference || !token) { setStatus("error"); return; }

    api.verifyGasPayment(token, reference)
      .then((data) => {
        setStatus(data.status === "paid" ? "paid" : "failed");
        if (data.status === "paid") {
          setTimeout(() => navigate("/gas"), 1500);
        }
      })
      .catch(() => setStatus("error"));
  }, [params, token, navigate]);

  return (
    <div className="max-w-md mx-auto px-5 py-24 text-center">
      {status === "verifying" && (
        <>
          <div className="w-8 h-8 border-2 border-slate-300 border-t-ink dark:border-t-paper rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm text-slate dark:text-slate-light">Confirming your payment…</p>
        </>
      )}
      {status === "paid" && (
        <>
          <div className="text-3xl mb-3">✅</div>
          <h1 className="font-display text-xl font-semibold text-ink dark:text-paper mb-2">Payment confirmed</h1>
          <p className="text-sm text-slate dark:text-slate-light">Taking you to your orders…</p>
        </>
      )}
      {status === "failed" && (
        <>
          <div className="text-3xl mb-3">❌</div>
          <h1 className="font-display text-xl font-semibold text-ink dark:text-paper mb-2">Payment didn't go through</h1>
          <p className="text-sm text-slate dark:text-slate-light mb-6">Nothing was charged. You can try again from your orders page.</p>
          <Link to="/gas" className="text-sm font-semibold text-route-dark hover:underline">Back to gas orders →</Link>
        </>
      )}
      {status === "error" && (
        <>
          <h1 className="font-display text-xl font-semibold text-ink dark:text-paper mb-2">Something went wrong</h1>
          <p className="text-sm text-slate dark:text-slate-light mb-6">We couldn't confirm this payment. If you were charged, contact support with your reference.</p>
          <Link to="/gas" className="text-sm font-semibold text-route-dark hover:underline">Back to gas orders →</Link>
        </>
      )}
    </div>
  );
}
