import { useId } from "react";

/*
 * The car behind TTD Rewards. A low, wide, neutral modern hatchback profile that
 * does not imply a make or model, drawn on real ratios (about 4.4 m long, 2.65 m
 * wheelbase, 1.42 m tall, 0.68 m wheels) on a 400 x 140 grid with the ground at
 * y = 128.
 *
 * It is always a complete, solid car. What changes is the paint: hazy, swirl
 * marked satin for a car not yet finished, deep mirror gloss for one that is.
 * That is the detailer's 50/50 shot, and it is what each completed visit does.
 */
export const CAR_W = 400;
export const CAR_H = 132;

const BODY =
  "M16 113 L12 100 C11 90 12 78 14.5 68 C16 60 22 52 44 44 C76 34 106 22 138 18 C160 15.5 196 15.5 220 19 C246 24 270 40 292 49 C300 51 306 52 316 54 L350 60 C372 64 384 72 387 84 C390 92 390 102 388 107 C386 111 382 113 374 113 Z";
const GLASS_REAR = "M66 49 L72 41 C90 33 116 24 150 21.5 L172 21 L172 49 Z";
const GLASS_FRONT = "M184 21 L214 21.4 C238 26 254 38 268 47 L272 49 L184 49 Z";
const PILLAR_B = "M172 21 L184 21 L185 50 L171 50 Z";
const WHEELS = [
  { cx: 92, cy: 101 },
  { cx: 318, cy: 101 },
];

const rad = (d: number) => (d * Math.PI) / 180;
const pt = (cx: number, cy: number, r: number, a: number) =>
  `${(cx + r * Math.cos(rad(a))).toFixed(2)} ${(cy + r * Math.sin(rad(a))).toFixed(2)}`;
/** One tapered alloy spoke from the hub out to the rim. */
const spoke = (cx: number, cy: number, a: number) => {
  const r0 = 4.6;
  const r1 = 17.6;
  return `M${pt(cx, cy, r0, a - 8)} L${pt(cx, cy, r1, a - 14)} A${r1} ${r1} 0 0 1 ${pt(cx, cy, r1, a + 14)} L${pt(cx, cy, r0, a + 8)} A${r0} ${r0} 0 0 0 ${pt(cx, cy, r0, a - 8)} Z`;
};
const SPOKE_ANGLES = [-72, 0, 72, 144, 216];

/**
 * One painting of the car: `finished` is mirror gloss, otherwise hazy satin.
 * The torch layer (a light that follows the finger) is added by the card.
 */
