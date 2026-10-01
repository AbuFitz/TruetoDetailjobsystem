import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { format } from "date-fns";
import { ArrowRight, Check, Gift } from "lucide-react";
import { UK_TIME } from "@/lib/uk-time";
import { cn } from "@/lib/utils";
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
 * TTD Rewards as a plain record: how many visits are counted, how many are
 * left, and the visits themselves, one row each. Nothing moves. Every figure
 * is the customer's real completed visits. What the reward itself is has not
 * been defined in the project, so the card never describes it.
 */
export function RewardsCard({
  visits,
  required,
  storageKey,
  className,
}: {
  /** Completed visits, oldest first. */
  visits: RewardVisit[];
  required: number;
  /** Who this is for, so "last seen" is per customer on a shared device. */
  storageKey: string;
  className?: string;
}) {
  const total = visits.length;
  const view = rewardsView(total, required);

  // What is new since this device last looked, read once, then remembered.
  const [celebration] = useState<Celebration | null>(() =>
    celebrationFor(readLastSeen(storageKey), total, required),
  );
  useEffect(() => {
    writeLastSeen(storageKey, total);
  }, [storageKey, total]);

  const counted = visits.slice(0, required);
  const next = total + 1;
  const showMilestoneRow = !view.reached && required > next;

  return (
    <section
      aria-label="TTD Rewards"
      className={cn(
        "rounded-2xl bg-ink p-5 text-ink-foreground ring-1 ring-white/10 sm:p-6",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="eyebrow text-ink-foreground/55">TTD Rewards</p>
          <p className="mt-2 font-display text-[40px] leading-[0.92]">
            {view.reached
              ? "MILESTONE REACHED"
              : `${view.remaining} MORE ${view.remaining === 1 ? "VISIT" : "VISITS"}`}
          </p>
        </div>
        <p
          role="img"
          aria-label={`${view.earned} of ${required} qualifying visits`}
          className="shrink-0 text-right font-display leading-none"
        >
          <span className="text-[44px] tabular-nums">{view.earned}</span>
          <span className="text-[22px] text-ink-foreground/50"> / {required}</span>
        </p>
      </div>

      <div
        aria-hidden
        className="mt-5 grid gap-1.5"
        style={{ gridTemplateColumns: `repeat(${required}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: required }, (_, i) => {
          const n = i + 1;
          return (
            <span
              key={n}
              className={cn(
                "h-2.5 rounded-sm",
                n <= total
                  ? "bg-signal"
                  : n === next
                    ? "border border-signal bg-transparent"
                    : "bg-ink-foreground/18",
              )}
            />
          );
        })}
      </div>

      <p className="mt-3 text-[13px] leading-snug text-ink-foreground/65">
        {view.reached
          ? `${total} completed ${total === 1 ? "visit" : "visits"} so far.`
          : "Every completed detail counts as one visit."}
      </p>

      {celebration ? (
        <p
          role="status"
          className="mt-4 flex items-center gap-2 border-l-2 border-signal bg-white/6 px-3 py-2 text-[13px] font-semibold"
        >
          <Check className="h-4 w-4 shrink-0 text-signal" strokeWidth={3} />
          {celebration.milestone
            ? `That is visit ${required}. Milestone reached.`
            : celebration.newStamps.length > 1
              ? `${celebration.newStamps.length} new visits counted.`
              : `New visit counted. That is visit ${celebration.newStamps[0]} of ${required}.`}
        </p>
      ) : null}

      <ol className="mt-4 divide-y divide-white/10 border-y border-white/10">
        {counted.map((v, i) => (
          <li key={v.id} className="flex items-center gap-3 py-2.5">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-signal text-signal-foreground">
              <Check className="h-3.5 w-3.5" strokeWidth={3.2} />
            </span>
            <span className="min-w-0 flex-1 text-[14px]">
              <span className="font-semibold">Visit {i + 1}</span>
              <span className="text-ink-foreground/65"> · {v.package_name}</span>
            </span>
            <span className="shrink-0 text-[12px] tabular-nums text-ink-foreground/65">
              {format(new Date(v.scheduled_start), "d MMM yyyy", { in: UK_TIME })}
            </span>
          </li>
        ))}
        {!view.reached ? (
          <li className="flex items-center gap-3 py-2.5">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-dashed border-signal text-[11px] font-bold text-signal">
              {next}
            </span>
            <span className="min-w-0 flex-1 text-[14px]">
              <span className="font-semibold">Visit {next}</span>
              <span className="text-ink-foreground/65"> · Next</span>
            </span>
          </li>
        ) : null}
        {showMilestoneRow ? (
          <li className="flex items-center gap-3 py-2.5 text-ink-foreground/65">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-dashed border-ink-foreground/30">
              <Gift className="h-3.5 w-3.5" strokeWidth={2.2} />
            </span>
            <span className="min-w-0 flex-1 text-[14px]">Visit {required} · Milestone</span>
          </li>
        ) : null}
      </ol>

      {!view.reached ? (
        <Link
          to="/book"
          className="press mt-3 inline-flex min-h-11 items-center gap-2 text-[12px] font-bold uppercase tracking-[0.12em] text-signal"
        >
          Book your next detail <ArrowRight className="h-4 w-4" strokeWidth={2.6} />
        </Link>
      ) : null}
    </section>
  );
}
