import { useEffect, useRef, useState } from "react";
import { api } from "../api";

export default function ShareLocationToggle({ deliveryId, token, active }) {
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState("");
  const watchIdRef = useRef(null);
  const lastSentRef = useRef(0);

  function stopSharing() {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setSharing(false);
  }

  function startSharing() {
    if (!navigator.geolocation) {
      setError("Location isn't supported on this device.");
      return;
    }
    setError("");
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const now = Date.now();
        if (now - lastSentRef.current < 8000) return; // throttle sends to ~every 8s
        lastSentRef.current = now;
        api
          .updateLocation(token, deliveryId, { lat: pos.coords.latitude, lng: pos.coords.longitude })
          .catch(() => {});
      },
      (err) => setError(err.code === 1 ? "Location permission was denied." : "Couldn't get your location."),
      { enableHighAccuracy: true, maximumAge: 5000 }
    );
    watchIdRef.current = id;
    setSharing(true);
  }

  // Stop automatically if the delivery moves out of an active state
  // (delivered, or otherwise no longer trackable).
  useEffect(() => {
    if (!active && sharing) stopSharing();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  useEffect(() => stopSharing, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!active) return null;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <button
        type="button"
        onClick={sharing ? stopSharing : startSharing}
        className={`text-xs font-semibold rounded-lg px-3 py-1.5 transition-colors ${
          sharing ? "bg-delivered text-white hover:bg-emerald-600" : "bg-ink text-paper hover:bg-ink-soft"
        }`}
      >
        {sharing ? "Sharing location ✓" : "Share my location"}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
