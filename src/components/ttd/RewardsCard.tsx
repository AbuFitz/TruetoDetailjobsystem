import { useEffect, useId, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { format } from "date-fns";
import { ArrowRight, Check, Sparkles } from "lucide-react";
import { UK_TIME } from "@/lib/uk-time";
import { cn } from "@/lib/utils";
import { useCountUp } from "@/hooks/use-motion";
import {
  celebrationFor,
  readLastSeen,
  rewardsView,
  writeLastSeen,
  type Celebration,
} from "@/lib/rewards";

export interface RewardVisit {
  id: string;
  scheduled_start: string;
  package_name: string;
}

/*
 * The car, drawn once and painted twice. Facing right, on a 280 x 100 grid, so
 * seven equal columns cut it into seven passes.
 */
const BODY =
  "M6 80 L6 62 C6 56 10 54 18 52 L56 48 C72 26 96 14 132 14 L166 14 C190 14 206 28 224 46 L258 54 C270 56 274 62 274 70 L274 80 Z";
const GLASS = [
  "M64 46 C78 30 98 20 130 20 L147 20 L147 46 Z",
  "M155 20 L166 20 C184 20 197 31 210 45 L155 45 Z",
];
const WHEELS = [72, 214];
const EMPTY = -5;
/** Where the finish edge sits for a given fraction. Past the nose at 1, so the whole car is covered. */
const edge = (f: number) => (f >= 1 ? 104 : f <= 0 ? EMPTY : f * 100);
/** A slanted edge, like the light-pass, not a hard progress-bar cut. */
const finishClip = (p: number) => `polygon(0 0, ${p + 4}% 0, ${p - 4}% 100%, 0 100%)`;

/**
 * TTD Rewards, shown as the customer's car being finished. Each completed
 * visit is one pass of the polisher: the next seventh of the car goes from
 * matte primer outline to deep gloss, with a single light-pass across it and
 * the brand's orange pin-stripe along the sill. Seven passes finish the whole
 * car. Each column is one real visit (tap it to see which). The finish edge
 * travels from where this device last saw the car to where it is now, so a new
 * visit is seen being added. What the reward itself is has not been defined in
 * the project, so the card never describes it.
 */
export function RewardsCard({
  visits,
  required,
  storageKey,
}: {
  /** Completed visits, oldest first. */
  visits: RewardVisit[];
  required: number;
  /** Who this is for, so the "last seen" memory is per customer on a shared device. */
  storageKey: string;
}) {
  const total = visits.length;
  const view = rewardsView(total, required);
  const shownCount = useCountUp(view.earned, { durationMs: 800 });
  const [clip, setClip] = useState({ p: EMPTY, animate: false });
  const [celebration, setCelebration] = useState<Celebration | null>(null);
  const [selected, setSelected] = useState<number | null>(null);

  // Work out what is new since this device last looked, then let the finish
  // edge travel from there to where the customer is now.
  useEffect(() => {
    const seen = readLastSeen(storageKey);
    const c = celebrationFor(seen, total, required);
    setCelebration(c);
    writeLastSeen(storageKey, total);
    const from = c && seen !== null ? edge(Math.min(seen, required) / required) : EMPTY;
    setClip({ p: from, animate: false });
    let r2 = 0;
    const r1 = requestAnimationFrame(() => {
      r2 = requestAnimationFrame(() =>
        setClip({ p: edge(rewardsView(total, required).fraction), animate: true }),
      );
    });
    return () => {
      cancelAnimationFrame(r1);
      cancelAnimationFrame(r2);
    };
  }, [storageKey, total, required]);

  const columns = useMemo(() => Array.from({ length: required }, (_, i) => i + 1), [required]);
  const latest = Math.min(total, required);
  const focus = selected ?? (latest > 0 ? latest : null);
  const isNew = (n: number) => celebration?.newStamps.includes(n) ?? false;

  let detail: string;
  if (focus === null) {
    detail = "Your first completed visit finishes the first section.";
  } else if (focus <= total) {
    const v = visits[focus - 1]!;
    detail = `Visit ${focus}: ${v.package_name}, ${format(new Date(v.scheduled_start), "d MMM yyyy", { in: UK_TIME })}`;
  } else {
    const away = focus - total;
    detail =
      away === 1
        ? `Visit ${focus} is next. It comes with your next completed visit.`
        : `Visit ${focus} is ${away} visits away.`;
  }

  return (
    <section
      id="ttd-rewards"
      aria-label="TTD Rewards"
      className={cn(
        "relative scroll-mt-24 overflow-hidden rounded-2xl border bg-surface p-5 shadow-card",
        view.reached ? "border-signal/50" : "border-hairline",
      )}
    >
      {/* Once the goal is reached the card keeps a signal edge, so it reads as different from one still in progress. */}
      {view.reached ? (
        <span className="absolute inset-x-0 top-0 h-1 bg-signal" aria-hidden />
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <p className="eyebrow flex items-center gap-1.5 text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5 text-signal" strokeWidth={2.4} />
          TTD Rewards
        </p>
        {view.reached ? (
          <span className="pop-in bg-signal px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-signal-foreground">
            Milestone reached
          </span>
        ) : null}
      </div>

      {/* The car runs edge to edge so each of the seven columns is a comfortable tap. */}
      <div className="relative -mx-5 mb-4 mt-3 pb-8 sm:mx-auto sm:max-w-[440px]">
        <div
          role="img"
          aria-label={`${view.earned} of ${required} qualifying visits`}
          className="relative aspect-[280/100] w-full"
        >
          <Car finished={false} />
          {/* The stretch of road under the chosen visit lights up, and slides as the choice changes. */}
          {focus !== null ? (
            <span
              aria-hidden
              className="absolute bottom-[3.5%] left-0 h-[3px] bg-signal"
              style={{
                width: `${100 / required}%`,
                transform: `translateX(${(focus - 1) * 100}%)`,
                transition: "transform var(--dur-base) var(--ease-out)",
              }}
            />
          ) : null}
          <div
            className="absolute inset-0"
            style={{
              clipPath: finishClip(clip.p),
              transition: clip.animate ? "clip-path 1000ms var(--ease-out)" : "none",
            }}
          >
            <Car finished />
          </div>
        </div>

        <ol
          className="absolute inset-0 grid"
          style={{ gridTemplateColumns: `repeat(${required}, minmax(0, 1fr))` }}
        >
          {columns.map((n) => {
            const earned = n <= total;
            const next = n === total + 1;
            const fresh = isNew(n);
            const label = earned
              ? `Visit ${n}, completed ${format(new Date(visits[n - 1]!.scheduled_start), "d MMMM yyyy", { in: UK_TIME })}`
              : next
                ? `Visit ${n}, next`
                : `Visit ${n}, not yet completed`;
            return (
              <li key={n} className="min-w-0">
                <button
                  type="button"
                  aria-label={label}
                  aria-pressed={focus === n}
                  onClick={() => setSelected(n)}
                  className={cn(
                    "press flex h-full w-full flex-col items-center justify-end pb-1 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                  )}
                >
                  <span
                    className={cn(
                      "grid min-w-[26px] place-items-center rounded-sm px-1.5 py-0.5 font-mono text-[12px] font-medium tabular-nums",
                      earned ? "text-foreground" : "text-muted-foreground",
                      next && "glow-next text-signal-deep",
                      focus === n && "bg-foreground text-background",
                      fresh && "pop-in",
                    )}
                    style={fresh ? { animationDelay: `${900 + n * 40}ms` } : undefined}
                  >
                    {earned ? (
                      <span className="flex items-center gap-0.5">
                        <Check className="h-3 w-3" strokeWidth={3.2} />
                        {n}
                      </span>
                    ) : (
                      n
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>

      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="font-display text-[28px] leading-[0.95]">
            {view.reached
              ? "YOU ARE THERE"
              : `${view.remaining} MORE ${view.remaining === 1 ? "VISIT" : "VISITS"}`}
          </p>
          <p className="mt-1.5 text-[13px] leading-snug text-muted-foreground">
            {view.reached
              ? `${total} completed ${total === 1 ? "visit" : "visits"} so far.`
              : "Every completed detail finishes another section."}
          </p>
        </div>
        <p className="shrink-0 text-right" aria-hidden>
          <span className="font-display text-[44px] leading-[0.85] tabular-nums">{shownCount}</span>
          <span className="eyebrow ml-1 text-muted-foreground">of {required}</span>
        </p>
      </div>

      {celebration ? (
        <p
          role="status"
          className="slide-down mt-4 flex items-center gap-2 border-l-2 border-signal bg-signal/8 px-3 py-2 text-[13px] font-semibold"
        >
          <Check className="h-4 w-4 shrink-0 text-signal-deep" strokeWidth={3} />
          {celebration.milestone
            ? "That is visit " + required + ". Milestone reached."
            : celebration.newStamps.length > 1
              ? `${celebration.newStamps.length} new visits counted.`
              : `New visit counted. That is visit ${celebration.newStamps[0]} of ${required}.`}
        </p>
      ) : null}

      <p aria-live="polite" className="mt-4 min-h-[20px] text-[13px] text-muted-foreground">
        {detail}
      </p>

      {!view.reached ? (
        <Link
          to="/book"
          className="press mt-3 inline-flex min-h-11 items-center gap-2 text-[12px] font-bold uppercase tracking-[0.12em] text-signal-deep"
        >
          Book your next detail <ArrowRight className="h-4 w-4" strokeWidth={2.6} />
        </Link>
      ) : null}
    </section>
  );
}

/**
 * One painting of the car. Unfinished is a dashed primer outline on the card's
 * own surface; finished is deep gloss with a glass line, the orange pin-stripe
 * and a single light-pass that runs once and stays off under reduced motion.
 */
function Car({ finished }: { finished: boolean }) {
  const uid = useId().replace(/:/g, "");
  const body = `body-${uid}`;
  const paint = `paint-${uid}`;
  const glass = `glass-${uid}`;
  const rim = "rgb(255 255 255 / 0.26)";
  // The unfinished car must still read as a car, on white and on dark.
  const primer = "color-mix(in srgb, var(--muted-foreground) 55%, transparent)";

  return (
    <svg viewBox="0 0 280 100" className="absolute inset-0 h-full w-full" aria-hidden>
      {finished ? (
        <defs>
          <linearGradient id={paint} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#3b3b40" />
            <stop offset="0.55" stopColor="#17171a" />
            <stop offset="1" stopColor="#0c0c0c" />
          </linearGradient>
          <linearGradient id={glass} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#7d8e9e" />
            <stop offset="1" stopColor="#1c242c" />
          </linearGradient>
          <clipPath id={body}>
            <path d={BODY} />
          </clipPath>
        </defs>
      ) : (
        <line x1="0" x2="280" y1="95.5" y2="95.5" stroke="var(--hairline)" strokeWidth="1" />
      )}

      <path
        d={BODY}
        fill={finished ? `url(#${paint})` : "var(--surface-2)"}
        stroke={finished ? rim : primer}
        strokeWidth="1.5"
        strokeDasharray={finished ? undefined : "3 3"}
        strokeLinejoin="round"
      />
      {finished ? (
        <>
          <path d="M10 66 L270 69" stroke="var(--signal)" strokeWidth="1.6" fill="none" />
          <g clipPath={`url(#${body})`}>
            <path d="M14 55 L252 57" stroke="#fff" strokeOpacity="0.28" strokeWidth="1.4" />
            <path
              className="car-pass"
              d="M0 0 L30 0 L10 100 L-20 100 Z"
              fill="#fff"
              fillOpacity="0.34"
            />
          </g>
        </>
      ) : null}
      {GLASS.map((d) => (
        <path
          key={d}
          d={d}
          fill={finished ? `url(#${glass})` : "var(--surface)"}
          stroke={finished ? rim : primer}
          strokeWidth="1"
          strokeLinejoin="round"
        />
      ))}
      {WHEELS.map((cx) => (
        <g key={cx}>
          <circle cx={cx} cy="80" r="20" fill="var(--surface)" />
          <circle
            cx={cx}
            cy="80"
            r="15"
            fill={finished ? "#0c0c0c" : "var(--surface-2)"}
            stroke={finished ? rim : primer}
            strokeWidth="1.5"
          />
          <circle
            cx={cx}
            cy="80"
            r="6"
            fill={finished ? "#6a6a70" : "var(--surface)"}
            stroke={finished ? undefined : primer}
          />
        </g>
      ))}
      {finished ? (
        <>
          <rect x="264" y="60" width="9" height="5" rx="2" fill="var(--signal)" />
          <rect x="6" y="58" width="4" height="8" rx="1.5" fill="var(--signal-deep)" />
        </>
      ) : null}
    </svg>
  );
}
