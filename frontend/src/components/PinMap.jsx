import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { api } from "../api";

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;
const LAGOS_CENTER = { lat: 6.5244, lng: 3.3792 };

export default function PinMap({ token, address, city, coords, onCoordsChange, height = 240, suggestOpen = false }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [locating, setLocating] = useState(false);
  const [findingGps, setFindingGps] = useState(false);
  const [error, setError] = useState("");

  // Auto-expand when the parent tells us address lookup likely failed
  // (e.g. the price came back via the flat-rate fallback, not a real
  // distance calc). Only reacts to suggestOpen turning true — it won't
  // force the map shut again if the person already opened or closed it
  // themselves.
  useEffect(() => {
    if (suggestOpen && !open) setOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestOpen]);

  useEffect(() => {
    if (!open || !MAPBOX_TOKEN || mapRef.current) return;
    mapboxgl.accessToken = MAPBOX_TOKEN;

    const start = coords || LAGOS_CENTER;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/streets-v12",
      center: [start.lng, start.lat],
      zoom: coords ? 15 : 11,
    });
    mapRef.current = map;

    map.on("load", () => {
      const marker = new mapboxgl.Marker({ color: "#FF6B35", draggable: true })
        .setLngLat([start.lng, start.lat])
        .addTo(map);
      markerRef.current = marker;

      if (coords) onCoordsChange(coords); // confirm existing coords immediately

      marker.on("dragend", () => {
        const { lat, lng } = marker.getLngLat();
        onCoordsChange({ lat, lng });
      });
    });

    map.on("click", (e) => {
      if (!markerRef.current) return;
      markerRef.current.setLngLat(e.lngLat);
      onCoordsChange({ lat: e.lngLat.lat, lng: e.lngLat.lng });
    });

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function handleLocate() {
    if (!address || !city) {
      setError("Enter an address above first.");
      return;
    }
    setError("");
    setLocating(true);
    try {
      const result = await api.geocodeAddress(token, { address, city });
      if (mapRef.current && markerRef.current) {
        mapRef.current.flyTo({ center: [result.lng, result.lat], zoom: 15 });
        markerRef.current.setLngLat([result.lng, result.lat]);
      }
      onCoordsChange(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLocating(false);
    }
  }

  // Uses the device's own GPS — no address lookup involved at all, so it
  // works even for a street Mapbox has never heard of. This is the direct
  // fix for "I typed my street and it couldn't find it," since the person
  // is (presumably) standing where they want the pin to go.
  function handleUseGps() {
    if (!navigator.geolocation) {
      setError("Your browser doesn't support location access. Try dragging the pin instead.");
      return;
    }
    setError("");
    setFindingGps(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const result = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        if (mapRef.current && markerRef.current) {
          mapRef.current.flyTo({ center: [result.lng, result.lat], zoom: 16 });
          markerRef.current.setLngLat([result.lng, result.lat]);
        }
        onCoordsChange(result);
        setFindingGps(false);
      },
      (err) => {
        setFindingGps(false);
        if (err.code === err.PERMISSION_DENIED) {
          setError("Location access was denied. You can still drag the pin manually.");
        } else {
          setError("Couldn't get your location right now. Try dragging the pin instead.");
        }
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  if (!MAPBOX_TOKEN) return null; // map picker just isn't available without a token — address text still works fine

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-ink underline decoration-dashed hover:decoration-solid mb-3"
      >
        {coords ? "Location pinned ✓ — adjust on map" : "Can't find your address? Pin it on the map instead"}
      </button>
    );
  }

  return (
    <div className="mb-4">
      {suggestOpen && (
        <p className="text-xs text-signal mb-2">
          We couldn't automatically find this address — please confirm the exact spot below.
        </p>
      )}
      <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
        <span className="text-xs font-medium text-ink">Drag the pin to the exact spot</span>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleUseGps}
            disabled={findingGps}
            className="text-xs font-semibold text-route-dark underline disabled:opacity-50"
          >
            {findingGps ? "Finding you…" : "📍 Use my current location"}
          </button>
          <button type="button" onClick={handleLocate} disabled={locating} className="text-xs text-ink underline disabled:opacity-50">
            {locating ? "Finding…" : "Find address on map"}
          </button>
        </div>
      </div>
      <div ref={containerRef} style={{ height }} className="rounded-xl overflow-hidden border border-slate-300" />
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
      {coords && <p className="text-xs text-slate mt-1">Pinned: {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}</p>}
    </div>
  );
}
