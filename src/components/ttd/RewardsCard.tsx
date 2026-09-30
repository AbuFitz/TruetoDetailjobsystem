import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { format } from "date-fns";
import { ArrowRight, Check, Gift, Sparkles } from "lucide-react";
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

const RING_R = 46;
const RING_C = 2 * Math.PI * RING_R;

/**
 * TTD Rewards, shown as a stamp card made of the customer's real completed
 * visits. Each stamp is one visit (tap it to see which). The ring and stamps
 * fill in when the card appears, and a new stamp gets a one-off "earned"
 * moment the first time this device sees it. What the reward itself is has
 * not been defined in the project, so the card never describes it.
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
  const [ringFraction, setRingFraction] = useState(0);
  const [celebration, setCelebration] = useState<Celebration | null>(null);
  const [selected, setSelected] = useState<number | null>(null);

  // Work out what is new since this device last looked, once, after mounting.
  useEffect(() => {
    const seen = readLastSeen(storageKey);
    setCelebration(celebrationFor(seen, total, required));
    writeLastSeen(storageKey, total);
  }, [storageKey, total, required]);

  // Let the ring travel from empty to where the customer is.
  useEffect(() => {
    const id = requestAnimationFrame(() => setRingFraction(view.fraction));
    return () => cancelAnimationFrame(id);
  }, [view.fraction]);

  const stamps = useMemo(() => Array.from({ length: required }, (_, i) => i + 1), [required]);
  const latest = Math.min(total, required);
  const focus = selected ?? (latest > 0 ? latest : null);
  const isNew = (n: number) => celebration?.newStamps.includes(n) ?? false;

  let detail: string;
  if (focus === null) {
    detail = "Your first completed visit earns your first stamp.";
  } else if (focus <= total) {
    const v = visits[focus - 1]!;
    detail = `Stamp ${focus}: ${v.package_name}, ${format(new Date(v.scheduled_start), "d MMM yyyy", { in: UK_TIME })}`;
  } else {
    const away = focus - total;
    detail =
      away === 1
        ? `Stamp ${focus} is next. It comes with your next completed visit.`
        : `Stamp ${focus} is ${away} visits away.`;
  }

  return (
    <section
      aria-label="TTD Rewards"
      className={cn(
        "relative overflow-hidden rounded-2xl border bg-surface p-5 shadow-card",
        view.reached ? "border-signal/50" : "border-hairline",
      )}
    >
      {/* Once the goal is reached the card keeps a signal edge, so it reads as different from one still in progress. */}
      {view.reached ? (
        <span className="absolute inset-x-0 top-0 h-1 bg-signal" aria-hidden />
      ) : null}
      {celebration?.milestone ? <Burst count={18} spread={120} /> : null}

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

      <div className="mt-4 flex items-center gap-5">
        <div
          className="relative h-[112px] w-[112px] shrink-0"
          role="img"
          aria-label={`${view.earned} of ${required} qualifying visits`}
        >
          <svg viewBox="0 0 112 112" className="h-full w-full -rotate-90" aria-hidden>
            <circle
              cx="56"
              cy="56"
              r={RING_R}
              fill="none"
              stroke="var(--hairline)"
              strokeWidth="9"
            />
            <circle
              cx="56"
              cy="56"
              r={RING_R}
              fill="none"
              stroke="var(--signal)"
              strokeWidth="9"
              strokeLinecap="round"
              strokeDasharray={RING_C}
              strokeDashoffset={RING_C * (1 - ringFraction)}
              style={{ transition: "stroke-dashoffset 900ms var(--ease-out)" }}
            />
          </svg>
          <div className="absolute inset-0 grid place-content-center text-center">
            <p className="font-display text-[44px] leading-[0.85] tabular-nums">{shownCount}</p>
            <p className="eyebrow mt-1 text-muted-foreground">of {required}</p>
          </div>
        </div>

        <div className="min-w-0">
          <p className="font-display text-[28px] leading-[0.95]">
            {view.reached
              ? "YOU ARE THERE"
              : `${view.remaining} MORE ${view.remaining === 1 ? "VISIT" : "VISITS"}`}
          </p>
          <p className="mt-1.5 text-[13px] leading-snug text-muted-foreground">
            {view.reached
              ? `${total} completed ${total === 1 ? "visit" : "visits"} so far.`
              : "Every completed detail adds a stamp."}
          </p>
        </div>
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
              ? `${celebration.newStamps.length} new stamps earned.`
              : `New stamp earned. That is visit ${celebration.newStamps[0]} of ${required}.`}
        </p>
      ) : null}

      <div className="relative mt-5">
        {/* A track behind the stamps: the gaps between them show how far along the card is. */}
        <span
          aria-hidden
          className="pointer-events-none absolute top-1/2 h-0.5 -translate-y-1/2 bg-hairline"
          style={{ left: `${50 / required}%`, right: `${50 / required}%` }}
        />
        <span
          aria-hidden
          className="pointer-events-none absolute top-1/2 h-0.5 origin-left -translate-y-1/2 bg-signal"
          style={{
            left: `${50 / required}%`,
            right: `${50 / required}%`,
            transform: `translateY(-50%) scaleX(${
              ringFraction > 0 && required > 1 ? Math.min(1, (total - 1) / (required - 1)) : 0
            })`,
            transition: "transform 900ms var(--ease-out)",
          }}
        />
        <ol
          className="relative grid gap-1.5"
          style={{ gridTemplateColumns: `repeat(${required}, 1fr)` }}
        >
          {stamps.map((n) => {
            const earned = n <= total;
            const next = n === total + 1;
            const last = n === required;
            const fresh = isNew(n);
            const label = earned
              ? `Stamp ${n}, earned ${format(new Date(visits[n - 1]!.scheduled_start), "d MMMM yyyy", { in: UK_TIME })}`
              : next
                ? `Stamp ${n}, next`
                : `Stamp ${n}, not yet earned`;
            return (
              <li key={n} className="relative">
                {fresh ? <Burst count={10} spread={46} delay={n * 30} /> : null}
                <button
                  type="button"
                  aria-label={label}
                  aria-pressed={focus === n}
                  onClick={() => setSelected(n)}
                  style={
                    earned
                      ? ({
                          "--sheen-delay": `${300 + n * 110}ms`,
                          animationDelay: `${n * 70}ms`,
                        } as React.CSSProperties)
                      : undefined
                  }
                  className={cn(
                    "press relative grid aspect-square w-full place-items-center rounded-full border-2 text-[11px] font-bold",
                    earned &&
                      cn(
                        "sheen border-signal bg-signal text-signal-foreground",
                        fresh ? "stamp-in" : "fade-in",
                      ),
                    !earned &&
                      (next
                        ? "glow-next border-signal/70 text-signal-deep"
                        : "border-dashed border-hairline text-muted-foreground/55"),
                    !earned && "bg-surface",
                    focus === n && "ring-2 ring-foreground/70 ring-offset-2 ring-offset-surface",
                  )}
                >
                  {earned ? (
                    last ? (
                      <Gift className="h-3.5 w-3.5" strokeWidth={2.6} />
                    ) : (
                      <Check className="h-3.5 w-3.5" strokeWidth={3.2} />
                    )
                  ) : last ? (
                    <Gift className="h-3.5 w-3.5" strokeWidth={2.2} />
                  ) : (
                    n
                  )}
                </button>
              </li>
            );
          })}
        </ol>
      </div>

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

/** A small one-off burst of flecks. Hidden entirely under reduced motion by the stylesheet. */
function Burst({ count, spread, delay = 0 }: { count: number; spread: number; delay?: number }) {
  const dots = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        const angle = (i / count) * Math.PI * 2 + (i % 2 ? 0.3 : 0);
        const dist = spread * (0.55 + ((i * 37) % 45) / 100);
        return {
          bx: `${Math.round(Math.cos(angle) * dist)}px`,
          by: `${Math.round(Math.sin(angle) * dist)}px`,
          br: `${(i % 2 ? 1 : -1) * (80 + ((i * 53) % 120))}deg`,
          bd: `${delay + (i % 4) * 30}ms`,
          dark: i % 3 === 0,
        };
      }),
    [count, spread, delay],
  );
  return (
    <span aria-hidden className="pointer-events-none absolute inset-0 z-10">
      {dots.map((d, i) => (
        <span
          key={i}
          className="burst-dot"
          style={
            {
              "--bx": d.bx,
              "--by": d.by,
              "--br": d.br,
              "--bd": d.bd,
              background: d.dark ? "var(--ink)" : undefined,
            } as React.CSSProperties
          }
        />
      ))}
    </span>
  );
}
