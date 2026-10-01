import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type BookStep = "vehicle" | "schedule" | "review" | "done";

const STEPS: { key: Exclude<BookStep, "done">; label: string }[] = [
  { key: "vehicle", label: "Vehicle and package" },
  { key: "schedule", label: "When and where" },
  { key: "review", label: "Confirm" },
];

/**
 * Where you are in the booking and what it costs so far. Three real steps; the
 * ones already done take you back to them. The total is the live total from
 * the choices made, never an estimate. Nothing on it moves.
 */
export function BookProgress({
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
  const at = step === "done" ? STEPS.length : STEPS.findIndex((s) => s.key === step);
  return (
    <section aria-label="Booking progress" className="mb-8 border-b border-hairline pb-6">
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="eyebrow text-muted-foreground">
            {step === "done" ? "Booked in" : `Step ${at + 1} of ${STEPS.length}`}
          </p>
          <p className="mt-1 text-[13px] leading-snug text-muted-foreground">{summary}</p>
        </div>
        {step === "done" ? null : (
          <p
            className="shrink-0 font-display text-[40px] leading-none"
            aria-label={`Total so far, ${total} pounds`}
          >
            £{total}
          </p>
        )}
      </div>
      <ol aria-label="Booking steps" className="mt-4 grid grid-cols-3 gap-1.5">
        {STEPS.map((s, i) => {
          const done = i < at;
          const now = i === at;
          const bar = (
            <>
              <span
                className={cn(
                  "block h-1.5 rounded-sm",
                  done || now ? "bg-signal" : "bg-hairline",
                  now && "opacity-100",
                )}
              />
              <span
                className={cn(
                  "mt-2 flex items-center gap-1.5 text-[12px] leading-tight",
                  done || now ? "font-semibold text-foreground" : "text-muted-foreground",
                )}
              >
                {done ? (
                  <Check className="h-3.5 w-3.5 shrink-0 text-signal-deep" strokeWidth={3.2} />
                ) : (
                  <span className="font-mono text-[11px]">{i + 1}</span>
                )}
                {s.label}
              </span>
            </>
          );
          return (
            <li key={s.key} aria-current={now ? "step" : undefined} className="min-w-0">
              {done && step !== "done" ? (
                <button
                  type="button"
                  onClick={() => onStep(s.key)}
                  aria-label={`Go back to ${s.label}`}
                  className="min-h-11 w-full text-left"
                >
                  {bar}
                </button>
              ) : (
                <div className="min-h-11">{bar}</div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
