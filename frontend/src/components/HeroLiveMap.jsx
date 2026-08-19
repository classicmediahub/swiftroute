// Wide illustrated city-road scene, in the same spirit as the animated
// banner on lagosstate.gov.ng that inspired this — reskinned with
// PickAndEarn's own vehicles and a neutral, non-landmark skyline. Compared
// to the first pass, this version leans harder into what actually made
// that reference feel "real": traffic that's basically always present
// rather than one vehicle looping past occasionally, plus some atmosphere
// (sky gradient, glow, lamps, more detailed skyline) instead of flat
// silhouettes on a flat background.
//
// Each vehicle type gets TWO instances sharing the same animation, one
// starting on a negative delay (i.e. already mid-loop the instant the page
// loads) — that's what keeps the road from ever reading as empty, without
// needing to hand-place a dozen one-off vehicles.
//
// Same export shape as before (default export, single optional `className`
// prop) — drop-in replacement, nothing else needs to change.

function BikeArt() {
  return (
    <>
      <ellipse cx="16" cy="17" rx="12" ry="3.2" fill="#000" opacity="0.22" />
      {/* faint speed lines trailing the rear wheel — static relative to
          the bike itself, just a cheap "it's moving fast" cue */}
      <g opacity="0.35" stroke="#94A3B8" strokeWidth="1.2" strokeLinecap="round">
        <path d="M-6 14 h-6" />
        <path d="M-8 17 h-5" opacity="0.6" />
      </g>
      <g transform="translate(0,-13)">
        <g className="pae-bob-el">
          <rect x="-1" y="7" width="9" height="7" rx="1.6" fill="#2A9D8F" stroke="#003049" strokeWidth="0.8" />
          <path d="M1 10.5 c0.8 -1.8 3 -1.8 3.8 0" stroke="#003049" strokeWidth="1" fill="none" strokeLinecap="round" />

          <circle className="pae-wheel" cx="7" cy="19" r="6" fill="#003049" stroke="#FDF0D5" strokeWidth="1.8" />
          <circle className="pae-wheel" cx="25" cy="19" r="6" fill="#003049" stroke="#FDF0D5" strokeWidth="1.8" />
          <circle cx="7" cy="19" r="1.4" fill="#FDF0D5" />
          <circle cx="25" cy="19" r="1.4" fill="#FDF0D5" />

          <path d="M7 19 L13 7 L21 7 L25 19" stroke="#C1121F" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M13 7 L13 4 L15 1" stroke="#FDF0D5" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M21 7 L22.5 3" stroke="#C1121F" strokeWidth="2.2" fill="none" strokeLinecap="round" />
          <path d="M15 1 L22.5 3" stroke="#FDF0D5" strokeWidth="2.2" fill="none" strokeLinecap="round" />

          <circle cx="15.3" cy="-1.5" r="3.4" fill="#FDF0D5" />
          <path d="M12 -3 a3.6 3.6 0 0 1 7 0 Z" fill="#003049" />
          <circle cx="16.6" cy="-1.6" r="0.6" fill="#003049" />
          <path d="M14.6 -0.2 q1 1 2 0" stroke="#003049" strokeWidth="0.6" fill="none" strokeLinecap="round" />
        </g>
      </g>
    </>
  );
}

function CabArt() {
  return (
    <>
      <ellipse cx="17" cy="18" rx="19" ry="3.4" fill="#000" opacity="0.22" />
      <path d="M-2 12 Q0 0 12 -1 H24 Q32 0 34 12 Z" fill="#FDF0D5" />
      <path d="M6 11 Q8 2 14 1 H22 Q27 2 28 11 Z" fill="#669BBC" opacity="0.55" />
      {/* subtle top highlight for a bit of gloss instead of flat fill */}
      <path d="M-1 11 Q1 1 12 0 H20" stroke="#FFFFFF" strokeWidth="1" opacity="0.25" fill="none" strokeLinecap="round" />
      <rect x="-2" y="10" width="36" height="7" rx="2.5" fill="#003049" />
      <rect x="12" y="-6" width="10" height="6" rx="1.5" fill="#C1121F" />
      <circle cx="-1" cy="13" r="1.1" fill="#F5D98C" />
      <circle className="pae-wheel" cx="6" cy="18" r="4.6" fill="#003049" stroke="#FDF0D5" strokeWidth="1.4" />
      <circle className="pae-wheel" cx="28" cy="18" r="4.6" fill="#003049" stroke="#FDF0D5" strokeWidth="1.4" />
    </>
  );
}

