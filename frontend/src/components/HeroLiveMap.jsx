const ROAD_D = "M 20 150 C 90 40, 190 205, 280 75 S 420 55, 460 120";

export default function HeroLiveMap({ className = "" }) {
  return (
    <div className={`relative ${className}`}>
      <style>{`
        @keyframes pae-ride {
          0%   { offset-distance: 0%;   opacity: 0; }
          6%   { opacity: 1; }
          94%  { opacity: 1; }
          100% { offset-distance: 100%; opacity: 0; }
        }
        @keyframes pae-bob {
          0%   { transform: translateY(0px); }
          100% { transform: translateY(-3px); }
        }
        @keyframes pae-spin {
          to { transform: rotate(360deg); }
        }
        @keyframes pae-dash {
          to { stroke-dashoffset: -24; }
        }
        @keyframes pae-drift {
          0%   { transform: translateX(0px); }
          100% { transform: translateX(10px); }
        }
        .pae-map-shadow, .pae-map-rider {
          offset-path: path('${ROAD_D}');
          animation-name: pae-ride;
          animation-duration: 7s;
          animation-timing-function: linear;
          animation-iteration-count: infinite;
        }
        .pae-map-shadow { offset-rotate: 0deg; }
        .pae-map-rider { offset-rotate: auto; }
        .pae-map-bob { animation: pae-bob 0.5s ease-in-out infinite alternate; }
        .pae-map-wheel {
          transform-box: fill-box;
          transform-origin: center;
          animation: pae-spin 0.5s linear infinite;
        }
        .pae-map-dashline {
          stroke-dasharray: 10 14;
          animation: pae-dash 1.1s linear infinite;
        }
        .pae-map-cloud {
          animation: pae-drift 6s ease-in-out infinite alternate;
        }
        @media (prefers-reduced-motion: reduce) {
          .pae-map-shadow, .pae-map-rider, .pae-map-bob, .pae-map-wheel,
          .pae-map-dashline, .pae-map-cloud {
            animation: none !important;
          }
          .pae-map-shadow, .pae-map-rider { offset-distance: 40%; opacity: 1; }
        }
      `}</style>

      <svg viewBox="0 0 480 200" className="w-full h-auto" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* soft drifting clouds for a bit of life in the background */}
        <g opacity="0.5" fill="#1B2436">
          <ellipse className="pae-map-cloud" cx="90" cy="28" rx="26" ry="9" />
          <ellipse className="pae-map-cloud" cx="360" cy="20" rx="20" ry="7" style={{ animationDelay: "1.2s" }} />
        </g>

        {/* road */}
        <path d={ROAD_D} stroke="#223049" strokeWidth="10" strokeLinecap="round" />
        <path className="pae-map-dashline" d={ROAD_D} stroke="#FFC63D" strokeWidth="2.5" strokeLinecap="round" />

        {/* pickup: a friendly parcel with a pin */}
        <g transform="translate(20,150)">
          <ellipse cx="0" cy="21" rx="13" ry="4" fill="#000" opacity="0.18" />
          <rect x="-11" y="-10" width="22" height="18" rx="3" fill="#FF6B35" />
          <path d="M-11 -3 H11 M0 -10 V8" stroke="#FFE3D6" strokeWidth="1.6" />
          <text x="0" y="38" fill="#9AA3B2" fontSize="9" textAnchor="middle" fontFamily="'IBM Plex Mono', monospace" letterSpacing="0.5">
            PICKUP
          </text>
        </g>

        {/* drop-off: a friendly little house with a check */}
        <g transform="translate(460,120)">
          <ellipse cx="0" cy="17" rx="14" ry="4" fill="#000" opacity="0.18" />
          <path d="M-14 4 0 -10 14 4 V16 H-14 Z" fill="#1FAE6B" />
          <rect x="-4" y="4" width="8" height="12" fill="#0B1220" />
          <circle cx="15" cy="-8" r="8" fill="#1FAE6B" stroke="#0B1220" strokeWidth="1.5" />
          <path d="M11 -8 14 -5 19 -11" stroke="#F7F7F5" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <text x="0" y="34" fill="#9AA3B2" fontSize="9" textAnchor="middle" fontFamily="'IBM Plex Mono', monospace" letterSpacing="0.5">
            DROP-OFF
          </text>
        </g>

        {/* soft moving shadow beneath the rider, tracing the same path */}
        <ellipse className="pae-map-shadow" rx="12" ry="3.5" fill="#000" opacity="0.22" />

        {/* the rider, cartoon-proportioned: big wheels, round helmeted head, big smile */}
        <g className="pae-map-rider">
          <g className="pae-map-bob" transform="translate(-16, -13)">
            {/* delivery box on the back rack */}
            <rect x="-1" y="7" width="9" height="7" rx="1.6" fill="#FFC63D" stroke="#0B1220" strokeWidth="0.8" />
            <path d="M1 10.5 c0.8 -1.8 3 -1.8 3.8 0" stroke="#0B1220" strokeWidth="1" fill="none" strokeLinecap="round" />

            {/* wheels, spinning */}
            <circle className="pae-map-wheel" cx="7" cy="19" r="6" fill="#0B1220" stroke="#F7F7F5" strokeWidth="1.8" />
            <circle className="pae-map-wheel" cx="25" cy="19" r="6" fill="#0B1220" stroke="#F7F7F5" strokeWidth="1.8" />
            <circle cx="7" cy="19" r="1.4" fill="#F7F7F5" />
            <circle cx="25" cy="19" r="1.4" fill="#F7F7F5" />

            {/* frame */}
            <path d="M7 19 L13 7 L21 7 L25 19" stroke="#FFC63D" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M13 7 L13 4 L15 1" stroke="#F7F7F5" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M21 7 L22.5 3" stroke="#FFC63D" strokeWidth="2.2" fill="none" strokeLinecap="round" />
            <path d="M15 1 L22.5 3" stroke="#F7F7F5" strokeWidth="2.2" fill="none" strokeLinecap="round" />

            {/* rider: round helmet + big friendly face */}
            <circle cx="15.3" cy="-1.5" r="3.4" fill="#F7F7F5" />
            <path d="M12 -3 a3.6 3.6 0 0 1 7 0 Z" fill="#0B1220" />
            <circle cx="16.6" cy="-1.6" r="0.6" fill="#0B1220" />
            <path d="M14.6 -0.2 q1 1 2 0" stroke="#0B1220" strokeWidth="0.6" fill="none" strokeLinecap="round" />
          </g>
        </g>
      </svg>

      {/* live-tracking badge */}
      <div className="absolute top-1 right-1 flex items-center gap-1.5 bg-ink/90 border border-line rounded-full pl-2.5 pr-3 py-1.5 backdrop-blur-sm">
        <span className="relative flex h-1.5 w-1.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-delivered opacity-75" />
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-delivered" />
        </span>
        <span className="font-mono text-xs text-paper">Live tracking, every trip</span>
      </div>
    </div>
  );
}