export function Car({ finished }: { finished: boolean }) {
  const id = useId().replace(/:/g, "");
  const u = (n: string) => `${n}-${id}`;
  const ref = (n: string) => `url(#${u(n)})`;

  return (
    <svg viewBox={`0 8 ${CAR_W} ${CAR_H}`} className="absolute inset-0 h-full w-full" aria-hidden>
      <defs>
        {finished ? (
          <>
            <linearGradient id={u("paint")} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#2b2e34" />
              <stop offset="0.4" stopColor="#0f1013" />
              <stop offset="1" stopColor="#040405" />
            </linearGradient>
            <linearGradient id={u("sky")} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#dbe6f2" stopOpacity="0.78" />
              <stop offset="1" stopColor="#8ea3b8" stopOpacity="0" />
            </linearGradient>
            <linearGradient id={u("belt")} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#fff" stopOpacity="0.4" />
              <stop offset="1" stopColor="#fff" stopOpacity="0.05" />
            </linearGradient>
            <linearGradient id={u("bounce")} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#e84a0c" stopOpacity="0" />
              <stop offset="0.75" stopColor="#e84a0c" stopOpacity="0.26" />
              <stop offset="1" stopColor="#e84a0c" stopOpacity="0.05" />
            </linearGradient>
            <linearGradient id={u("strip")} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#fff" stopOpacity="0" />
              <stop offset="0.5" stopColor="#fff" stopOpacity="0.24" />
              <stop offset="1" stopColor="#fff" stopOpacity="0" />
            </linearGradient>
            <linearGradient id={u("glass")} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#9db4c9" />
              <stop offset="0.5" stopColor="#25313d" />
              <stop offset="1" stopColor="#080c11" />
            </linearGradient>
            <linearGradient id={u("rim")} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#f1f4f7" />
              <stop offset="1" stopColor="#7d8590" />
            </linearGradient>
          </>
        ) : (
          <>
            <linearGradient id={u("paint")} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#a3a19a" />
              <stop offset="1" stopColor="#77756f" />
            </linearGradient>
            <linearGradient id={u("glass")} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#7c848c" />
              <stop offset="1" stopColor="#4c535a" />
            </linearGradient>
            <linearGradient id={u("rim")} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#b3b3ae" />
              <stop offset="1" stopColor="#84847f" />
            </linearGradient>
            <pattern
              id={u("swirl")}
              width="43"
              height="43"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(21)"
            >
              <path
                d="M3 24 A15 15 0 0 1 30 12"
                fill="none"
                stroke="#fff"
                strokeOpacity="0.55"
                strokeWidth="0.42"
              />
              <path
                d="M9 38 A9 9 0 0 0 27 35"
                fill="none"
                stroke="#fff"
                strokeOpacity="0.45"
                strokeWidth="0.4"
              />
              <path
                d="M28 7 A5 5 0 0 1 38 9"
                fill="none"
                stroke="#000"
                strokeOpacity="0.2"
                strokeWidth="0.4"
              />
              <path
                d="M34 30 A7 7 0 0 1 41 38"
                fill="none"
                stroke="#fff"
                strokeOpacity="0.4"
                strokeWidth="0.4"
              />
            </pattern>
            <pattern
              id={u("swirl2")}
              width="31"
              height="31"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(-37)"
            >
              <path
                d="M2 19 A11 11 0 0 1 22 9"
                fill="none"
                stroke="#fff"
                strokeOpacity="0.4"
                strokeWidth="0.4"
              />
              <path
                d="M12 29 A6 6 0 0 0 26 26"
                fill="none"
                stroke="#000"
                strokeOpacity="0.16"
                strokeWidth="0.4"
              />
            </pattern>
            {/* Under the torch the same marks flare bright, so you can see what polishing takes away. */}
            <pattern
              id={u("swirlLit")}
              width="43"
              height="43"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(21)"
            >
              <path
                d="M3 24 A15 15 0 0 1 30 12"
                fill="none"
                stroke="#fff"
                strokeOpacity="1"
                strokeWidth="1.15"
              />
              <path
                d="M9 38 A9 9 0 0 0 27 35"
                fill="none"
                stroke="#fff"
                strokeOpacity="0.9"
                strokeWidth="1"
              />
              <path
                d="M34 30 A7 7 0 0 1 41 38"
                fill="none"
                stroke="#fff"
                strokeOpacity="0.85"
                strokeWidth="1"
              />
            </pattern>
            <radialGradient id={u("fade")}>
              <stop offset="0" stopColor="#fff" />
              <stop offset="1" stopColor="#000" />
            </radialGradient>
            <mask
              id={u("torchMask")}
              maskUnits="userSpaceOnUse"
              x="-100"
              y="-100"
              width="600"
              height="340"
            >
              <circle data-torch-xy cx="-300" cy="-300" r="74" fill={ref("fade")} />
            </mask>
          </>
        )}
        <radialGradient id={u("shadow")}>
          <stop offset="0" stopColor="#000" stopOpacity="0.5" />
          <stop offset="1" stopColor="#000" stopOpacity="0" />
        </radialGradient>
        <clipPath id={u("body")}>
          <path d={BODY} />
        </clipPath>
      </defs>

      {/* Contact shadow: the car sits on something. */}
      <ellipse cx="200" cy="129" rx="186" ry="5.5" fill={ref("shadow")} />

      {/* Body */}
      <path d={BODY} fill={ref("paint")} />
      <g clipPath={ref("body")}>
        {finished ? (
          <>
            {/* The sky in the roof, bonnet and hatch. */}
            <rect x="0" y="0" width="400" height="60" fill={ref("sky")} />
            {/* A bright belt line, a sharp horizon, then dark below it. */}
            <rect x="0" y="49" width="400" height="22" fill={ref("belt")} />
            <rect x="0" y="71" width="400" height="1.4" fill="#000" fillOpacity="0.55" />
            {/* The orange floor bouncing up the sill. */}
            <rect x="0" y="95" width="400" height="13" fill={ref("bounce")} />
            {/* Studio strip lights, skewed across the doors. */}
            <path d="M40 68 C130 60 250 58 346 66 C250 63.4 130 64 40 68 Z" fill={ref("strip")} />
            <path
              d="M70 86 C150 82 240 82 320 86 C240 84.6 150 84.6 70 86 Z"
              fill={ref("strip")}
              fillOpacity="0.5"
            />
            {/* One pass of light after the finish arrives; it never repeats and is off under reduced motion. */}
            <path
              className="car-pass"
              d="M0 0 L46 0 L20 140 L-26 140 Z"
              fill="#fff"
              fillOpacity="0.3"
            />
            {/* Rocker panel, for weight. */}
            <path d="M0 104 L400 105 L400 120 L0 120 Z" fill="#000" fillOpacity="0.5" />
          </>
        ) : (
          <>
            <rect x="0" y="0" width="400" height="140" fill="#fff" fillOpacity="0.1" />
            <g opacity="0.7">
              <rect x="0" y="0" width="400" height="140" fill={ref("swirl")} />
              <rect x="0" y="0" width="400" height="140" fill={ref("swirl2")} />
            </g>
            <rect
              className="torch"
              x="0"
              y="0"
              width="400"
              height="140"
              fill={ref("swirlLit")}
              mask={ref("torchMask")}
            />
            <path d="M0 104 L400 105 L400 120 L0 120 Z" fill="#000" fillOpacity="0.16" />
          </>
        )}
      </g>

      {/* Glass and pillars */}
      <path d={GLASS_REAR} fill={ref("glass")} />
      <path d={GLASS_FRONT} fill={ref("glass")} />
      {finished ? (
        <>
          <path d="M84 49 L108 49 L138 22.6 L120 25 Z" fill="#fff" fillOpacity="0.15" />
          <path d="M208 49 L234 49 L226 22 L214 21.6 Z" fill="#fff" fillOpacity="0.13" />
        </>
      ) : null}
      <path d={PILLAR_B} fill={ref("paint")} />

      {/* Panel gaps, handles, mirror */}
      <g
        fill="none"
        stroke="#000"
        strokeOpacity={finished ? 0.65 : 0.28}
        strokeWidth="0.9"
        strokeLinecap="round"
      >
        <path d="M64 50 C65 72 65 94 64 110" />
        <path d="M178 50 L179 110" />
        <path d="M270 50 C271 68 270 92 267 110" />
        <path d="M112 105.5 L288 106.5" />
      </g>
      <rect
        x="198"
        y="58"
        width="16"
        height="3.4"
        rx="1.7"
        fill={finished ? "#c7ccd2" : "#5f5e5a"}
      />
      <rect
        x="116"
        y="59"
        width="14"
        height="3.2"
        rx="1.6"
        fill={finished ? "#c7ccd2" : "#5f5e5a"}
      />
      <path
        d="M268 44 L283 43 C287.4 44.4 287.4 49.4 283 50.4 L270 50.6 Z"
        fill={finished ? "#0a0b0d" : "#6b6a66"}
      />

      {finished ? (
        <>
          {/* A rim light along the whole edge, chrome around the glass, and the sill lit in the brand orange. */}
          <path d={BODY} fill="none" stroke="#fff" strokeOpacity="0.16" strokeWidth="1" />
          <path d="M66 49.8 L274 49.8" stroke="#fff" strokeOpacity="0.5" strokeWidth="0.9" />
          <path
            d="M110 104.4 L290 105.2"
            stroke="#e84a0c"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </>
      ) : null}

      {/* Lamps: a slim tail light up the edge of the tailgate and a narrow LED headlamp. */}
      <path
        d="M14.5 68 L16 60 C18 57 22 55 27 54 L27.5 59 C23 60.2 20 62 18.5 66 Z"
        fill={finished ? "#e84a0c" : "#6d6c67"}
      />
      <path
        d="M356 62 C368 64 380 70 386 80 L382 82 C376 74 366 69 354 67 Z"
        fill={finished ? "#fff2e6" : "#8a8983"}
      />
      <path
        d="M371 101 L388 101 L384 109 L371 109 Z"
        fill="#000"
        fillOpacity={finished ? 0.55 : 0.3}
      />

      {/* Wheels */}
      {WHEELS.map(({ cx, cy }) => (
        <g key={cx}>
          <circle cx={cx} cy={cy} r="31.5" fill="#050506" clipPath={ref("body")} />
          <circle cx={cx} cy={cy} r="27" fill={finished ? "#0c0d0f" : "#3d3c39"} />
          <circle
            cx={cx}
            cy={cy}
            r="24.4"
            fill="none"
            stroke="#fff"
            strokeOpacity="0.09"
            strokeWidth="1"
          />
          <circle cx={cx} cy={cy} r="19.8" fill={ref("rim")} />
          <circle cx={cx} cy={cy} r="17.6" fill="#111316" />
          {/* Brake caliper behind the spokes: the brand orange. */}
          <path
            d={`M${pt(cx, cy, 9, -30)} L${pt(cx, cy, 16.4, -30)} A16.4 16.4 0 0 1 ${pt(cx, cy, 16.4, 35)} L${pt(cx, cy, 9, 35)} A9 9 0 0 0 ${pt(cx, cy, 9, -30)} Z`}
            fill="#e84a0c"
            fillOpacity={finished ? 1 : 0.45}
          />
          {SPOKE_ANGLES.map((a) => (
            <path key={a} d={spoke(cx, cy, a)} fill={ref("rim")} />
          ))}
          <circle cx={cx} cy={cy} r="4.2" fill={finished ? "#15171a" : "#5b5a56"} />
          <circle cx={cx} cy={cy} r="1.7" fill="#e84a0c" fillOpacity={finished ? 1 : 0.5} />
        </g>
      ))}
    </svg>
  );
}

