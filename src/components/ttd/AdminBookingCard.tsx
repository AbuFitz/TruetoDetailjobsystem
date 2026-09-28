import { Link } from "@tanstack/react-router";
import { ChevronRight, Clock, Radio } from "lucide-react";
import { cn } from "@/lib/utils";
import { StatusBadge } from "./StatusBadge";
import { PlateTag } from "./VehicleTag";
import { Avatar } from "./Avatar";
import { formatAppointment, formatRelativeUpdate } from "@/lib/format";
import type { BookingWithDetailer } from "@/lib/bookings";

export function AdminBookingCard({
  booking,
  className,
}: {
  booking: BookingWithDetailer;
  className?: string;
}) {
  const live = booking.status === "en_route" && booking.tracking_active;
  const { dayLabel, timeLabel } = formatAppointment(booking.scheduled_start);

  return (
    <article
      className={cn("relative overflow-hidden border border-hairline bg-surface ", className)}
    >
      {live || booking.status === "arrived" || booking.status === "in_progress" ? (
        <span className="absolute inset-y-0 left-0 w-1 bg-signal" aria-hidden />
      ) : (
        <span className="absolute inset-y-0 left-0 w-1 bg-border" aria-hidden />
      )}

      <div className="p-4 pl-5">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
          <div className="min-w-0">
            <p className="mono-ref text-muted-foreground">{booking.booking_reference}</p>
            <p className="mt-1 truncate font-display text-xl font-bold leading-tight">
              {booking.package_name}
            </p>
          </div>
          <StatusBadge status={booking.status} size="sm" />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          {booking.vehicle_description ? (
            <span className="text-sm font-medium">{booking.vehicle_description}</span>
          ) : null}
          <PlateTag registration={booking.vehicle_registration} />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" strokeWidth={2.2} />
            {dayLabel}, {timeLabel} · {booking.service_postcode}
          </span>
          {live && booking.location_updated_at ? (
            <span className="inline-flex items-center gap-1.5 text-signal-deep">
              <Radio className="h-3.5 w-3.5" strokeWidth={2.4} />
              Updated {formatRelativeUpdate(booking.location_updated_at)}
            </span>
          ) : null}
        </div>

        {booking.detailer ? (
          <div className="mt-3 flex items-center gap-2">
            <Avatar name={booking.detailer.name} photoUrl={booking.detailer.photo_url} size="sm" />
            <span className="truncate text-[13px] font-medium text-muted-foreground">
              {booking.detailer.name}
            </span>
          </div>
        ) : (
          <p className="mt-3 text-[13px] font-medium text-warning-foreground">Unassigned</p>
        )}

        <div className="mt-4 flex gap-2">
          <Link
            to="/admin/bookings/$id"
            params={{ id: booking.id }}
            className="press inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 bg-ink px-4 font-sans text-[12px] font-bold uppercase tracking-[0.1em] text-ink-foreground hover:bg-ink-soft"
          >
            Open
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </article>
  );
}
