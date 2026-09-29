import { cn } from "@/lib/utils";
import type { BookingStatus } from "@/lib/bookings";

const MAP: Record<
  BookingStatus,
  { label: string; className: string; dot: string; pulse?: boolean; glow?: boolean }
> = {
  requested: {
    label: "Request received",
    className: "bg-warning/15 text-warning-text border-warning/30",
    dot: "bg-warning",
  },
  confirmed: {
    label: "Confirmed",
    className: "bg-surface-2 text-foreground border-hairline",
    dot: "bg-success",
    glow: true,
  },
  assigned: {
    label: "Detailer set",
    className: "bg-surface-2 text-foreground border-hairline",
    dot: "bg-success",
    glow: true,
  },
  en_route: {
    label: "En route",
    className: "bg-signal text-signal-foreground border-signal-deep/30",
    dot: "bg-signal-foreground",
    pulse: true,
  },
  arrived: {
    label: "Arrived",
    className: "bg-success/12 text-success border-success/30",
    dot: "bg-success",
  },
  check_in: {
    label: "Detailing",
    className: "bg-signal text-signal-foreground border-signal-deep/30",
    dot: "bg-signal-foreground",
    pulse: true,
  },
  in_progress: {
    label: "Detailing",
    className: "bg-signal text-signal-foreground border-signal-deep/30",
    dot: "bg-signal-foreground",
    pulse: true,
  },
  qc: {
    label: "Detailing",
    className: "bg-signal/15 text-signal-deep border-signal/30",
    dot: "bg-signal-deep",
  },
  handover: {
    label: "Detailing",
    className: "bg-success/12 text-success border-success/30",
    dot: "bg-success",
  },
  completed: {
    label: "Completed",
    className: "bg-surface-2 text-muted-foreground border-hairline",
    dot: "bg-muted-foreground/60",
  },
  cancelled: {
    label: "Cancelled",
    className: "bg-destructive/10 text-destructive border-destructive/25",
    dot: "bg-destructive",
  },
};

export function StatusBadge({
  status,
  size = "md",
  className,
}: {
  status: BookingStatus;
  size?: "sm" | "md";
  className?: string;
}) {
  const s = MAP[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border font-semibold uppercase",
        size === "sm"
          ? "px-2.5 py-1 text-[10px] tracking-[0.14em]"
          : "px-3 py-1.5 text-[11px] tracking-[0.16em]",
        s.className,
        className,
      )}
    >
      <span className="relative grid h-2 w-2 place-items-center">
        {s.pulse ? (
          <span className={cn("absolute h-2 w-2 rounded-full pulse-ring", s.dot)} />
        ) : null}
        <span
          className={cn(
            "h-2 w-2 rounded-full",
            s.dot,
            s.glow && "shadow-[0_0_8px_2px_rgba(31,138,76,0.5)]",
          )}
        />
      </span>
      {s.label}
    </span>
  );
}
