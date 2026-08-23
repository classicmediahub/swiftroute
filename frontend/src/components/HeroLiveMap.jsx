// Wide illustrated city-road scene, styled after the animated banner on
// lagosstate.gov.ng — a light, airy daytime scene rather than the dark
// night version this component used to be. Vehicles are drawn much larger
// and with gradient shading (not flat fills) to read as a proper flat-
// illustration piece instead of small sprite-style icons, which was the
// biggest single reason the previous version didn't feel "real" next to
// the reference.
//
// Honest caveat, worth knowing: the Lagos State banner is very likely a
// commissioned/licensed vector illustration made in Illustrator by a
// professional illustrator, not something built from primitive shapes in
// code. This gets meaningfully closer in scale, proportion, and polish,
// but won't reach that exact level of hand-crafted detail.
//
// Same export shape as always (default export, single optional `className`
// prop) — drop-in replacement.

function BikeArt() {
  return (
    <>
      <ellipse cx="46" cy="86" rx="42" ry="9" fill="#1a0d13" opacity="0.14" />
      <g transform="translate(0,-8)">
        <g className="pae-bob-el">
          {/* delivery box */}
          <rect x="0" y="20" width="30" height="26" rx="5" fill="url(#pae-grad-green)" stroke="#0a5a42" strokeWidth="1.2" />
          <path d="M4 33 H26" stroke="#0a5a42" strokeWidth="1" opacity="0.5" />
          <path d="M4 27 c3 -6 10 -6 13 0" stroke="#0a5a42" strokeWidth="1.4" fill="none" strokeLinecap="round" />

          {/* wheels */}
          <circle className="pae-wheel" cx="24" cy="70" r="22" fill="#1a0d13" stroke="#f8f5ef" strokeWidth="4" />
          <circle cx="24" cy="70" r="6" fill="#f8f5ef" />
          <circle className="pae-wheel" cx="92" cy="70" r="22" fill="#1a0d13" stroke="#f8f5ef" strokeWidth="4" />
          <circle cx="92" cy="70" r="6" fill="#f8f5ef" />

          {/* frame */}
          <path d="M24 70 L46 26 L76 26 L92 70" stroke="url(#pae-grad-red)" strokeWidth="7" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M46 26 L46 12 L54 4" stroke="#1a0d13" strokeWidth="7" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M76 26 L80 10" stroke="url(#pae-grad-red)" strokeWidth="7" fill="none" strokeLinecap="round" />
          <path d="M54 4 L80 10" stroke="#1a0d13" strokeWidth="7" fill="none" strokeLinecap="round" />

          {/* rider */}
          <circle cx="56" cy="-2" r="12" fill="#f8f5ef" stroke="#1a0d13" strokeWidth="1.5" />
          <path d="M44 -8 a12 12 0 0 1 24 0 Z" fill="#1a0d13" />
          <circle cx="61" cy="-3" r="2" fill="#1a0d13" />
          <path d="M52 3 q4 3.5 7 0" stroke="#1a0d13" strokeWidth="1.6" fill="none" strokeLinecap="round" />
        </g>
      </g>
    </>
  );
}

function CabArt() {
  return (
    <>
      <ellipse cx="70" cy="92" rx="76" ry="10" fill="#1a0d13" opacity="0.14" />
      <path d="M-6 46 Q0 4 46 0 H98 Q130 2 138 46 Z" fill="url(#pae-grad-red)" stroke="#43091b" strokeWidth="1.5" />
      <path d="M-4 44 Q2 44 20 44 Q26 8 48 4 H96 Q120 6 128 44 Q134 44 136 44" stroke="#FFFFFF" strokeWidth="2" opacity="0.35" fill="none" strokeLinecap="round" />
      <path d="M22 42 Q28 12 48 8 H72 V42 Z" fill="#8FC1E3" opacity="0.85" />
      <path d="M76 42 V8 H94 Q112 12 116 42 Z" fill="#8FC1E3" opacity="0.85" />
      <path d="M72 8 V42" stroke="#43091b" strokeWidth="2" opacity="0.6" />
      <rect x="-6" y="40" width="144" height="24" rx="8" fill="#1a0d13" />
      <rect x="46" y="-16" width="36" height="20" rx="4" fill="url(#pae-grad-navy)" />
      <text x="64" y="-2" textAnchor="middle" fontFamily="'IBM Plex Mono', monospace" fontSize="11" fontWeight="700" fill="#f8f5ef">P</text>
      <circle cx="-4" cy="50" r="4" fill="#FFE9A8" />
      <circle cx="134" cy="50" r="3" fill="#43091b" />
      <circle className="pae-wheel" cx="24" cy="68" r="17" fill="#1a0d13" stroke="#f8f5ef" strokeWidth="3.5" />
      <circle cx="24" cy="68" r="5" fill="#f8f5ef" />
      <circle className="pae-wheel" cx="108" cy="68" r="17" fill="#1a0d13" stroke="#f8f5ef" strokeWidth="3.5" />
      <circle cx="108" cy="68" r="5" fill="#f8f5ef" />
    </>
  );
}

