import { useEffect, useRef } from "react";
import { api } from "../api";

const PING_INTERVAL_MS = 12000;

// Broadcasts the agent's live position while this hook is mounted and
// `enabled` is true — no separate online/offline toggle, being mounted
// with permission granted IS being online (see routes/agent.js). Sends an
// explicit "offline" signal on unmount as a best-effort cleanup; the
// backend's staleness filter is what actually guarantees a closed tab
// disappears from the public map even if this never fires.
export function useLiveLocation(token, enabled) {
  const watchIdRef = useRef(null);
  const intervalRef = useRef(null);
  const lastPositionRef = useRef(null);

  useEffect(() => {
    if (!enabled || !token) return;
    if (!navigator.geolocation) return;

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        lastPositionRef.current = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      },
      () => {
        // Permission denied or unavailable — silently skip broadcasting.
        // This must never block the rest of the dashboard from working.
      },
      { enableHighAccuracy: true, maximumAge: 15000 }
    );

    async function sendPing() {
      const pos = lastPositionRef.current;
      if (!pos) return;
      try {
        await api.agentUpdateLocation(token, pos);
      } catch {
        // A single missed ping isn't worth surfacing to the agent — next
        // interval tries again, and the backend's staleness window is
        // generous enough to absorb an occasional dropped request.
      }
    }

    intervalRef.current = setInterval(sendPing, PING_INTERVAL_MS);

    function goOffline() {
      api.agentGoOffline(token).catch(() => {});
    }
    window.addEventListener("beforeunload", goOffline);

    return () => {
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
      if (intervalRef.current) clearInterval(intervalRef.current);
      window.removeEventListener("beforeunload", goOffline);
      goOffline();
    };
  }, [token, enabled]);
}
