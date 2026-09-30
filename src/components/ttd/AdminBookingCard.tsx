import { Link } from "@tanstack/react-router";
import { ChevronRight, Clock, Radio } from "lucide-react";
import { cn } from "@/lib/utils";
import { StatusBadge } from "./StatusBadge";
import { PlateTag } from "./VehicleTag";
import { Avatar } from "./Avatar";
import { formatAppointment, formatRelativeUpdate } from "@/lib/format";
import type { BookingWithDetailer } from "@/lib/bookings";

/**
 * One booking as a single dense row: reference and package, the car, when and
 * where, who has it, and its status, all in one glance. The whole row is the
 * link, so opening a job is one tap anywhere on it. The bar on the left says
 * at a distance whether it is live, waiting or done.
 */
export function AdminBookingCard({
  booking,
  className,
}: {
  booking: BookingWithDetailer;
  className?: string;
}) {
  const live = booking.status === "en_route" && booking.tracking_active;
  const working =
    live || ["arrived", "check_in", "in_progress", "qc", "handover"].includes(booking.status);
  const { dayLabel, timeLabel } = formatAppointment(booking.scheduled_start);

  return (
    <article
      className={cn(
        "relative overflow-hidden border border-hairline bg-surface transition-colors hover:bg-surface-2",
        className,
      )}
    >
      <span
        className={cn("absolute inset-y-0 left-0 w-1", working ? "bg-signal" : "bg-border")}
        aria-hidden
      />
      <Link
        to="/admin/bookings/$id"
        params={{ id: booking.id }}
        aria-label={`Open ${booking.booking_reference}, ${booking.package_name}`}
        className="press block min-h-[72px] py-3 pl-5 pr-3"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="mono-ref truncate text-muted-foreground">{booking.booking_reference}</p>
            <p className="mt-0.5 break-words font-display text-[22px] leading-[1.05]">
              {booking.package_name}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <StatusBadge status={booking.status} size="sm" />
            <ChevronRight
              className="hidden h-4 w-4 text-muted-foreground sm:block"
              strokeWidth={2.4}
            />
          </div>
        </div>

        {/* Wraps by itself, so the row reads well in a narrow column as much as a wide one. */}
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px] text-muted-foreground">
          <PlateTag registration={booking.vehicle_registration} />
          {booking.vehicle_description ? (
            <span className="font-medium text-foreground">{booking.vehicle_description}</span>
          ) : null}
          <span className="inline-flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 shrink-0" strokeWidth={2.2} />
            {dayLabel}, {timeLabel} · {booking.service_postcode}
          </span>
          {booking.detailer ? (
            <span className="inline-flex items-center gap-1.5 font-medium">
              <Avatar
                name={booking.detailer.name}
                photoUrl={booking.detailer.photo_url}
                size="sm"
              />
              {booking.detailer.name}
            </span>
          ) : (
            <span className="font-medium text-warning-text">Unassigned</span>
          )}
          {live && booking.location_updated_at ? (
            <span className="inline-flex items-center gap-1 text-signal-deep">
              <Radio className="h-3.5 w-3.5" strokeWidth={2.4} />
              {formatRelativeUpdate(booking.location_updated_at)}
            </span>
          ) : null}
        </div>
      </Link>
    </article>
  );
}