function VanArt() {
  return (
    <>
      <ellipse cx="90" cy="104" rx="96" ry="11" fill="#1a0d13" opacity="0.14" />
      <rect x="-8" y="-6" width="176" height="86" rx="12" fill="url(#pae-grad-navy)" stroke="#1a0d13" strokeWidth="1.5" />
      <path d="M-6 -4 H166" stroke="#FFFFFF" strokeWidth="2" opacity="0.25" strokeLinecap="round" />
      <rect x="104" y="14" width="60" height="46" rx="6" fill="#1a0d13" />
      <rect x="112" y="22" width="20" height="20" rx="3" fill="#8FC1E3" opacity="0.9" />
      <rect x="136" y="22" width="20" height="20" rx="3" fill="#8FC1E3" opacity="0.9" />
      <rect x="6" y="8" width="88" height="58" rx="6" fill="url(#pae-grad-red)" opacity="0.95" />
      {/* parcel icon — a simple box with a bow, not a medical cross */}
      <rect x="34" y="24" width="32" height="26" rx="2" fill="#f8f5ef" opacity="0.92" />
      <path d="M34 34 H66 M50 24 V50" stroke="#43091b" strokeWidth="2.2" />
      <path d="M44 24 q6 -8 12 0" stroke="#43091b" strokeWidth="2.2" fill="none" strokeLinecap="round" />
      <circle cx="-6" cy="26" r="4.5" fill="#FFE9A8" />
      <circle cx="166" cy="26" r="3.5" fill="#43091b" />
      <circle className="pae-wheel" cx="30" cy="78" r="20" fill="#1a0d13" stroke="#f8f5ef" strokeWidth="4" />
      <circle cx="30" cy="78" r="6" fill="#f8f5ef" />
      <circle className="pae-wheel" cx="128" cy="78" r="20" fill="#1a0d13" stroke="#f8f5ef" strokeWidth="4" />
      <circle cx="128" cy="78" r="6" fill="#f8f5ef" />
    </>
  );
}

