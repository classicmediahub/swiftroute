import { useState, useEffect, useCallback } from "react";
import { api } from "../api";

const POLL_INTERVAL_MS = 10000; // only runs while an alert is active — watching for an admin to resolve it

export function useSOS(token, tripType, tripId) {
  const [alert, setAlert] = useState(null); // null, or { status: 'active' | 'resolved', ... }
  const [triggering, setTriggering] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(() => {
    if (!tripId) return;
    api.myActiveSOS(token, tripType, tripId).then(setAlert).catch(() => {});
  }, [token, tripType, tripId]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    if (!alert || alert.status !== "active") return;
    const interval = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [alert, refresh]);

  const trigger = useCallback(async () => {
    setTriggering(true);
    setError("");
    // Best-effort location — a denied permission or a slow GPS fix should
    // never block the actual alert from going out. Five seconds is a
    // deliberately short timeout for exactly that reason.
    let coords = {};
    try {
      const position = await new Promise((resolve, reject) => {
        if (!navigator.geolocation) return reject(new Error("Geolocation unavailable"));
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 });
      });
      coords = { lat: position.coords.latitude, lng: position.coords.longitude };
    } catch {
      // proceed without location
    }
    try {
      const data = await api.triggerSOS(token, { trip_type: tripType, trip_id: tripId, ...coords });
      setAlert(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setTriggering(false);
    }
  }, [token, tripType, tripId]);

  return { alert, triggering, error, trigger };
}
