import type { CSSProperties } from "react";

// Landing-page hero flourish: a pack of three neon superbikes running in sync
// down a shared lane. The bike drawing is ported from the RideInSync pitch deck
// (bikeSVG), recoloured per rider via a --accent custom property. They hold
// formation while the lane rushes beneath, wheels spin, and speed streaks
// stream. Purely decorative (aria-hidden); honours prefers-reduced-motion.

// The pitch-deck superbike, authored in a 300 x 165 space (tyres resting near
// y = 156). Recoloured by the enclosing --accent variable.
function BikeArt() {
  return (
    <>
      <g className="ria-tyres">
        <circle className="ria-tyre" cx="62" cy="120" r="36" />
        <circle className="ria-tyre" cx="232" cy="120" r="36" />
        <g className="ria-wheel">
          <circle className="ria-rim" cx="62" cy="120" r="27" />
          <line className="ria-spoke" x1="62" y1="95" x2="62" y2="145" />
          <line className="ria-spoke" x1="37" y1="120" x2="87" y2="120" />
          <line className="ria-spoke" x1="44" y1="102" x2="80" y2="138" />
          <line className="ria-spoke" x1="80" y1="102" x2="44" y2="138" />
        </g>
        <g className="ria-wheel">
          <circle className="ria-rim" cx="232" cy="120" r="27" />
          <line className="ria-spoke" x1="232" y1="95" x2="232" y2="145" />
          <line className="ria-spoke" x1="207" y1="120" x2="257" y2="120" />
          <line className="ria-spoke" x1="214" y1="102" x2="250" y2="138" />
          <line className="ria-spoke" x1="250" y1="102" x2="214" y2="138" />
        </g>
      </g>
      <path className="ria-tube" d="M62 120 L128 104" /> {/* swingarm */}
      <path className="ria-tube" d="M232 120 L200 62" /> {/* fork */}
      <path className="ria-tube" d="M200 62 L222 54" /> {/* bar */}
      <path className="ria-frame" d="M104 82 L150 70 L188 66 L206 78 L196 100 L146 106 L118 100 Z" /> {/* engine + tank */}
      <path className="ria-frame" d="M76 62 L128 56 L140 74 L98 84 Z" /> {/* tail */}
      <path className="ria-lamp" d="M196 52 L226 60 L220 76 L198 70 Z" /> {/* nose fairing */}
      <path className="ria-rider" d="M112 80 C 118 56, 134 44, 154 42 L170 58 L146 76 Z" /> {/* back */}
      <circle className="ria-helm" cx="166" cy="40" r="15" />
      <path className="ria-tube" d="M156 58 L204 64" /> {/* arm */}
      <path className="ria-tube" d="M126 82 L120 108" /> {/* leg */}
      <g>
        <line className="ria-streak" x1="30" y1="52" x2="-30" y2="52" />
        <line className="ria-streak s2" x1="20" y1="76" x2="-46" y2="76" />
        <line className="ria-streak s3" x1="36" y1="96" x2="-24" y2="96" />
      </g>
    </>
  );
}

function Bike({ accent, tx, scale, bob }: { accent: string; tx: number; scale: number; bob: string }) {
  // Sit the tyres (local y ~156) on the lane (y ~150) after scaling.
  const ty = 150 - 156 * scale;
  return (
    <g transform={`translate(${tx} ${ty}) scale(${scale})`}>
      <g className="ria-bike" style={{ "--accent": accent } as CSSProperties}>
        <g className="ria-bob" style={{ animationDelay: bob }}>
          <BikeArt />
        </g>
      </g>
    </g>
  );
}

export function RideAnimation() {
  return (
    <div
      aria-hidden
      style={{
        position: "relative",
        width: "100%",
        aspectRatio: "21 / 9",
        maxHeight: 240,
        borderRadius: "var(--radius-lg)",
        overflow: "hidden",
        background:
          "radial-gradient(120% 160% at 50% 120%, color-mix(in srgb, var(--color-accent) 12%, transparent) 0%, transparent 55%), linear-gradient(180deg, #05070a 0%, var(--color-bg-base) 100%)",
        border: "1px solid var(--color-divider)",
      }}
    >
      <style>{`
        .ria-bike{ filter: drop-shadow(0 0 4px var(--accent)) drop-shadow(0 0 10px color-mix(in srgb, var(--accent) 55%, transparent)); }
        .ria-tyre{ fill:none; stroke:#191E12; stroke-width:11; }
        .ria-rim{ fill:none; stroke:var(--accent); stroke-width:2.4; opacity:.85; }
        .ria-spoke{ stroke:var(--accent); stroke-width:2.6; stroke-linecap:round; opacity:.5; }
        .ria-frame{ fill:#10130D; stroke:var(--accent); stroke-width:2.6; stroke-linejoin:round; }
        .ria-tube{ stroke:var(--accent); stroke-width:7; stroke-linecap:round; fill:none; opacity:.95; }
        .ria-rider{ fill:#0E1109; stroke:var(--accent); stroke-width:2.4; stroke-linejoin:round; }
        .ria-helm{ fill:var(--accent); }
        .ria-lamp{ fill:var(--accent); opacity:.95; }
        .ria-wheel{ transform-origin:center; transform-box:fill-box; animation: ria-spin .5s linear infinite; }
        .ria-bob{ animation: ria-bob 1.7s ease-in-out infinite; }
        .ria-streak{ stroke:var(--accent); stroke-width:3; stroke-linecap:round; animation: ria-streak 1s linear infinite; }
        .ria-streak.s2{ animation-delay:.12s; }
        .ria-streak.s3{ animation-delay:.24s; }
        .ria-dash{ animation: ria-march .45s linear infinite; }
        @keyframes ria-spin{ to{ transform: rotate(360deg); } }
        @keyframes ria-bob{ 0%,100%{ transform: translateY(0); } 50%{ transform: translateY(-4px); } }
        @keyframes ria-streak{ 0%{ transform: translateX(70px); opacity:0; } 30%{ opacity:1; } 100%{ transform: translateX(-160px); opacity:0; } }
        @keyframes ria-march{ to{ stroke-dashoffset:-30; } }
        @media (prefers-reduced-motion: reduce){
          .ria-wheel, .ria-bob, .ria-streak, .ria-dash{ animation:none; }
          .ria-streak{ opacity:.5; }
        }
      `}</style>
      <svg viewBox="0 0 600 180" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" role="presentation">
        {/* the shared lane: a straight glowing line with a fast marching centre */}
        <line x1={-20} y1={150} x2={620} y2={150} stroke="var(--color-surface-3)" strokeWidth={3} />
        <line
          className="ria-dash"
          x1={-20}
          y1={150}
          x2={620}
          y2={150}
          stroke="var(--color-accent)"
          strokeWidth={2.5}
          strokeDasharray="14 16"
          opacity={0.8}
        />

        {/* the pack, back-to-front so the leader overlaps on top */}
        <Bike accent="#8A9199" tx={95} scale={0.5} bob="-0.4s" />
        <Bike accent="#D7DCE2" tx={190} scale={0.56} bob="-0.2s" />
        <Bike accent="var(--color-accent)" tx={300} scale={0.62} bob="0s" />
      </svg>
    </div>
  );
}
