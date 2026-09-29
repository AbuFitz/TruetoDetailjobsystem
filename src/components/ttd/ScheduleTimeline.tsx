import { ArrowDown, TriangleAlert } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { format } from "date-fns";
import { UK_TIME } from "@/lib/uk-time";
import { cn } from "@/lib/utils";
import { StatusBadge } from "./StatusBadge";
import { PlateTag } from "./VehicleTag";
import type { BookingWithDetailer } from "@/lib/bookings";

/**
 * The mobile-oriented admin schedule block: not just "10:00 — BMW", but
 * start–end times plus the travel gap to the *next* job — exactly the
 * "↓ 18 min travel" layout from the product brief, so bookings never get
 * stacked unrealistically tight for a mobile detailer's actual day.
 */
export function ScheduleTimeline({
  bookings,
  className,
}: {
  /** Must already be sorted by scheduled_start ascending, same detailer/day. */
  bookings: BookingWithDetailer[];
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col", className)}>
      {bookings.map((booking, i) => {
        const start = new Date(booking.scheduled_start);
        const end = new Date(start.getTime() + booking.estimated_duration_minutes * 60_000);
        const next = bookings[i + 1];
        const gapMinutes = next
          ? Math.round((new Date(next.scheduled_start).getTime() - end.getTime()) / 60_000)
          : null;
        const tight = gapMinutes != null && gapMinutes < 0;

        return (
          <div key={booking.id}>
            <Link
              to="/admin/bookings/$id"
              params={{ id: booking.id }}
              className="press flex items-start gap-3 rounded-xl border border-hairline bg-surface p-3.5 hover:bg-surface-2"
            >
              <div className="w-[74px] shrink-0 pt-0.5 text-right">
                <p className="font-display text-base font-bold leading-none">
                  {format(start, "HH:mm", { in: UK_TIME })}
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {format(end, "HH:mm", { in: UK_TIME })}
                </p>
              </div>
              <div className="min-w-0 flex-1 border-l border-hairline pl-3.5">
                <div className="flex items-start justify-between gap-2">
                  <p className="truncate font-display text-[15px] font-bold leading-tight">
                    {booking.package_name}
                  </p>
                  <StatusBadge status={booking.status} size="sm" />
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  {booking.vehicle_description ? (
                    <span className="text-[13px] font-medium text-muted-foreground">
                      {booking.vehicle_description}
                    </span>
                  ) : null}
                  <PlateTag registration={booking.vehicle_registration} />
                  <span className="text-[13px] text-muted-foreground">
                    {booking.service_postcode}
                  </span>
                </div>
              </div>
            </Link>

            {next ? (
              <div
                className={cn(
                  "flex items-center gap-2 py-2 pl-[86px] text-[12px] font-medium",
                  tight ? "text-destructive" : "text-muted-foreground",
                )}
              >
                {tight ? (
                  <TriangleAlert className="h-3.5 w-3.5 shrink-0" strokeWidth={2.2} />
                ) : (
                  <ArrowDown className="h-3.5 w-3.5 shrink-0" strokeWidth={2.2} />
                )}
                {gapMinutes == null
                  ? "Travel time unknown"
                  : tight
                    ? `Overlaps next job by ${Math.abs(gapMinutes)} min`
                    : `${gapMinutes} min travel`}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
