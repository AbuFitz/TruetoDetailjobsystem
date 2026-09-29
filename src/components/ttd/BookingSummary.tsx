import { CalendarClock, MapPin } from "lucide-react";
import { PlateTag } from "@/components/ttd/VehicleTag";
import { CalendarButtons } from "@/components/ttd/TrackingExtras";
import type { CalendarEvent } from "@/lib/calendar";

/**
 * The booking at a glance, shared by the signed-in booking page and the
 * private tracking link so they read the same. One card with plain rows, no
 * boxes inside boxes.
 */
export function BookingSummary({
  packageName,
  addons,
  dayLabel,
  timeLabel,
  vehicleDescription,
  registration,
  where,
  price,
  notes,
  calendar,
}: {
  packageName: string;
  addons?: string[] | null;
  dayLabel: string;
  timeLabel: string;
  vehicleDescription?: string | null;
  registration: string;
  where: string;
  price: number | null;
  notes?: string | null;
  /** Shows "add to calendar" while the visit is still ahead. */
  calendar?: CalendarEvent | null;
}) {
  return (
    <section className="rounded-2xl border border-hairline bg-surface p-5">
      <p className="eyebrow text-muted-foreground">Your booking</p>
      <h2 className="mt-2 font-display text-[32px] leading-[0.95]">{packageName}</h2>
      {addons && addons.length > 0 ? (
        <p className="mt-1.5 text-[13px] text-muted-foreground">+ {addons.join(", ")}</p>
      ) : null}

      <dl className="mt-5 divide-y divide-hairline border-y border-hairline text-[14px]">
        <div className="flex items-start gap-3 py-3">
          <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-signal-deep" strokeWidth={2.2} />
          <div className="min-w-0">
            <dt className="eyebrow text-muted-foreground">When</dt>
            <dd className="mt-0.5 font-semibold">
              {dayLabel}, {timeLabel}
            </dd>
          </div>
        </div>
        <div className="flex items-start gap-3 py-3">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-signal-deep" strokeWidth={2.2} />
          <div className="min-w-0">
            <dt className="eyebrow text-muted-foreground">Where</dt>
            <dd className="mt-0.5 font-semibold">{where}</dd>
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 py-3">
          <div className="min-w-0">
            <dt className="eyebrow text-muted-foreground">Vehicle</dt>
            {vehicleDescription ? (
              <dd className="mt-0.5 truncate font-semibold">{vehicleDescription}</dd>
            ) : null}
          </div>
          <PlateTag registration={registration} />
        </div>
      </dl>

      {notes ? (
        <p className="mt-4 text-[13px] leading-relaxed text-muted-foreground">
          <span className="font-semibold text-foreground">Your notes: </span>
          {notes}
        </p>
      ) : null}

      {price != null ? (
        <p className="mt-4 flex items-baseline justify-between">
          <span className="eyebrow">Total</span>
          <span className="font-display text-[32px] leading-none">£{price}</span>
        </p>
      ) : null}
      <p className="mt-1.5 text-[12px] text-muted-foreground">
        Paid on the day by card, bank transfer or cash. The price is fixed.
      </p>

      {calendar ? (
        <div className="mt-4 border-t border-hairline pt-4">
          <p className="eyebrow mb-2 text-muted-foreground">Add to your calendar</p>
          <CalendarButtons event={calendar} />
        </div>
      ) : null}
    </section>
  );
}
