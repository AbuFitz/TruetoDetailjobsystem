import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { CUSTOMER_STEPS, customerStepIndex } from "@/lib/progress";
import type { BookingStatus } from "@/lib/bookings";

/** Five steps, one line. The current step is highlighted; on a phone the labels stay under the dots. */
export function StepTracker({ status, className }: { status: BookingStatus; className?: string }) {
  const idx = customerStepIndex(status);
  // Steps fill in one after another when the tracker first appears, then follow status changes.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(id);
  }, []);
  if (idx === -1) return null;
  return (
    <ol className={cn("grid grid-cols-5 gap-1", className)} aria-label="Progress">
      {CUSTOMER_STEPS.map((step, i) => {
        const done = i < idx || (status === "completed" && i === 4);
        const active = i === Math.ceil(idx) && !done;
        return (
          <li key={step.key} className="flex min-w-0 flex-col items-center gap-2 text-center">
            <span className="relative flex w-full items-center justify-center">
              {i > 0 ? (
                <span
                  className="absolute right-1/2 top-1/2 h-[2px] w-full -translate-y-1/2 overflow-hidden bg-hairline"
                  aria-hidden
                >
                  <span
                    className="block h-full origin-left bg-signal transition-transform duration-500 ease-out"
                    style={{
                      transform: `scaleX(${ready && i <= idx ? 1 : 0})`,
                      transitionDelay: `${i * 90}ms`,
                    }}
                  />
                </span>
              ) : null}
              <span
                className={cn(
                  "state-transition relative z-10 grid h-7 w-7 place-items-center rounded-full border-2",
                  done && "border-signal bg-signal text-signal-foreground",
                  active && "glow-next border-signal bg-surface text-signal",
                  !done && !active && "border-hairline bg-surface text-transparent",
                )}
                aria-current={active ? "step" : undefined}
              >
                {done ? (
                  <Check className="h-3.5 w-3.5" strokeWidth={3.2} />
                ) : active ? (
                  <span className="h-2 w-2 rounded-full bg-signal" />
                ) : (
                  <span className="h-2 w-2 rounded-full bg-border" />
                )}
              </span>
            </span>
            <span
              className={cn(
                "text-[11px] leading-tight sm:text-[12px]",
                done || active ? "font-semibold text-foreground" : "text-muted-foreground",
              )}
            >
              {step.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
