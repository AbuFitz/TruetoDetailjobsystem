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
        className="press block min-h-[72px] py-3 pl-5 pr-3 md:grid md:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)_minmax(0,1fr)_auto] md:items-center md:gap-x-5"
      >
        <div className="min-w-0">
          <div className="flex items-center justify-between gap-2 md:justify-start">
            <p className="mono-ref truncate text-muted-foreground">{booking.booking_reference}</p>
            <span className="md:hidden">
              <StatusBadge status={booking.status} size="sm" />
            </span>
          </div>
          <p className="mt-0.5 break-words font-display text-[22px] leading-[1.05] md:truncate">
            {booking.package_name}
          </p>
        </div>

        <div className="mt-2 flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1.5 md:mt-0">
          <PlateTag registration={booking.vehicle_registration} />
          {booking.vehicle_description ? (
            <span className="truncate text-[13px] font-medium">{booking.vehicle_description}</span>
          ) : null}
        </div>

        <div className="mt-2 min-w-0 text-[13px] text-muted-foreground md:mt-0">
          <p className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 shrink-0" strokeWidth={2.2} />
            <span className="truncate">
              {dayLabel}, {timeLabel} · {booking.service_postcode}
            </span>
          </p>
          <p className="mt-1 flex items-center gap-2">
            {booking.detailer ? (
              <>
                <Avatar
                  name={booking.detailer.name}
                  photoUrl={booking.detailer.photo_url}
                  size="sm"
                />
                <span className="truncate font-medium">{booking.detailer.name}</span>
              </>
            ) : (
              <span className="font-medium text-warning-text">Unassigned</span>
            )}
            {live && booking.location_updated_at ? (
              <span className="inline-flex shrink-0 items-center gap-1 text-signal-deep">
                <Radio className="h-3.5 w-3.5" strokeWidth={2.4} />
                {formatRelativeUpdate(booking.location_updated_at)}
              </span>
            ) : null}
          </p>
        </div>

        <div className="hidden items-center gap-2 md:flex">
          <StatusBadge status={booking.status} size="sm" />
          <ChevronRight className="h-4 w-4 text-muted-foreground" strokeWidth={2.4} />
        </div>
      </Link>
    </article>
  );
}
