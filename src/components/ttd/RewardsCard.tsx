import { useEffect, useState } from "react";
import { Check } from "lucide-react";
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
 * TTD Rewards as a small, plain record: how many visits are counted and how
 * many are left. The visits themselves are in the list on the same page. Nothing moves. Every figure
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

  const next = total + 1;

  return (
    <section
      aria-label="TTD Rewards"
      className={cn("rounded-2xl bg-ink p-5 text-ink-foreground ring-1 ring-white/10", className)}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="eyebrow text-ink-foreground/55">TTD Rewards</p>
          <p className="mt-1.5 font-display text-[30px] leading-[0.95]">
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
          <span className="text-[36px] tabular-nums">{view.earned}</span>
          <span className="text-[20px] text-ink-foreground/50"> / {required}</span>
        </p>
      </div>

      <div
        aria-hidden
        className="mt-4 grid gap-1.5"
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
          className="mt-3 flex items-center gap-2 border-l-2 border-signal bg-white/6 px-3 py-2 text-[13px] font-semibold"
        >
          <Check className="h-4 w-4 shrink-0 text-signal" strokeWidth={3} />
          {celebration.milestone
            ? `That is visit ${required}. Milestone reached.`
            : celebration.newStamps.length > 1
              ? `${celebration.newStamps.length} new visits counted.`
              : `New visit counted. That is visit ${celebration.newStamps[0]} of ${required}.`}
        </p>
      ) : null}
    </section>
  );
}
