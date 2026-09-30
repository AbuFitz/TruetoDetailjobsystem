import { cn } from "@/lib/utils";

/**
 * A finished-action mark: a ring that pops in and a tick that draws itself.
 * Used where something real just completed (a booking made, a request sent),
 * never as decoration. Static under reduced motion.
 */
export function SuccessMark({
  tone = "signal",
  className,
}: {
  tone?: "signal" | "success";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "pop-in relative grid h-[72px] w-[72px] place-items-center rounded-full",
        tone === "signal"
          ? "bg-signal text-signal-foreground"
          : "bg-success text-success-foreground",
        className,
      )}
      aria-hidden
    >
      <svg
        viewBox="0 0 24 24"
        className="h-8 w-8"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.6"
      >
        <path
          d="M5 12.5l4.5 4.5L19 7.5"
          pathLength={1}
          className="draw-in"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