function VanArt() {
  return (
    <>
      <ellipse cx="20" cy="26" rx="24" ry="4" fill="#000" opacity="0.22" />
      <rect x="-2" y="-2" width="44" height="22" rx="3" fill="#C1121F" />
      <path d="M-1 -1 H41" stroke="#FFFFFF" strokeWidth="1" opacity="0.3" strokeLinecap="round" />
      <rect x="26" y="4" width="16" height="14" rx="2" fill="#003049" />
      <rect x="29" y="7" width="8" height="6" rx="1" fill="#94A3B8" />
      <rect x="2" y="2" width="20" height="14" rx="1.5" fill="#003049" opacity="0.14" />
      <path d="M8 8 h8 M12 4 v8" stroke="#003049" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="-1" cy="15" r="1.1" fill="#F5D98C" />
      <circle className="pae-wheel" cx="8" cy="20" r="5" fill="#003049" stroke="#FDF0D5" strokeWidth="1.6" />
      <circle className="pae-wheel" cx="32" cy="20" r="5" fill="#003049" stroke="#FDF0D5" strokeWidth="1.6" />
    </>
  );
}

export default function HeroLiveMap({ className = "" }) {
  return (
    <div className={`relative ${className}`}>
      <style>{`
        @keyframes pae-lane-bike { from { transform: translateX(-70px); }  to { transform: translateX(1030px); } }
        @keyframes pae-lane-cab  { from { transform: translateX(-90px); }  to { transform: translateX(1050px); } }
        @keyframes pae-lane-van  { from { transform: translateX(-120px); } to { transform: translateX(1080px); } }
        @keyframes pae-lane-far  { from { transform: translateX(-40px); }  to { transform: translateX(1000px); } }
        @keyframes pae-bob   { 0% { transform: translateY(0px); } 100% { transform: translateY(-2.5px); } }
        @keyframes pae-spin  { to { transform: rotate(360deg); } }
        @keyframes pae-dash  { to { stroke-dashoffset: -28; } }
        @keyframes pae-drift { 0% { transform: translateX(0px); } 100% { transform: translateX(14px); } }
        @keyframes pae-lamp-glow { 0%, 100% { opacity: 0.55; } 50% { opacity: 0.9; } }
        @keyframes pae-light-red    { 0%, 33%   { opacity: 1; } 34%, 100% { opacity: 0.15; } }
        @keyframes pae-light-yellow { 34%, 66%  { opacity: 1; } 0%, 33%, 67%, 100% { opacity: 0.15; } }
        @keyframes pae-light-green  { 67%, 100% { opacity: 1; } 0%, 66% { opacity: 0.15; } }

        /* Each vehicle type: two overlapping loops, the second starting
           already mid-cycle (negative delay) so there's essentially always
           something in that lane instead of a long empty gap between
           single passes. */
        .pae-bike-a { animation: pae-lane-bike 6.5s linear infinite; }
        .pae-bike-b { animation: pae-lane-bike 6.5s linear infinite; animation-delay: -3.25s; }
        .pae-cab-a  { animation: pae-lane-cab 9s linear infinite; animation-delay: 1.2s; }
        .pae-cab-b  { animation: pae-lane-cab 9s linear infinite; animation-delay: -3.3s; }
        .pae-van-a  { animation: pae-lane-van 13s linear infinite; animation-delay: 0.4s; }
        .pae-van-b  { animation: pae-lane-van 13s linear infinite; animation-delay: -6.1s; }
        .pae-far-a  { animation: pae-lane-far 16s linear infinite; animation-delay: 2.5s; }
        .pae-far-b  { animation: pae-lane-far 16s linear infinite; animation-delay: -5.5s; }

        .pae-bob-el { animation: pae-bob 0.5s ease-in-out infinite alternate; }
        .pae-wheel {
          transform-box: fill-box;
          transform-origin: center;
          animation: pae-spin 0.5s linear infinite;
        }
        .pae-dashline { stroke-dasharray: 10 18; animation: pae-dash 1s linear infinite; }
        .pae-cloud { animation: pae-drift 7s ease-in-out infinite alternate; }
        .pae-lamp { animation: pae-lamp-glow 2.6s ease-in-out infinite; }
        .pae-light-red    { animation: pae-light-red 3s linear infinite; }
        .pae-light-yellow { animation: pae-light-yellow 3s linear infinite; }
        .pae-light-green  { animation: pae-light-green 3s linear infinite; }

        @media (prefers-reduced-motion: reduce) {
          .pae-bike-a, .pae-bike-b, .pae-cab-a, .pae-cab-b, .pae-van-a, .pae-van-b,
          .pae-far-a, .pae-far-b, .pae-bob-el, .pae-wheel, .pae-dashline, .pae-cloud,
          .pae-lamp, .pae-light-red, .pae-light-yellow, .pae-light-green {
            animation: none !important;
          }
          .pae-bike-a { transform: translateX(180px); }
          .pae-bike-b { transform: translateX(760px); opacity: 0; }
          .pae-cab-a  { transform: translateX(480px); }
          .pae-cab-b  { transform: translateX(0); opacity: 0; }
          .pae-van-a  { transform: translateX(700px); }
          .pae-van-b  { transform: translateX(0); opacity: 0; }
          .pae-far-a  { transform: translateX(420px); }
          .pae-far-b  { opacity: 0; }
          .pae-light-green { opacity: 1; }
          .pae-lamp { opacity: 0.8; }
        }
      `}</style>

      <svg viewBox="0 0 960 240" className="w-full h-auto" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="pae-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#003049" />
            <stop offset="70%" stopColor="#0A3D5C" />
            <stop offset="100%" stopColor="#12495F" />
          </linearGradient>
          <radialGradient id="pae-horizon-glow" cx="50%" cy="100%" r="80%">
            <stop offset="0%" stopColor="#2E5871" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#2E5871" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="pae-road" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0C4160" />
            <stop offset="100%" stopColor="#002638" />
          </linearGradient>
        </defs>

        {/* sky + horizon glow, replacing the old flat/transparent background */}
        <rect x="0" y="0" width="960" height="240" fill="url(#pae-sky)" />
        <rect x="0" y="90" width="960" height="110" fill="url(#pae-horizon-glow)" />

        {/* soft drifting clouds */}
        <g opacity="0.4" fill="#072A3E">
          <ellipse className="pae-cloud" cx="140" cy="24" rx="30" ry="9" />
          <ellipse className="pae-cloud" cx="640" cy="16" rx="22" ry="7" style={{ animationDelay: "1.5s" }} />
          <ellipse className="pae-cloud" cx="860" cy="30" rx="18" ry="6" style={{ animationDelay: "3s" }} />
        </g>

        {/* richer neutral skyline — varied heights, a water tank and a
            rooftop antenna for texture, more scattered lit windows. Still
            plain block silhouettes with no identifiable real landmark. */}
        <g fill="#072A3E" opacity="0.6">
          <rect x="0" y="126" width="40" height="64" rx="2" />
          <rect x="46" y="104" width="30" height="86" rx="2" />
          <rect x="82" y="140" width="36" height="50" rx="2" />
          <rect x="122" y="118" width="26" height="72" rx="2" />
          <rect x="152" y="150" width="44" height="40" rx="2" />
          <rect x="740" y="132" width="30" height="58" rx="2" />
          <rect x="774" y="112" width="34" height="78" rx="2" />
          <rect x="812" y="146" width="26" height="44" rx="2" />
          <rect x="842" y="98" width="38" height="92" rx="2" />
          <rect x="884" y="128" width="30" height="62" rx="2" />
          <rect x="918" y="150" width="30" height="40" rx="2" />
        </g>
        {/* rooftop details: antenna + a small water tank, cheap texture */}
        <g stroke="#072A3E" strokeWidth="2" opacity="0.6" fill="#072A3E">
          <path d="M61 104 V92" strokeLinecap="round" />
          <circle cx="61" cy="90" r="1.6" />
          <rect x="855" y="88" width="12" height="10" rx="1.5" />
          <path d="M861 88 V80" strokeLinecap="round" />
        </g>
        <g fill="#C1121F" opacity="0.45">
          <rect x="8" y="138" width="4" height="4" />
          <rect x="18" y="138" width="4" height="4" />
          <rect x="8" y="150" width="4" height="4" />
          <rect x="56" y="116" width="4" height="4" />
          <rect x="56" y="128" width="4" height="4" />
          <rect x="56" y="140" width="4" height="4" />
          <rect x="130" y="128" width="4" height="4" />
          <rect x="130" y="140" width="4" height="4" />
          <rect x="750" y="144" width="4" height="4" />
          <rect x="784" y="124" width="4" height="4" />
          <rect x="784" y="136" width="4" height="4" />
          <rect x="852" y="110" width="4" height="4" />
          <rect x="852" y="122" width="4" height="4" />
          <rect x="852" y="134" width="4" height="4" />
          <rect x="892" y="140" width="4" height="4" />
        </g>

        {/* generic elevated overpass on pillars — deliberately not shaped
            like any specific real bridge, just a bit of mid-ground depth */}
        <g>
          <rect x="330" y="86" width="300" height="14" rx="4" fill="#0F425E" />
          <rect x="360" y="100" width="10" height="46" fill="#0F425E" />
          <rect x="470" y="100" width="10" height="46" fill="#0F425E" />
          <rect x="580" y="100" width="10" height="46" fill="#0F425E" />
          <path className="pae-dashline" d="M340 93 H620" stroke="#C1121F" strokeWidth="2" strokeLinecap="round" opacity="0.7" />
          {/* two small distant cars crossing, staggered, so the overpass
              lane also reads as continuously busy rather than empty */}
          <g className="pae-far-a">
            <rect x="0" y="83" width="16" height="8" rx="2.5" fill="#D9731A" />
            <circle cx="4" cy="91" r="2" fill="#003049" />
            <circle cx="12" cy="91" r="2" fill="#003049" />
          </g>
          <g className="pae-far-b">
            <rect x="0" y="83" width="16" height="8" rx="2.5" fill="#669BBC" />
            <circle cx="4" cy="91" r="2" fill="#003049" />
            <circle cx="12" cy="91" r="2" fill="#003049" />
          </g>
        </g>

        {/* street lamps — static, gently pulsing glow, purely atmospheric */}
        {[110, 500, 900].map((x) => (
          <g key={x} transform={`translate(${x},150)`}>
            <rect x="-1.5" y="0" width="3" height="40" fill="#0F425E" />
            <path d="M0 0 Q10 -4 16 2" stroke="#0F425E" strokeWidth="3" fill="none" strokeLinecap="round" />
            <circle className="pae-lamp" cx="16" cy="2" r="7" fill="#C1121F" opacity="0.15" />
            <circle cx="16" cy="2" r="2.6" fill="#F5D98C" />
          </g>
        ))}

        {/* traffic light, cycling red/yellow/green on a loop */}
        <g transform="translate(700,150)">
          <rect x="-2" y="0" width="4" height="34" fill="#0F425E" />
          <rect x="-7" y="-30" width="14" height="32" rx="3" fill="#003049" />
          <circle className="pae-light-red" cx="0" cy="-23" r="3.4" fill="#D9731A" />
          <circle className="pae-light-yellow" cx="0" cy="-14" r="3.4" fill="#C1121F" />
          <circle className="pae-light-green" cx="0" cy="-5" r="3.4" fill="#2A9D8F" />
        </g>

        {/* main road, with a subtle gradient instead of a flat fill */}
        <rect x="0" y="190" width="960" height="30" fill="url(#pae-road)" />
        <path d="M0 191.5 H960" stroke="#2E5871" strokeWidth="1" opacity="0.6" />
        <path className="pae-dashline" d="M0 205 H960" stroke="#C1121F" strokeWidth="2.5" strokeLinecap="round" />

        {/* delivery van — largest, slowest lane. Two staggered instances
            (see .pae-van-a/.pae-van-b) keep this lane close to always
            occupied. Y-position lives on a static outer group and motion
            on an unattributed inner group — SVG can't mix an attribute
            transform with a CSS-animated transform on the same element
            (the animation wins and the attribute is silently dropped), so
            position and motion have to be on separate nested groups. */}
        <g transform="translate(0,178)">
          <g className="pae-van-a"><VanArt /></g>
          <g className="pae-van-b"><VanArt /></g>
        </g>

        {/* cab — mid speed, PickAndEarn livery */}
        <g transform="translate(0,184)">
          <g className="pae-cab-a"><CabArt /></g>
          <g className="pae-cab-b"><CabArt /></g>
        </g>

        {/* delivery bike + rider — fastest, front lane */}
        <g transform="translate(0,205)">
          <g className="pae-bike-a"><BikeArt /></g>
          <g className="pae-bike-b"><BikeArt /></g>
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
