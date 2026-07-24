import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api";
import AuthLayout from "../components/AuthLayout";

export default function VerifyEmail() {
  const [params] = useSearchParams();
  const token = params.get("token");
  const [status, setStatus] = useState("verifying"); // 'verifying' | 'success' | 'error'
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setMessage("This link is missing its verification token.");
      return;
    }
    api
      .verifyEmail(token)
      .then(() => {
        setStatus("success");
        setMessage("Your email has been verified.");
      })
      .catch((err) => {
        setStatus("error");
        setMessage(err.message);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <AuthLayout eyebrow="ACCOUNT" title="Email verification">
      {status === "verifying" && <p className="text-sm text-slate">Verifying your email…</p>}

      {status === "success" && (
        <div>
          <p className="text-sm text-ink mb-4">{message}</p>
          <Link to="/login" className="text-sm font-semibold text-ink underline">
            Continue to log in
          </Link>
        </div>
      )}

      {status === "error" && (
        <div>
          <p className="text-sm text-red-600 mb-4">{message}</p>
          <p className="text-sm text-slate">
            You can request a new link from your account settings, or{" "}
            <Link to="/login" className="text-ink font-semibold underline">log in</Link> and try again.
          </p>
        </div>
      )}
    </AuthLayout>
  );
}
