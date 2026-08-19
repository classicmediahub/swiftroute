import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

// How long the marker takes to glide from its last position to a new one.
// Kept a little under the ~8s GPS ping interval (see useRideLocation.js)
// so the marker settles at the real position just before the next ping
// updates it, rather than looking like it's chasing a moving target.
const POSITION_TWEEN_MS = 7000;
const TRAIL_MAX_POINTS = 60; // caps memory/rendering — older points drop off the back

function lerp(a, b, t) {
  return a + (b - a) * t;
}
function easeInOutSine(t) {
  return -(Math.cos(Math.PI * t) - 1) / 2;
}

export default function DeliveryMap({ pickup, dropoff, current, height = 320 }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef({});
  const mapLoadedRef = useRef(false);

  // Animation state for the "current position" marker — separate from
  // `current` itself, since `current` updates in discrete jumps every ~8s
  // (one per GPS ping) but displayPosRef is what actually gets painted,
  // moving smoothly between those jumps every animation frame.
  const displayPosRef = useRef(null); // { lng, lat } — where the marker is drawn right now
  const tweenFromRef = useRef(null);
  const tweenTargetRef = useRef(null);
  const rafRef = useRef(null);
  const trailRef = useRef([]); // accumulated [lng,lat] breadcrumb points, oldest first

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

      markersRef.current.pickup = new mapboxgl.Marker({ color: "#C1121F" })
        .setLngLat([pickup.lng, pickup.lat])
        .setPopup(new mapboxgl.Popup({ offset: 20 }).setText("Pickup"))
        .addTo(map);
      bounds.extend([pickup.lng, pickup.lat]);

      markersRef.current.dropoff = new mapboxgl.Marker({ color: "#2A9D8F" })
        .setLngLat([dropoff.lng, dropoff.lat])
        .setPopup(new mapboxgl.Popup({ offset: 20 }).setText("Drop-off"))
        .addTo(map);
      bounds.extend([dropoff.lng, dropoff.lat]);

      // Breadcrumb trail — a line source that grows as the agent moves,
      // with lineMetrics enabled so line-gradient can fade it from
      // transparent (oldest) to solid (most recent), same visual idea as
      // Google Maps' fading history trail. Starts empty; populated as real
      // position updates arrive below.
      map.addSource("trail", {
        type: "geojson",
        lineMetrics: true,
        data: { type: "Feature", geometry: { type: "LineString", coordinates: [] } },
      });
      map.addLayer({
        id: "trail-line",
        type: "line",
        source: "trail",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-width": 3,
          "line-gradient": [
            "interpolate", ["linear"], ["line-progress"],
            0, "rgba(102,155,188,0)",
            1, "rgba(102,155,188,0.85)",
          ],
        },
      });

      if (current) {
        displayPosRef.current = { lng: current.lng, lat: current.lat };
        trailRef.current = [[current.lng, current.lat]];
        const el = document.createElement("div");
        el.style.cssText =
          "width:18px;height:18px;border-radius:50%;background:#669BBC;border:3px solid #003049;box-shadow:0 0 0 4px rgba(102,155,188,0.35)";
        markersRef.current.current = new mapboxgl.Marker({ element: el })
          .setLngLat([current.lng, current.lat])
          .setPopup(new mapboxgl.Popup({ offset: 20 }).setText("Agent's last known position"))
          .addTo(map);
        bounds.extend([current.lng, current.lat]);
      }

      map.fitBounds(bounds, { padding: 50, maxZoom: 14 });
      mapLoadedRef.current = true;
    });

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      map.remove();
      mapRef.current = null;
      mapLoadedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasRoute]);

  // On each real position update: append to the trail, and kick off a
  // smooth tween of the marker from wherever it's currently drawn to the
  // new real position — instead of teleporting there instantly.
  useEffect(() => {
    if (!mapRef.current || !mapLoadedRef.current || !current) return;

    if (!markersRef.current.current) {
      // First position ever received after the map already loaded (e.g. a
      // ride that had no location yet on initial render) — same lazy-init
      // path as the load handler above, just triggered later.
      displayPosRef.current = { lng: current.lng, lat: current.lat };
      trailRef.current = [[current.lng, current.lat]];
      const el = document.createElement("div");
      el.style.cssText =
        "width:18px;height:18px;border-radius:50%;background:#669BBC;border:3px solid #003049;box-shadow:0 0 0 4px rgba(102,155,188,0.35)";
      markersRef.current.current = new mapboxgl.Marker({ element: el })
        .setLngLat([current.lng, current.lat])
        .setPopup(new mapboxgl.Popup({ offset: 20 }).setText("Agent's last known position"))
        .addTo(mapRef.current);
      return;
    }

    const from = displayPosRef.current || { lng: current.lng, lat: current.lat };
    const target = { lng: current.lng, lat: current.lat };

    // Same point as last time (e.g. agent stationary) — nothing to animate.
    if (from.lng === target.lng && from.lat === target.lat) return;

    trailRef.current = [...trailRef.current, [current.lng, current.lat]].slice(-TRAIL_MAX_POINTS);
    const trailSource = mapRef.current.getSource("trail");
    if (trailSource) {
      trailSource.setData({ type: "Feature", geometry: { type: "LineString", coordinates: trailRef.current } });
    }

    tweenFromRef.current = from;
    tweenTargetRef.current = target;
    const start = performance.now();

    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    function step(now) {
      const t = Math.min(1, (now - start) / POSITION_TWEEN_MS);
      const eased = easeInOutSine(t);
      const lng = lerp(tweenFromRef.current.lng, tweenTargetRef.current.lng, eased);
      const lat = lerp(tweenFromRef.current.lat, tweenTargetRef.current.lat, eased);
      displayPosRef.current = { lng, lat };
      markersRef.current.current?.setLngLat([lng, lat]);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        displayPosRef.current = target;
      }
    }
    rafRef.current = requestAnimationFrame(step);
  }, [current]);

  if (!MAPBOX_TOKEN || !hasRoute) {
    return (
      <div
        style={{ height }}
        className="rounded-xl border border-dashed border-slate-300 bg-paper flex items-center justify-center text-center px-6"
      >
        <p className="text-xs text-slate">
          {!MAPBOX_TOKEN
            ? "Map preview isn't available right now. Tracking details are below."
            : "Map preview isn't available for this delivery. Tracking details are below."}
        </p>
      </div>
    );
  }

  return <div ref={containerRef} style={{ height }} className="rounded-xl overflow-hidden border border-slate-200" />;
}
