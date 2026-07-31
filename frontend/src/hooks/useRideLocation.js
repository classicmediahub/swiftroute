import { useEffect, useRef } from "react";
import { api } from "../api";

const PING_INTERVAL_MS = 8000; // tighter than phase 1's 12s general broadcast —
// a rider actively watching their driver approach benefits from a
// smoother-feeling live map more than a passive homepage map does.

// Separate from useLiveLocation (phase 1's "online and visible on the
// homepage map" broadcast, which keeps running the whole time regardless).
// This one only exists to update a SPECIFIC ride's current_lat/lng while
// that ride is actually active — it's fine, and expected, for both hooks
// to be running at once during an active trip.
export function useRideLocation(token, rideId) {
  const watchIdRef = useRef(null);
  const intervalRef = useRef(null);
  const lastPositionRef = useRef(null);

  useEffect(() => {
    if (!rideId || !token) return;
    if (!navigator.geolocation) return;

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        lastPositionRef.current = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      },
      () => {
        // Silently skip — same reasoning as useLiveLocation: a denied/
        // unavailable GPS should never block the rest of the dashboard.
      },
      { enableHighAccuracy: true, maximumAge: 10000 }
    );

    async function sendPing() {
      const pos = lastPositionRef.current;
      if (!pos) return;
      try {
        await api.updateRideLocation(token, rideId, pos);
      } catch {
        // One missed ping isn't worth surfacing — next interval retries.
      }
    }

    intervalRef.current = setInterval(sendPing, PING_INTERVAL_MS);

    return () => {
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [token, rideId]);
}
