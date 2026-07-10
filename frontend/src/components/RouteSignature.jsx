// The signature visual: a dashed route line between a pickup pin and a
// dropoff pin, with a pulsing dot that travels the path on loop —
// a direct visual echo of what the product does (live delivery tracking).
export default function RouteSignature({ className = "" }) {
  const pathD = "M 20 140 C 90 20, 190 220, 280 60 S 420 40, 460 110";

  return (
    <svg viewBox="0 0 480 180" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d={pathD} stroke="#223049" strokeWidth="2" />
      <path d={pathD} stroke="#FFC63D" strokeWidth="2" className="route-dash" />
      <path id="travelPath" d={pathD} stroke="none" fill="none" />

      {/* pickup pin */}
      <circle cx="20" cy="140" r="7" fill="#FF6B35" />
      <circle cx="20" cy="140" r="12" stroke="#FF6B35" strokeWidth="1.5" opacity="0.4" />

      {/* dropoff pin */}
      <circle cx="460" cy="110" r="7" fill="#1FAE6B" />
      <circle cx="460" cy="110" r="12" stroke="#1FAE6B" strokeWidth="1.5" opacity="0.4" />

      {/* traveling dot */}
      <circle r="6" fill="#FFC63D" style={{ offsetPath: `path('${pathD}')` }} className="route-pulse" />
    </svg>
  );
}
