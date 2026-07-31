import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";

export default function RideCallback() {
  const { token } = useAuth();
  const [searchParams] = useSearchParams();
  const reference = searchParams.get("reference") || searchParams.get("trxref");
  const [status, setStatus] = useState("checking"); // checking | paid | failed | error
  const [error, setError] = useState("");

  useEffect(() => {
    if (!reference || !token) return;
    api.verifyRidePayment(token, reference)
      .then((data) => setStatus(data.payment_status === "paid" ? "paid" : "failed"))
      .catch((err) => { setError(err.message); setStatus("error"); });
  }, [reference, token]);

  return (
    <div className="max-w-md mx-auto px-5 py-20 text-center">
      {status === "checking" && (
        <>
          <div className="font-mono text-xs text-slate mb-2">CONFIRMING PAYMENT</div>
          <h1 className="font-display text-2xl font-semibold mb-2">Just a moment…</h1>
          <p className="text-sm text-slate">Confirming your payment with Paystack.</p>
        </>
      )}
      {status === "paid" && (
        <>
          <div className="font-mono text-xs text-emerald-600 mb-2">PAYMENT CONFIRMED</div>
          <h1 className="font-display text-2xl font-semibold mb-2">You're all set</h1>
          <p className="text-sm text-slate mb-6">We're finding you a nearby driver now.</p>
          <Link to="/rides" className="bg-route hover:bg-route-dark text-ink font-semibold rounded-lg px-6 py-3 transition-colors inline-block">
            View my ride
          </Link>
        </>
      )}
      {status === "failed" && (
        <>
          <div className="font-mono text-xs text-red-600 mb-2">PAYMENT NOT COMPLETED</div>
          <h1 className="font-display text-2xl font-semibold mb-2">Payment didn't go through</h1>
          <p className="text-sm text-slate mb-6">You can try again from your ride list.</p>
          <Link to="/rides" className="bg-ink hover:bg-ink-soft text-paper font-semibold rounded-lg px-6 py-3 transition-colors inline-block">
            Go to my rides
          </Link>
        </>
      )}
      {status === "error" && (
        <>
          <div className="font-mono text-xs text-red-600 mb-2">SOMETHING WENT WRONG</div>
          <p className="text-sm text-slate mb-6">{error || "Couldn't confirm payment. Check My rides for the latest status."}</p>
          <Link to="/rides" className="bg-ink hover:bg-ink-soft text-paper font-semibold rounded-lg px-6 py-3 transition-colors inline-block">
            Go to my rides
          </Link>
        </>
      )}
    </div>
  );
}
