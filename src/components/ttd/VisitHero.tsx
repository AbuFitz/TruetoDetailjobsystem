import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { Check } from "lucide-react";
import { UK_TIME } from "@/lib/uk-time";
import { cn } from "@/lib/utils";
import { useCountUp } from "@/hooks/use-motion";
import { FinishStage } from "@/components/ttd/FinishStage";
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

/**
 * The customer's finish, on the surface behind the portal's hero. Each
 * completed visit is one section of the panel taken from haze to mirror; the
 * 50/50 line sits where they have got to, and seven visits is the whole panel.
 * The seven columns along the bottom are the real visits (tap one to see which,
 * and the rail of visits below follows). What the reward itself is has not been
 * defined in the project, so nothing here describes it.
 */
export function VisitHero({
  visits,
  required,
  storageKey,
  selected,
  onSelect,
}: {
  /** Completed visits, oldest first. */
  visits: RewardVisit[];
  required: number;
  /** Who this is for, so "last seen" is per customer on a shared device. */
  storageKey: string;
  selected: number | null;
  onSelect: (n: number) => void;
}) {
  const total = visits.length;
  const view = rewardsView(total, required);
  const shownCount = useCountUp(view.earned, { durationMs: 800 });

  // What is new since this device last looked, read once and before the surface
  // draws, so a new visit is seen travelling in from where it last was.
  const [moment] = useState<{ seen: number | null; celebration: Celebration | null }>(() => {
    const seen = readLastSeen(storageKey);
    return { seen, celebration: celebrationFor(seen, total, required) };
  });
  useEffect(() => {
    writeLastSeen(storageKey, total);
  }, [storageKey, total]);
  const { celebration, seen } = moment;

  const latest = Math.min(total, required);
  const focus = selected ?? (latest > 0 ? latest : null);
  const columns = useMemo(() => Array.from({ length: required }, (_, i) => i + 1), [required]);
  const isNew = (n: number) => celebration?.newStamps.includes(n) ?? false;

  let detail: string;
  if (focus === null) {
    detail = "Your first completed visit takes the first section from haze to mirror.";
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
    <FinishStage
      surface="visits"
      level={view.fraction}
      from={celebration && seen !== null ? Math.min(seen, required) / required : undefined}
      pass={Boolean(celebration)}
      focus={focus === null ? null : (focus - 0.5) / required}
    >
      <section
        aria-label="TTD Rewards"
        className="absolute inset-x-0 bottom-0 pt-24 text-ink-foreground"
      >
        {/* A calm ground for the numbers and ticks, so they never fight the reflections. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_top,rgb(12_12_12/0.78)_0%,rgb(12_12_12/0.35)_38%,transparent_70%),linear-gradient(to_right,rgb(12_12_12/0.62)_0%,rgb(12_12_12/0.2)_42%,transparent_68%)]"
        />
        <div className="pointer-events-none relative mx-auto w-full max-w-6xl px-5 sm:px-8">
          <div className="flex flex-wrap items-end gap-x-5 gap-y-1">
            <p
              role="img"
              aria-label={`${view.earned} of ${required} qualifying visits`}
              className="flex items-end gap-2"
            >
              <span className="font-display text-[64px] leading-[0.8] tabular-nums sm:text-[80px]">
                {shownCount}
              </span>
              <span className="eyebrow pb-1 text-ink-foreground/60">of {required}</span>
            </p>
            <p className="pb-0.5 font-display text-[26px] leading-none sm:text-[32px]">
              {view.reached
                ? "YOU ARE THERE"
                : `${view.remaining} MORE ${view.remaining === 1 ? "VISIT" : "VISITS"}`}
            </p>
            {view.reached ? (
              <span className="pop-in mb-1 bg-signal px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-signal-foreground">
                Milestone reached
              </span>
            ) : null}
          </div>

          {celebration ? (
            <p
              role="status"
              className="slide-down mt-3 inline-flex items-center gap-2 border-l-2 border-signal bg-ink/60 px-3 py-1.5 text-[13px] font-semibold backdrop-blur-sm"
            >
              <Check className="h-4 w-4 shrink-0 text-signal" strokeWidth={3} />
              {celebration.milestone
                ? "That is visit " + required + ". Milestone reached."
                : celebration.newStamps.length > 1
                  ? `${celebration.newStamps.length} new visits counted.`
                  : `New visit counted. That is visit ${celebration.newStamps[0]} of ${required}.`}
            </p>
          ) : null}

          <p
            aria-live="polite"
            className="mt-2 min-h-[20px] text-[13px] text-ink-foreground/70 [text-shadow:0_1px_8px_rgb(0_0_0/0.8)]"
          >
            {detail}
          </p>
        </div>

        <ol
          className="relative mt-1 grid"
          style={{ gridTemplateColumns: `repeat(${required}, minmax(0, 1fr))` }}
        >
          {columns.map((n) => {
            const earned = n <= total;
            const next = n === total + 1;
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
                  onClick={() => onSelect(n)}
                  className="press group flex min-h-14 w-full items-center justify-center outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-signal"
                >
                  <span
                    className={cn(
                      "grid min-w-[30px] place-items-center rounded-full px-2 py-1 font-mono text-[12px] font-medium tabular-nums transition-colors",
                      earned ? "text-ink-foreground" : "bg-ink/55 text-ink-foreground/85",
                      next && "glow-next bg-ink/70 text-signal",
                      focus === n && "bg-ink-foreground text-ink",
                      isNew(n) && "pop-in",
                    )}
                    style={isNew(n) ? { animationDelay: `${900 + n * 40}ms` } : undefined}
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
      </section>
    </FinishStage>
  );
}
