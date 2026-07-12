import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

export default function DeliveryMap({ pickup, dropoff, current, height = 320 }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef({});

  const hasRoute = pickup && dropoff;

  useEffect(() => {
    if (!MAPBOX_TOKEN || !hasRoute || mapRef.current) return;
    mapboxgl.accessToken = MAPBOX_TOKEN;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/light-v11",
      center: [pickup.lng, pickup.lat],
      zoom: 11,
    });
    mapRef.current = map;

    map.on("load", () => {
      const bounds = new mapboxgl.LngLatBounds();

      markersRef.current.pickup = new mapboxgl.Marker({ color: "#FF6B35" })
        .setLngLat([pickup.lng, pickup.lat])
        .setPopup(new mapboxgl.Popup({ offset: 20 }).setText("Pickup"))
        .addTo(map);
      bounds.extend([pickup.lng, pickup.lat]);

      markersRef.current.dropoff = new mapboxgl.Marker({ color: "#1FAE6B" })
        .setLngLat([dropoff.lng, dropoff.lat])
        .setPopup(new mapboxgl.Popup({ offset: 20 }).setText("Drop-off"))
        .addTo(map);
      bounds.extend([dropoff.lng, dropoff.lat]);

      if (current) {
        const el = document.createElement("div");
        el.style.cssText =
          "width:18px;height:18px;border-radius:50%;background:#FFC63D;border:3px solid #0B1220;box-shadow:0 0 0 4px rgba(255,198,61,0.35)";
        markersRef.current.current = new mapboxgl.Marker({ element: el })
          .setLngLat([current.lng, current.lat])
          .setPopup(new mapboxgl.Popup({ offset: 20 }).setText("Agent's last known position"))
          .addTo(map);
        bounds.extend([current.lng, current.lat]);
      }

      map.fitBounds(bounds, { padding: 50, maxZoom: 14 });
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasRoute]);

  // Move the "current position" marker on updates without re-creating the map.
  useEffect(() => {
    if (!mapRef.current || !current) return;
    if (markersRef.current.current) {
      markersRef.current.current.setLngLat([current.lng, current.lat]);
    }
  }, [current]);

  if (!MAPBOX_TOKEN || !hasRoute) {
    return (
      <div
        style={{ height }}
        className="rounded-xl border border-dashed border-slate-300 bg-paper flex items-center justify-center text-center px-6"
      >
        <p className="text-xs text-slate">
          {!MAPBOX_TOKEN
            ? "Map preview isn't configured yet."
            : "Map preview isn't available for this delivery (created before precise location data)."}
        </p>
      </div>
    );
  }

  return <div ref={containerRef} style={{ height }} className="rounded-xl overflow-hidden border border-slate-200" />;
}