export default function HeroLiveMap({ className = "" }) {
  return (
    <div className={`relative ${className}`}>
      <style>{`
        @keyframes pae-lane-bike { from { transform: translateX(-140px); } to { transform: translateX(1260px); } }
        @keyframes pae-lane-cab  { from { transform: translateX(-180px); } to { transform: translateX(1300px); } }
        @keyframes pae-lane-van  { from { transform: translateX(-220px); } to { transform: translateX(1340px); } }
        @keyframes pae-lane-far  { from { transform: translateX(-40px); }  to { transform: translateX(1240px); } }
        @keyframes pae-bob   { 0% { transform: translateY(0px); } 100% { transform: translateY(-4px); } }
        @keyframes pae-spin  { to { transform: rotate(360deg); } }
        @keyframes pae-dash  { to { stroke-dashoffset: -32; } }
        @keyframes pae-drift { 0% { transform: translateX(0px); } 100% { transform: translateX(18px); } }
        @keyframes pae-light-red    { 0%, 33%   { opacity: 1; } 34%, 100% { opacity: 0.2; } }
        @keyframes pae-light-yellow { 34%, 66%  { opacity: 1; } 0%, 33%, 67%, 100% { opacity: 0.2; } }
        @keyframes pae-light-green  { 67%, 100% { opacity: 1; } 0%, 66% { opacity: 0.2; } }

        .pae-bike-a { animation: pae-lane-bike 7s linear infinite; }
        .pae-bike-b { animation: pae-lane-bike 7s linear infinite; animation-delay: -3.5s; }
        .pae-cab-a  { animation: pae-lane-cab 10s linear infinite; animation-delay: 1.4s; }
        .pae-cab-b  { animation: pae-lane-cab 10s linear infinite; animation-delay: -3.6s; }
        .pae-van-a  { animation: pae-lane-van 14s linear infinite; animation-delay: 0.5s; }
        .pae-van-b  { animation: pae-lane-van 14s linear infinite; animation-delay: -6.5s; }
        .pae-far-a  { animation: pae-lane-far 17s linear infinite; animation-delay: 2.5s; }
        .pae-far-b  { animation: pae-lane-far 17s linear infinite; animation-delay: -6s; }

        .pae-bob-el { animation: pae-bob 0.5s ease-in-out infinite alternate; }
        .pae-wheel {
          transform-box: fill-box;
          transform-origin: center;
          animation: pae-spin 0.6s linear infinite;
        }
        .pae-dashline { stroke-dasharray: 14 20; animation: pae-dash 1.1s linear infinite; }
        .pae-cloud { animation: pae-drift 8s ease-in-out infinite alternate; }
        .pae-light-red    { animation: pae-light-red 3s linear infinite; }
        .pae-light-yellow { animation: pae-light-yellow 3s linear infinite; }
        .pae-light-green  { animation: pae-light-green 3s linear infinite; }

        @media (prefers-reduced-motion: reduce) {
          .pae-bike-a, .pae-bike-b, .pae-cab-a, .pae-cab-b, .pae-van-a, .pae-van-b,
          .pae-far-a, .pae-far-b, .pae-bob-el, .pae-wheel, .pae-dashline, .pae-cloud,
          .pae-light-red, .pae-light-yellow, .pae-light-green {
            animation: none !important;
          }
          .pae-bike-a { transform: translateX(240px); }
          .pae-bike-b { transform: translateX(980px); opacity: 0; }
          .pae-cab-a  { transform: translateX(620px); }
          .pae-cab-b  { transform: translateX(0); opacity: 0; }
          .pae-van-a  { transform: translateX(900px); }
          .pae-van-b  { transform: translateX(0); opacity: 0; }
          .pae-far-a  { transform: translateX(540px); }
          .pae-far-b  { opacity: 0; }
          .pae-light-green { opacity: 1; }
        }
      `}</style>

      <svg viewBox="0 0 1200 420" className="w-full h-auto" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="pae-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FFFDF9" />
            <stop offset="100%" stopColor="#f8f5ef" />
          </linearGradient>
          <linearGradient id="pae-grad-red" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FFD24D" />
            <stop offset="100%" stopColor="#f0b400" />
          </linearGradient>
          <linearGradient id="pae-grad-navy" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3a1f2a" />
            <stop offset="100%" stopColor="#1a0d13" />
          </linearGradient>
          <linearGradient id="pae-grad-green" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1DBE87" />
            <stop offset="100%" stopColor="#12946b" />
          </linearGradient>
        </defs>

        {/* sky */}
        <rect x="0" y="0" width="1200" height="420" fill="url(#pae-sky)" />

        {/* soft drifting clouds */}
        <g opacity="0.55" fill="#e6ddc9">
          <ellipse className="pae-cloud" cx="170" cy="56" rx="46" ry="14" />
          <ellipse className="pae-cloud" cx="820" cy="40" rx="34" ry="11" style={{ animationDelay: "2s" }} />
          <ellipse className="pae-cloud" cx="1080" cy="70" rx="28" ry="9" style={{ animationDelay: "4s" }} />
        </g>

        {/* distant skyline — light navy silhouettes, neutral (no real landmark) */}
        <g fill="#1a0d13" opacity="0.16">
          <rect x="0" y="220" width="60" height="120" rx="3" />
          <rect x="70" y="180" width="46" height="160" rx="3" />
          <rect x="126" y="240" width="56" height="100" rx="3" />
          <rect x="1000" y="200" width="50" height="140" rx="3" />
          <rect x="1058" y="230" width="40" height="110" rx="3" />
          <rect x="1106" y="170" width="56" height="170" rx="3" />
        </g>

        {/* generic elevated overpass on pillars, with a colored accent
            stripe along the deck rail (a nod to the reference's green
            stripe, done here in brand navy/red instead) */}
        <g>
          <rect x="430" y="150" width="340" height="20" rx="6" fill="#2a1420" />
          <rect x="430" y="150" width="340" height="5" fill="#f0b400" />
          <rect x="470" y="170" width="14" height="70" fill="#2a1420" />
          <rect x="600" y="170" width="14" height="70" fill="#2a1420" />
          <rect x="730" y="170" width="14" height="70" fill="#2a1420" />
          <path className="pae-dashline" d="M446 160 H750" stroke="#f8f5ef" strokeWidth="3" strokeLinecap="round" opacity="0.85" />
          <g className="pae-far-a">
            <rect x="0" y="144" width="26" height="14" rx="4" fill="#f0b400" />
            <circle cx="7" cy="158" r="3.6" fill="#1a0d13" />
            <circle cx="19" cy="158" r="3.6" fill="#1a0d13" />
          </g>
          <g className="pae-far-b">
            <rect x="0" y="144" width="26" height="14" rx="4" fill="#5c1327" />
            <circle cx="7" cy="158" r="3.6" fill="#1a0d13" />
            <circle cx="19" cy="158" r="3.6" fill="#1a0d13" />
          </g>
        </g>

        {/* traffic light */}
        <g transform="translate(920,258)">
          <rect x="-3" y="0" width="6" height="60" fill="#2a1420" />
          <rect x="-12" y="-52" width="24" height="56" rx="5" fill="#1a0d13" />
          <circle className="pae-light-red" cx="0" cy="-40" r="6" fill="#d93a2b" />
          <circle className="pae-light-yellow" cx="0" cy="-26" r="6" fill="#E8A23D" />
          <circle className="pae-light-green" cx="0" cy="-12" r="6" fill="#12946b" />
        </g>

        {/* road: pavement strip, then the main asphalt road with lane markings */}
        <rect x="0" y="330" width="1200" height="14" fill="#e6ddc9" />
        <rect x="0" y="344" width="1200" height="56" fill="#241019" />
        <path d="M0 346 H1200" stroke="#3a1f2a" strokeWidth="1.5" />
        <path className="pae-dashline" d="M0 372 H1200" stroke="#f8f5ef" strokeWidth="4" strokeLinecap="round" opacity="0.9" />

        {/* delivery van — largest, slowest lane */}
        <g transform="translate(0,296)">
          <g className="pae-van-a"><VanArt /></g>
          <g className="pae-van-b"><VanArt /></g>
        </g>

        {/* cab — mid speed */}
        <g transform="translate(0,310)">
          <g className="pae-cab-a"><CabArt /></g>
          <g className="pae-cab-b"><CabArt /></g>
        </g>

        {/* delivery bike + rider — fastest, front lane */}
        <g transform="translate(0,326)">
          <g className="pae-bike-a"><BikeArt /></g>
          <g className="pae-bike-b"><BikeArt /></g>
        </g>
      </svg>

      {/* live-tracking badge — dark pill on the light scene now, same as
          the reference's own dark badge sitting on its light banner */}
      <div className="absolute top-1.5 right-1.5 sm:top-3 sm:right-3 flex items-center gap-1 sm:gap-1.5 bg-ink/95 border border-ink rounded-full pl-1.5 pr-2 py-0.5 sm:pl-2.5 sm:pr-3 sm:py-1.5 shadow-sm">
        <span className="relative flex h-1 w-1 sm:h-1.5 sm:w-1.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-delivered opacity-75" />
          <span className="relative inline-flex rounded-full h-1 w-1 sm:h-1.5 sm:w-1.5 bg-delivered" />
        </span>
        <span className="font-mono text-[9px] sm:text-xs text-paper whitespace-nowrap">Live tracking, every trip</span>
      </div>
    </div>
  );
}
