import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { api } from "../api";

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;
const LAGOS_CENTER = { lat: 6.5244, lng: 3.3792 };

export default function PinMap({ token, address, city, coords, onCoordsChange, height = 240 }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState("");

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

  if (!MAPBOX_TOKEN) return null; // map picker just isn't available without a token — address text still works fine

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-ink underline decoration-dashed hover:decoration-solid mb-3"
      >
        {coords ? "Location pinned ✓ — adjust on map" : "Pin exact location on map (recommended)"}
      </button>
    );
  }

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-ink">Drag the pin to the exact spot</span>
        <button type="button" onClick={handleLocate} disabled={locating} className="text-xs text-ink underline disabled:opacity-50">
          {locating ? "Finding…" : "Find address on map"}
        </button>
      </div>
      <div ref={containerRef} style={{ height }} className="rounded-xl overflow-hidden border border-slate-300" />
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
      {coords && <p className="text-xs text-slate mt-1">Pinned: {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}</p>}
    </div>
  );
}
