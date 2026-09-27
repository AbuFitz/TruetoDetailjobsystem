import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BookingStatus } from "@/lib/bookings";

export type TimelineStepState = "done" | "active" | "todo";

export interface TimelineStep {
  label: string;
  state: TimelineStepState;
  hint?: string;
}

export function BookingTimeline({
  steps,
  className,
}: {
  steps: TimelineStep[];
  className?: string;
}) {
  return (
    <ol className={cn("relative flex flex-col", className)}>
      {steps.map((step, i) => {
        const last = i === steps.length - 1;
        const connectorDone = step.state === "done";
        return (
          <li key={step.label} className="relative grid grid-cols-[24px_minmax(0,1fr)] gap-3">
            <div className="flex flex-col items-center">
              <span
                className={cn(
                  "relative grid h-6 w-6 shrink-0 place-items-center rounded-full border transition-colors duration-300",
                  step.state === "done" && "border-foreground bg-foreground text-ink",
                  step.state === "active" &&
                    "border-signal-deep/40 bg-signal text-signal-foreground",
                  step.state === "todo" && "border-hairline bg-surface-2 text-transparent",
                )}
                aria-hidden
              >
                {step.state === "active" ? (
                  <span className="absolute h-6 w-6 rounded-full bg-signal pulse-ring" />
                ) : null}
                {step.state === "done" ? (
                  <Check className="relative h-3.5 w-3.5" strokeWidth={3} />
                ) : (
                  <span
                    className={cn(
                      "relative h-2 w-2 rounded-full",
                      step.state === "active" ? "bg-signal-foreground" : "bg-border",
                    )}
                  />
                )}
              </span>
              {!last ? (
                <span
                  className={cn(
                    "w-px flex-1 transition-colors duration-300",
                    connectorDone ? "bg-foreground/30" : "bg-hairline",
                  )}
                />
              ) : null}
            </div>
            <div className={cn("min-w-0", last ? "pb-0" : "pb-5")}>
              <p
                className={cn(
                  "text-[15px] leading-6",
                  step.state === "todo" ? "text-muted-foreground" : "font-semibold text-foreground",
                )}
              >
                {step.label}
              </p>
              {step.hint ? (
                <p className="mt-0.5 text-[13px] text-muted-foreground">{step.hint}</p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

const STEP_ORDER: BookingStatus[] = [
  "confirmed",
  "assigned",
  "en_route",
  "arrived",
  "check_in",
  "in_progress",
  "qc",
  "handover",
  "completed",
];

const STEP_LABELS: Record<BookingStatus, string> = {
  confirmed: "Booking confirmed",
  assigned: "Detailer assigned",
  en_route: "Detailer on the way",
  arrived: "Detailer arrived",
  check_in: "Vehicle check-in",
  in_progress: "Detailing in progress",
  qc: "Final quality check",
  handover: "Handover",
  completed: "Completed",
  cancelled: "Cancelled",
};

/** Builds the customer-facing progress steps from a booking's current status. */
export function timelineForStatus(status: BookingStatus): TimelineStep[] {
  if (status === "cancelled") {
    return [{ label: "Booking cancelled", state: "done" }];
  }
  const idx = STEP_ORDER.indexOf(status);
  return STEP_ORDER.map((s, i) => ({
    label: STEP_LABELS[s],
    state: i < idx ? "done" : i === idx ? (status === "completed" ? "done" : "active") : "todo",
  }));
}
