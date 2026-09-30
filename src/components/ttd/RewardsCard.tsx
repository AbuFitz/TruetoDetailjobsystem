import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { format } from "date-fns";
import { ArrowRight, Check, Sparkles } from "lucide-react";
import { UK_TIME } from "@/lib/uk-time";
import { cn } from "@/lib/utils";
import { useCountUp, usePrefersReducedMotion } from "@/hooks/use-motion";
import { Car, CarOverlay, CAR_H, CAR_W } from "@/components/ttd/RewardsCar";
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
  const reduced = usePrefersReducedMotion();
  const stage = useRef<HTMLDivElement>(null);
  const graphic = useRef<HTMLDivElement>(null);
  const frame = useRef(0);

  // The inspection torch: a pool of light that follows a finger or cursor over the
  // paint, like a detailer checking a panel. Purely decorative, so it is off for
  // anyone who asks for less motion, and it moves transform-free attributes on
  // three small elements at most once a frame.
  const aim = (e: React.PointerEvent) => {
    const g = graphic.current;
    const host = stage.current;
    if (reduced || !g || !host) return;
    const r = g.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * CAR_W;
    const y = 8 + ((e.clientY - r.top) / r.height) * CAR_H;
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      g.querySelectorAll("[data-torch-xy]").forEach((el) => {
        el.setAttribute("cx", x.toFixed(1));
        el.setAttribute("cy", y.toFixed(1));
      });
      host.dataset["torch"] = "on";
    });
  };
  const stow = () => {
    cancelAnimationFrame(frame.current);
    if (stage.current) delete stage.current.dataset["torch"];
  };

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
      <div
        ref={stage}
        onPointerMove={aim}
        onPointerDown={aim}
        onPointerLeave={stow}
        onPointerUp={stow}
        onPointerCancel={stow}
        className="relative -mx-5 mb-4 mt-3 touch-pan-y pb-8 sm:mx-auto sm:max-w-[440px]"
      >
        <div
          ref={graphic}
          role="img"
          aria-label={`${view.earned} of ${required} qualifying visits`}
          className="relative w-full"
          style={{ aspectRatio: `${CAR_W} / ${CAR_H}` }}
        >
          <Car finished={false} />
          {/* The stretch of road under the chosen visit lights up, and slides as the choice changes. */}
          {focus !== null ? (
            <span
              aria-hidden
              className="absolute bottom-[1.5%] left-0 h-[3px] bg-signal"
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
          <CarOverlay
            edgeX={clip.p * (CAR_W / 100)}
            showEdge={clip.p > 0 && clip.p < 100}
            animate={clip.animate}
          />
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
