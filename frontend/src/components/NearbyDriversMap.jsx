import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { api } from "../api";

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;
const LAGOS_CENTER = { lat: 6.5244, lng: 3.3792 };
const POLL_INTERVAL_MS = 8000;

// Read-only public map — no login, no booking flow yet (phase 1 of rides,
// see the README this shipped with). Just shows currently-online cab
// agents as a live-feeling "cars near you" home-screen map, the way
// Bolt's app opens. Reuses the same mapboxgl setup pattern as PinMap.jsx.
export default function NearbyDriversMap({ height = 360, className = "" }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef(new Map()); // driver id -> mapboxgl.Marker
  const [center, setCenter] = useState(LAGOS_CENTER);
  const [driverCount, setDriverCount] = useState(null);

  // Try to center on the visitor's own location; silently fall back to
  // Lagos if denied — this is a nice-to-have, not a requirement.
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setCenter({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {},
      { timeout: 5000 }
    );
  }, []);

  useEffect(() => {
    if (!MAPBOX_TOKEN || mapRef.current) return;
    mapboxgl.accessToken = MAPBOX_TOKEN;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/streets-v12",
      center: [center.lng, center.lat],
      zoom: 12,
    });
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      markersRef.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Recenter (without re-creating the map) once we know the visitor's
  // real location, if it arrives after the map already mounted.
  useEffect(() => {
    if (mapRef.current) mapRef.current.easeTo({ center: [center.lng, center.lat], duration: 800 });
  }, [center]);

  useEffect(() => {
    if (!MAPBOX_TOKEN) return;

    async function poll() {
      try {
        const { drivers } = await api.publicNearbyDrivers({ lat: center.lat, lng: center.lng, radius_km: 10 });
        setDriverCount(drivers.length);
        syncMarkers(drivers);
      } catch {
        // A failed poll just means the map doesn't update this cycle —
        // never worth surfacing an error for a background refresh.
      }
    }

    function syncMarkers(drivers) {
      const map = mapRef.current;
      if (!map) return;
      const seen = new Set();

      for (const d of drivers) {
        seen.add(d.id);
        const existing = markersRef.current.get(d.id);
        if (existing) {
          existing.setLngLat([d.lng, d.lat]);
        } else {
          const el = document.createElement("div");
          el.innerHTML = carPinSvg();
          el.style.width = "28px";
          el.style.height = "28px";
          const marker = new mapboxgl.Marker({ element: el }).setLngLat([d.lng, d.lat]).addTo(map);
          markersRef.current.set(d.id, marker);
        }
      }

      // Remove markers for drivers who've gone offline / dropped off since the last poll.
      for (const [id, marker] of markersRef.current.entries()) {
        if (!seen.has(id)) {
          marker.remove();
          markersRef.current.delete(id);
        }
      }
    }

    poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center]);

  if (!MAPBOX_TOKEN) return null;

  return (
    <div className={`relative ${className}`}>
      <div ref={containerRef} style={{ height }} className="rounded-2xl overflow-hidden border border-slate-200" />
      <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-ink/90 border border-line rounded-full pl-2.5 pr-3 py-1.5 backdrop-blur-sm">
        <span className="relative flex h-1.5 w-1.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-delivered opacity-75" />
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-delivered" />
        </span>
        <span className="font-mono text-xs text-paper">
          {driverCount === null ? "Finding drivers…" : `${driverCount} driver${driverCount === 1 ? "" : "s"} nearby`}
        </span>
      </div>
    </div>
  );
}

function carPinSvg() {
  return `
    <svg viewBox="0 0 28 28" xmlns="http://www.w3.org/2000/svg">
      <circle cx="14" cy="14" r="13" fill="#0B1220" stroke="#FFC63D" stroke-width="2"/>
      <path d="M8 17 L9.5 12 a2 2 0 0 1 2 -1.5 h5 a2 2 0 0 1 2 1.5 L20 17"
            fill="none" stroke="#FFC63D" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
      <rect x="7.5" y="17" width="13" height="3" rx="1.2" fill="#FFC63D"/>
      <circle cx="10.5" cy="20" r="1.4" fill="#0B1220"/>
      <circle cx="17.5" cy="20" r="1.4" fill="#0B1220"/>
    </svg>
  `;
}