/**
 * The 50/50 line and the inspection torch, drawn over both paintings. The line
 * marks exactly where the finish has reached and travels with it; the torch is a
 * pool of light that follows a finger or cursor across the paint. Only the
 * paint is lit, never the background.
 */
export function CarOverlay({
  edgeX,
  showEdge,
  animate,
}: {
  /** Where the line sits, in the car's 400 unit width. */
  edgeX: number;
  showEdge: boolean;
  animate: boolean;
}) {
  const id = useId().replace(/:/g, "");
  return (
    <svg viewBox={`0 8 ${CAR_W} ${CAR_H}`} className="absolute inset-0 h-full w-full" aria-hidden>
      <defs>
        <clipPath id={`ob-${id}`}>
          <path d={BODY} />
        </clipPath>
        <linearGradient
          id={`edge-${id}`}
          gradientUnits="userSpaceOnUse"
          x1="0"
          y1="8"
          x2="0"
          y2="140"
        >
          <stop offset="0" stopColor="#fff" />
          <stop offset="1" stopColor="#e84a0c" />
        </linearGradient>
        <radialGradient id={`glow-${id}`}>
          <stop offset="0" stopColor="#fff" stopOpacity="0.75" />
          <stop offset="0.45" stopColor="#fff" stopOpacity="0.26" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <g clipPath={`url(#ob-${id})`}>
        <line
          x1="16"
          y1="8"
          x2="-16"
          y2="140"
          stroke={`url(#edge-${id})`}
          strokeWidth="1.6"
          style={{
            transform: `translateX(${edgeX}px)`,
            transition: animate ? "transform 1000ms var(--ease-out)" : "none",
            opacity: showEdge ? 1 : 0,
          }}
        />
        <circle
          className="torch"
          data-torch-xy
          cx="-300"
          cy="-300"
          r="68"
          fill={`url(#glow-${id})`}
        />
      </g>
    </svg>
  );
}
