import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { FinishStage } from "@/components/ttd/FinishStage";

export type BookStep = "vehicle" | "schedule" | "review" | "done";

const STEPS: { key: Exclude<BookStep, "done">; label: string }[] = [
  { key: "vehicle", label: "Vehicle and package" },
  { key: "schedule", label: "When and where" },
  { key: "review", label: "Confirm" },
];

/** How far through the booking the surface is: a quarter for each part, whole once it is booked. */
const LEVEL: Record<BookStep, number> = { vehicle: 1 / 4, schedule: 1 / 2, review: 3 / 4, done: 1 };

/**
 * The same paint surface as the rest of the portal, now marking how far through
 * the booking you are: a quarter of the panel per part, the whole panel once it
 * is booked. The three parts along the bottom are the booking's real steps; the
 * ones already done take you back to them. The total is the live total from the
 * choices made, never an estimate.
 */
export function BookHero({
  step,
  total,
  summary,
  onStep,
}: {
  step: BookStep;
  total: number;
  /** "Full Valet Car Detail · Midsize" */
  summary: string;
  onStep: (s: Exclude<BookStep, "done">) => void;
}) {
  const at = step === "done" ? 3 : STEPS.findIndex((s) => s.key === step);
  return (
    <FinishStage
      surface="book"
      level={LEVEL[step]}
      focus={step === "done" ? null : (at + 0.5) / STEPS.length}
    >
      <section
        aria-label="Booking progress"
        className="pointer-events-none absolute inset-x-0 bottom-0 pt-24 text-ink-foreground"
      >
        <div
          aria-hidden
          className="absolute inset-0 bg-[linear-gradient(to_top,rgb(12_12_12/0.78)_0%,rgb(12_12_12/0.35)_38%,transparent_70%),linear-gradient(to_right,rgb(12_12_12/0.62)_0%,rgb(12_12_12/0.2)_42%,transparent_68%)]"
        />
        <div className="relative mx-auto w-full max-w-6xl px-5 pb-3 sm:px-8">
          {step === "done" ? (
            <p
              role="status"
              className="pop-in font-display text-[44px] leading-none sm:text-[56px]"
            >
              BOOKED IN
            </p>
          ) : (
            <div className="flex items-end gap-4">
              <p
                key={total}
                className="fade-in font-display text-[52px] leading-none sm:text-[64px]"
                aria-label={`Total so far, ${total} pounds`}
              >
                £{total}
              </p>
              <p className="mb-1.5 min-w-0 text-[13px] leading-snug text-ink-foreground/75 sm:text-[14px]">
                {summary}
              </p>
            </div>
          )}
        </div>
        <ol aria-label="Booking steps" className="relative mt-1 grid grid-cols-3">
          {STEPS.map((s, i) => {
            const done = i < at;
            const now = i === at;
            const inner = (
              <>
                <span
                  className={cn(
                    "mx-auto grid h-7 w-7 place-items-center rounded-full border-2 transition-colors",
                    done && "border-signal bg-signal text-signal-foreground",
                    now && "glow-next border-signal bg-ink/60 text-signal",
                    !done && !now && "border-ink-foreground/30 bg-ink/40",
                  )}
                >
                  {done ? (
                    <Check className="h-3.5 w-3.5" strokeWidth={3.2} />
                  ) : (
                    <span className="font-mono text-[11px] text-ink-foreground/80">{i + 1}</span>
                  )}
                </span>
                <span
                  className={cn(
                    "mt-1.5 block text-[11px] leading-tight sm:text-[12px]",
                    done || now ? "font-semibold" : "text-ink-foreground/60",
                  )}
                >
                  {s.label}
                </span>
              </>
            );
            return (
              <li
                key={s.key}
                className="min-w-0 text-center"
                aria-current={now ? "step" : undefined}
              >
                {done && step !== "done" ? (
                  <button
                    type="button"
                    onClick={() => onStep(s.key)}
                    aria-label={`Go back to ${s.label}`}
                    className="press pointer-events-auto w-full px-1.5 pb-3 pt-1 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-signal"
                  >
                    {inner}
                  </button>
                ) : (
                  <div className="px-1.5 pb-3 pt-1">{inner}</div>
                )}
              </li>
            );
          })}
        </ol>
      </section>
    </FinishStage>
  );
}
