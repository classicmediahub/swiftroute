import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";

export default function PaymentCallback() {
  const [params] = useSearchParams();
  const { token } = useAuth();
  const [state, setState] = useState("checking"); // checking | paid | failed | error
  const [message, setMessage] = useState("");

  useEffect(() => {
    const reference = params.get("reference") || params.get("trxref");
    if (!reference) {
      setState("error");
      setMessage("No payment reference was found in the URL.");
      return;
    }
    api
      .verifyPayment(token, reference)
      .then((data) => setState(data.payment_status === "paid" ? "paid" : "failed"))
      .catch((err) => {
        setState("error");
        setMessage(err.message);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="max-w-md mx-auto px-5 py-24 text-center">
      {state === "checking" && (
        <>
          <div className="font-mono text-xs text-slate mb-3">CONFIRMING PAYMENT</div>
          <h1 className="font-display text-2xl font-semibold mb-2">Hold on a moment…</h1>
          <p className="text-slate text-sm">We're confirming your payment with Paystack.</p>
        </>
      )}
      {state === "paid" && (
        <>
          <div className="font-mono text-xs text-delivered mb-3">PAYMENT SUCCESSFUL</div>
          <h1 className="font-display text-2xl font-semibold mb-2">You're all set 🎉</h1>
          <p className="text-slate text-sm mb-6">Your delivery is paid for and now visible to agents.</p>
          <Link to="/customer/dashboard" className="bg-route hover:bg-route-dark text-ink font-semibold rounded-lg px-6 py-3 inline-block transition-colors">
            Go to dashboard
          </Link>
        </>
      )}
      {state === "failed" && (
        <>
          <div className="font-mono text-xs text-red-600 mb-3">PAYMENT NOT COMPLETED</div>
          <h1 className="font-display text-2xl font-semibold mb-2">Payment didn't go through</h1>
          <p className="text-slate text-sm mb-6">No charge was completed. You can try again from your dashboard.</p>
          <Link to="/customer/dashboard" className="bg-ink hover:bg-ink-soft text-paper font-semibold rounded-lg px-6 py-3 inline-block transition-colors">
            Back to dashboard
          </Link>
        </>
      )}
      {state === "error" && (
        <>
          <div className="font-mono text-xs text-red-600 mb-3">SOMETHING WENT WRONG</div>
          <h1 className="font-display text-2xl font-semibold mb-2">We couldn't confirm this payment</h1>
          <p className="text-slate text-sm mb-6">{message || "Please check your dashboard, or try again from there."}</p>
          <Link to="/customer/dashboard" className="bg-ink hover:bg-ink-soft text-paper font-semibold rounded-lg px-6 py-3 inline-block transition-colors">
            Back to dashboard
          </Link>
        </>
      )}
    </div>
  );
}
