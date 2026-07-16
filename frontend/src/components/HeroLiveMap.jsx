import { useEffect, useState } from "react";

const PATH_D = "M 20 140 C 90 20, 190 220, 280 60 S 420 40, 460 110";
const START_ETA = 8 * 60; // 8:00, purely decorative — loops on repeat

export default function HeroLiveMap({ className = "" }) {
  const [eta, setEta] = useState(START_ETA);

  useEffect(() => {
    const t = setInterval(() => {
      setEta((prev) => (prev <= 0 ? START_ETA : prev - 1));
    }, 1000);
    return () => clearInterval(t);
  }, []);

  const minutes = Math.floor(eta / 60);
  const seconds = String(eta % 60).padStart(2, "0");

  return (
    <div className={`relative ${className}`}>
      <svg viewBox="0 0 480 180" className="w-full h-auto" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* subtle street-grid backdrop to read as "map" without pulling in real map tiles */}
        <g opacity="0.12" stroke="#8fa3c4" strokeWidth="1">
          <line x1="30" y1="0" x2="30" y2="180" />
          <line x1="90" y1="0" x2="90" y2="180" />
          <line x1="150" y1="0" x2="150" y2="180" />
          <line x1="210" y1="0" x2="210" y2="180" />
          <line x1="270" y1="0" x2="270" y2="180" />
          <line x1="330" y1="0" x2="330" y2="180" />
          <line x1="390" y1="0" x2="390" y2="180" />
          <line x1="450" y1="0" x2="450" y2="180" />
          <line x1="0" y1="25" x2="480" y2="25" />
          <line x1="0" y1="65" x2="480" y2="65" />
          <line x1="0" y1="105" x2="480" y2="105" />
          <line x1="0" y1="145" x2="480" y2="145" />
        </g>

        {/* route line */}
        <path d={PATH_D} stroke="#223049" strokeWidth="2" />
        <path d={PATH_D} stroke="#FFC63D" strokeWidth="2" className="route-dash" />

        {/* pickup pin */}
        <circle cx="20" cy="140" r="7" fill="#FF6B35" />
        <circle cx="20" cy="140" r="13" stroke="#FF6B35" strokeWidth="1.5" opacity="0.35" />
        <text x="20" y="163" fill="#9AA3B2" fontSize="9" textAnchor="middle" fontFamily="'IBM Plex Mono', monospace" letterSpacing="0.5">
          PICKUP
        </text>

        {/* drop-off pin */}
        <circle cx="460" cy="110" r="7" fill="#1FAE6B" />
        <circle cx="460" cy="110" r="13" stroke="#1FAE6B" strokeWidth="1.5" opacity="0.35" />
        <text x="440" y="133" fill="#9AA3B2" fontSize="9" textAnchor="middle" fontFamily="'IBM Plex Mono', monospace" letterSpacing="0.5">
          DROP-OFF
        </text>

        {/* moving rider, traveling the route on loop */}
        <text
          className="route-pulse"
          style={{ offsetPath: `path('${PATH_D}')`, offsetRotate: "0deg" }}
          fontSize="22"
          textAnchor="middle"
          dominantBaseline="central"
        >
          🛵
        </text>
      </svg>

      {/* live ETA badge */}
      <div className="absolute top-1 right-1 flex items-center gap-1.5 bg-ink/90 border border-line rounded-full pl-2.5 pr-3 py-1.5 backdrop-blur-sm">
        <span className="relative flex h-1.5 w-1.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-delivered opacity-75" />
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-delivered" />
        </span>
        <span className="font-mono text-xs text-paper tabular-nums">ETA {minutes}:{seconds}</span>
      </div>
    </div>
  );
}
