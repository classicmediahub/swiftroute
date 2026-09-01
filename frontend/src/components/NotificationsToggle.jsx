import { useEffect, useState } from "react";
import { Bell, BellOff } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { isPushSupported, subscribeToPush, unsubscribeFromPush } from "../lib/push";

// Drop this anywhere in the customer dashboard (a settings panel, the
// header, wherever makes sense) — it's fully self-contained. Reflects
// actual browser permission state on mount rather than assuming, since a
// person may have granted/denied permission outside this app entirely
// (e.g. via the browser's own site settings).
export default function NotificationsToggle({ className = "" }) {
  const { token } = useAuth();
  const [supported, setSupported] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isPushSupported()) { setSupported(false); return; }
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setEnabled(Boolean(sub)))
      .catch(() => {});
  }, []);

  async function handleToggle() {
    setBusy(true);
    setError("");
    try {
      if (enabled) {
        await unsubscribeFromPush(token);
        setEnabled(false);
      } else {
        const result = await subscribeToPush(token);
        if (result.subscribed) {
          setEnabled(true);
        } else if (result.reason === "denied") {
          setError("Notifications are blocked for this site in your browser settings.");
        }
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!supported) return null;

  return (
    <div className={className}>
      <button
        type="button"
        onClick={handleToggle}
        disabled={busy}
        className="flex items-center gap-2 text-sm font-medium text-ink dark:text-paper disabled:opacity-50"
      >
        {enabled ? <Bell className="w-4 h-4 text-route-dark" /> : <BellOff className="w-4 h-4 text-slate dark:text-slate-light" />}
        {enabled ? "Notifications on" : "Turn on delivery updates"}
      </button>
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  );
}
