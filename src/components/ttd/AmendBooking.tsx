import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PrimaryActionButton } from "@/components/ttd/PrimaryActionButton";
import { updateBookingDetails, type Booking } from "@/lib/bookings";
import { ukTimeToIso } from "@/lib/slots";
import {
  DETAIL_ADDONS,
  DETAIL_PACKAGES,
  VEHICLE_SIZE_LABELS,
  type VehicleSize,
} from "@/lib/constants";

const field =
  "mt-1.5 min-h-11 w-full rounded-xl border border-input bg-surface px-3.5 text-base outline-none focus:border-signal sm:text-sm";

/** The booking's date and time as a UK wall clock, for the date and time inputs. */
function ukDateTime(iso: string): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((x) => x.type === t)?.value ?? "00";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    time: `${get("hour")}:${get("minute")}`,
  };
}

/**
 * Staff change a booking after speaking to the customer. Saving changes the
 * booking only: the customer's page and tracking link update by themselves, and
 * no email goes out, because the change has already been agreed with them.
 */
export function AmendBooking({ booking, onClose }: { booking: Booking; onClose: () => void }) {
  const queryClient = useQueryClient();
  const initial = ukDateTime(booking.scheduled_start);
  const [date, setDate] = useState(initial.date);
  const [time, setTime] = useState(initial.time);
  const [packageId, setPackageId] = useState(booking.package_id);
  const [size, setSize] = useState<VehicleSize>(booking.vehicle_size);
  const [addonIds, setAddonIds] = useState<string[]>(booking.addon_ids);
  const [registration, setRegistration] = useState(booking.vehicle_registration);
  const [description, setDescription] = useState(booking.vehicle_description ?? "");
  const [priceText, setPriceText] = useState<string | null>(null);

  const pkg = DETAIL_PACKAGES.find((p) => p.id === packageId);
  const addons = DETAIL_ADDONS.filter((a) => addonIds.includes(a.id));
  const listPrice = pkg ? pkg.priceBySize[size] + addons.reduce((s, a) => s + a.price, 0) : null;
  const price = priceText !== null ? Number(priceText) : (listPrice ?? booking.price);
  const priceOk = Number.isFinite(price) && price >= 0;

  const save = useMutation({
    mutationFn: async () => {
      await updateBookingDetails(booking.id, {
        ...(pkg
          ? {
              package_id: pkg.id,
              package_name: pkg.name,
              estimated_duration_minutes: pkg.durationMinutes,
            }
          : {}),
        vehicle_size: size,
        addon_ids: addons.map((a) => a.id),
        addon_labels: addons.map((a) => a.label),
        price,
        scheduled_start: ukTimeToIso(date, time),
        vehicle_registration: registration.trim().toUpperCase(),
        vehicle_description: description.trim() || null,
      });
    },
    onSuccess: () => {
      toast.success("Booking updated. No email was sent.");
      void queryClient.invalidateQueries({ queryKey: ["admin-booking", booking.id] });
      void queryClient.invalidateQueries({ queryKey: ["admin-bookings"] });
      onClose();
    },
  });

  return (
    <section
      aria-label="Amend booking"
      className="mb-4 break-inside-avoid rounded-2xl border border-signal/30 bg-signal/8 p-5"
    >
      <p className="font-display text-[26px] leading-none">AMEND BOOKING</p>
      <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
        Agree any change with the customer by phone or text first. Saving updates their booking page
        straight away and does not email them.
      </p>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="amend-date" className="eyebrow block text-muted-foreground">
            Date
          </label>
          <input
            id="amend-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={field}
          />
        </div>
        <div>
          <label htmlFor="amend-time" className="eyebrow block text-muted-foreground">
            Time
          </label>
          <input
            id="amend-time"
            type="time"
            step={900}
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className={field}
          />
        </div>
        <div>
          <label htmlFor="amend-package" className="eyebrow block text-muted-foreground">
            Package
          </label>
          <select
            id="amend-package"
            value={packageId}
            onChange={(e) => setPackageId(e.target.value)}
            className={`select-field ${field}`}
          >
            {!pkg ? <option value={packageId}>{booking.package_name}</option> : null}
            {DETAIL_PACKAGES.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="amend-size" className="eyebrow block text-muted-foreground">
            Car size
          </label>
          <select
            id="amend-size"
            value={size}
            onChange={(e) => setSize(e.target.value as VehicleSize)}
            className={`select-field ${field}`}
          >
            {(Object.keys(VEHICLE_SIZE_LABELS) as VehicleSize[]).map((k) => (
              <option key={k} value={k}>
                {VEHICLE_SIZE_LABELS[k]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="amend-reg" className="eyebrow block text-muted-foreground">
            Registration
          </label>
          <input
            id="amend-reg"
            value={registration}
            onChange={(e) => setRegistration(e.target.value)}
            autoCapitalize="characters"
            className={`${field} uppercase`}
          />
        </div>
        <div>
          <label htmlFor="amend-desc" className="eyebrow block text-muted-foreground">
            Car make and model
          </label>
          <input
            id="amend-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={field}
          />
        </div>
      </div>

      <fieldset className="mt-4">
        <legend className="eyebrow text-muted-foreground">Add-ons</legend>
        <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
          {DETAIL_ADDONS.map((a) => (
            <label
              key={a.id}
              className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-xl border border-hairline bg-surface px-3 text-[13px] font-medium"
            >
              <input
                type="checkbox"
                checked={addonIds.includes(a.id)}
                onChange={(e) =>
                  setAddonIds((prev) =>
                    e.target.checked ? [...prev, a.id] : prev.filter((id) => id !== a.id),
                  )
                }
                className="h-4 w-4 accent-[var(--color-signal)]"
              />
              <span className="min-w-0 flex-1">{a.label}</span>
              <span className="text-muted-foreground">+£{a.price}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="mt-4">
        <label htmlFor="amend-price" className="eyebrow block text-muted-foreground">
          Price (£){listPrice !== null ? `, list price £${listPrice}` : ""}
        </label>
        <input
          id="amend-price"
          inputMode="decimal"
          value={priceText ?? String(price)}
          onChange={(e) => setPriceText(e.target.value)}
          className={field}
        />
      </div>

      {save.isError ? (
        <p role="alert" className="mt-3 text-[13px] text-destructive">
          {save.error instanceof Error ? save.error.message : "Couldn't update this booking."}
        </p>
      ) : null}
      <div className="mt-4 grid grid-cols-2 gap-2">
        <PrimaryActionButton variant="outline" size="md" onClick={onClose}>
          Cancel
        </PrimaryActionButton>
        <PrimaryActionButton
          size="md"
          loading={save.isPending}
          disabled={!date || !time || !priceOk || !registration.trim()}
          onClick={() => save.mutate()}
        >
          Save changes
        </PrimaryActionButton>
      </div>
    </section>
  );
}
