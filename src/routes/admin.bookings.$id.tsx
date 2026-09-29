import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, CalendarClock, Mail, MapPin, Phone, TriangleAlert } from "lucide-react";
import { TtdHeader } from "@/components/ttd/Header";
import { StatusBadge } from "@/components/ttd/StatusBadge";
import { VehicleCard } from "@/components/ttd/VehicleTag";
import { BookingTimeline, timelineForStatus } from "@/components/ttd/BookingTimeline";
import { StageChecklist } from "@/components/ttd/StageChecklist";
import { BrandedLoading } from "@/components/ttd/BrandedLoading";
import { PrimaryActionButton } from "@/components/ttd/PrimaryActionButton";
import { useRequireStaffSession } from "@/hooks/use-session";
import {
  assignDetailer,
  cancelBooking,
  getBookingById,
  setTravelTimeMinutes,
  CANCELLATION_REASONS,
  type CancellationReason,
} from "@/lib/bookings";
import { listDetailers } from "@/lib/detailers";
import { getCustomerById } from "@/lib/customers";
import { getCheckInForBooking, listCheckInPhotos } from "@/lib/checkin";
import { formatAppointment } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import type { StageProgress } from "@/lib/detailers";

export const Route = createFileRoute("/admin/bookings/$id")({
  head: () => ({
    meta: [{ title: "Booking | True To Detail" }, { name: "robots", content: "noindex" }],
  }),
  component: AdminBookingDetail,
});

function AdminBookingDetail() {
  useRequireStaffSession();
  const { id } = Route.useParams();
  const queryClient = useQueryClient();
  const [cancelReason, setCancelReason] = useState<CancellationReason>("Customer cancelled");
  const [travelInput, setTravelInput] = useState("");

  const { data: booking, isLoading } = useQuery({
    queryKey: ["admin-booking", id],
    queryFn: () => getBookingById(id),
    refetchInterval: 8_000,
  });
  const { data: detailers } = useQuery({ queryKey: ["admin-detailers"], queryFn: listDetailers });
  const { data: customer } = useQuery({
    queryKey: ["admin-customer", booking?.customer_id],
    queryFn: () => getCustomerById(booking!.customer_id),
    enabled: Boolean(booking),
  });
  const { data: checkIn } = useQuery({
    queryKey: ["check-in", id],
    queryFn: () => getCheckInForBooking(id),
    enabled: Boolean(booking),
  });
  const { data: photos } = useQuery({
    queryKey: ["check-in-photos", checkIn?.id],
    queryFn: () => listCheckInPhotos(checkIn!.id),
    enabled: Boolean(checkIn),
  });
  const { data: stages } = useQuery({
    queryKey: ["admin-booking-stages", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("booking_stage_progress")
        .select("stage_key, completed_at")
        .eq("booking_id", id);
      if (error) throw error;
      return data as unknown as StageProgress[];
    },
    enabled:
      booking?.status === "in_progress" ||
      booking?.status === "qc" ||
      booking?.status === "handover" ||
      booking?.status === "completed",
  });

  const assignMutation = useMutation({
    mutationFn: (detailerId: string) => assignDetailer(id, detailerId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-booking", id] }),
  });

  const travelMutation = useMutation({
    mutationFn: (minutes: number | null) => setTravelTimeMinutes(id, minutes),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-booking", id] }),
  });

  const cancelMutation = useMutation({
    mutationFn: () => cancelBooking(id, cancelReason),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-booking", id] }),
  });

  if (isLoading || !booking) {
    return (
      <main className="min-h-screen bg-background">
        <BrandedLoading label="Loading booking" />
      </main>
    );
  }

  const { dayLabel, timeLabel } = formatAppointment(booking.scheduled_start);
  const detailerLink = booking.detailer
    ? `${window.location.origin}/d/${booking.detailer.link_token}`
    : null;

  return (
    <main className="min-h-screen bg-background pb-16">
      <TtdHeader eyebrow="Booking" containerClassName="max-w-2xl" />

      <div className="mx-auto w-full max-w-2xl px-5 py-6 sm:px-6">
        <Link
          to="/admin"
          className="press inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Dashboard
        </Link>

        <section className="mt-5 rounded-2xl border border-hairline bg-surface p-5">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
            <div className="min-w-0">
              <p className="mono-ref text-muted-foreground">{booking.booking_reference}</p>
              <h1 className="mt-1 font-display text-[28px] leading-none">{booking.package_name}</h1>
            </div>
            <StatusBadge status={booking.status} size="sm" />
          </div>

          <VehicleCard
            className="mt-4 rounded-xl border-0 bg-surface-2 p-3"
            vehicle={{
              description: booking.vehicle_description,
              registration: booking.vehicle_registration,
            }}
          />

          <div className="mt-3 grid grid-cols-2 gap-2.5">
            <Tile icon={CalendarClock} label="Scheduled">
              {dayLabel}, {timeLabel}
            </Tile>
            <Tile icon={MapPin} label="Address">
              {booking.service_address_line1}, {booking.service_postcode}
            </Tile>
          </div>

          <dl className="mt-4 flex flex-col gap-2 text-[14px]">
            {booking.addon_labels.length > 0 ? (
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Add-ons</dt>
                <dd className="text-right font-medium">{booking.addon_labels.join(", ")}</dd>
              </div>
            ) : null}
            <div className="flex items-baseline justify-between gap-4 border-t border-hairline pt-3">
              <dt className="eyebrow text-foreground">Total</dt>
              <dd className="font-display text-[28px] leading-none">£{booking.price.toFixed(2)}</dd>
            </div>
          </dl>
          {booking.customer_notes ? (
            <p className="mt-3 rounded-xl bg-surface-2 px-3.5 py-3 text-[13px] leading-relaxed text-muted-foreground">
              <span className="font-semibold text-foreground">Customer notes: </span>
              {booking.customer_notes}
            </p>
          ) : null}
          {booking.internal_notes ? (
            <p className="mt-2 rounded-xl border border-signal/25 bg-signal/8 px-3.5 py-3 text-[13px] leading-relaxed text-foreground">
              <span className="font-semibold">Job notes for the detailer: </span>
              {booking.internal_notes}
            </p>
          ) : null}
        </section>

        {customer ? (
          <section className="mt-4 rounded-2xl border border-hairline bg-surface p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="eyebrow text-muted-foreground">Customer</p>
                <Link
                  to="/admin/customers/$id"
                  params={{ id: customer.id }}
                  className="mt-1 block truncate text-[16px] font-semibold underline-offset-2 hover:underline"
                >
                  {customer.first_name} {customer.last_name}
                </Link>
              </div>
              <span
                className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${
                  customer.auth_user_id
                    ? "border-success/30 bg-success/10 text-success"
                    : "border-hairline bg-surface-2 text-muted-foreground"
                }`}
              >
                {customer.auth_user_id ? "Signed up" : "Walk-in"}
              </span>
            </div>
            {customer.phone || customer.email ? (
              <div className="mt-3 grid grid-cols-2 gap-2">
                {customer.phone ? (
                  <a
                    href={`tel:${customer.phone.replace(/\s+/g, "")}`}
                    className="press inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-hairline bg-surface-2 text-[13px] font-semibold"
                  >
                    <Phone className="h-4 w-4" strokeWidth={2.2} />
                    {customer.phone}
                  </a>
                ) : null}
                {customer.email ? (
                  <a
                    href={`mailto:${customer.email}`}
                    className="press inline-flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-xl border border-hairline bg-surface-2 px-2 text-[13px] font-semibold"
                  >
                    <Mail className="h-4 w-4 shrink-0" strokeWidth={2.2} />
                    <span className="truncate">Email</span>
                  </a>
                ) : null}
              </div>
            ) : (
              <p className="mt-2 text-[13px] text-muted-foreground">No contact details saved.</p>
            )}
          </section>
        ) : null}

        <section className="mt-4 rounded-2xl border border-hairline bg-surface p-5">
          <p className="eyebrow text-muted-foreground">Detailer</p>
          <select
            value={booking.assigned_detailer_id ?? ""}
            onChange={(e) => e.target.value && assignMutation.mutate(e.target.value)}
            className="mt-2 min-h-11 w-full rounded-xl border border-input bg-surface-2 px-3.5 text-sm outline-none focus:border-signal"
          >
            <option value="">Unassigned</option>
            {(detailers ?? [])
              .filter((d) => d.active)
              .map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
          </select>
          {detailerLink ? (
            <p className="mt-2 truncate text-[12px] text-muted-foreground">
              Detailer link:{" "}
              <a href={detailerLink} className="underline">
                {detailerLink}
              </a>
            </p>
          ) : null}

          <label htmlFor="travel-time" className="eyebrow mt-4 block text-muted-foreground">
            Travel time before this job (minutes)
          </label>
          <div className="mt-2 flex items-center gap-2">
            <input
              id="travel-time"
              type="number"
              placeholder="e.g. 20"
              defaultValue={booking.travel_time_minutes ?? ""}
              onChange={(e) => setTravelInput(e.target.value)}
              className="min-h-10 flex-1 rounded-xl border border-input bg-surface-2 px-3 text-sm outline-none focus:border-signal"
            />
            <PrimaryActionButton
              size="sm"
              className="w-auto px-4"
              loading={travelMutation.isPending}
              onClick={() => travelMutation.mutate(travelInput.trim() ? Number(travelInput) : null)}
            >
              Save
            </PrimaryActionButton>
          </div>
        </section>

        {stages && stages.length > 0 ? (
          <section className="mt-4 rounded-2xl border border-hairline bg-surface p-5">
            <p className="eyebrow mb-3 text-muted-foreground">Detail checklist</p>
            <StageChecklist stages={stages} />
          </section>
        ) : null}

        {checkIn ? (
          <section className="mt-4 rounded-2xl border border-hairline bg-surface p-5">
            <p className="eyebrow mb-3 text-muted-foreground">Check-in record</p>
            <dl className="flex flex-col gap-2 text-[13px]">
              {checkIn.mileage != null ? (
                <Row label="Mileage">{checkIn.mileage.toLocaleString()} mi</Row>
              ) : null}
              {checkIn.exterior_damage_notes ? (
                <Row label="Exterior damage">{checkIn.exterior_damage_notes}</Row>
              ) : null}
              {checkIn.wheel_damage_notes ? (
                <Row label="Wheel damage">{checkIn.wheel_damage_notes}</Row>
              ) : null}
              {checkIn.interior_condition_notes ? (
                <Row label="Interior">{checkIn.interior_condition_notes}</Row>
              ) : null}
              {checkIn.valuables_notes ? (
                <Row label="Valuables">{checkIn.valuables_notes}</Row>
              ) : null}
              {checkIn.customer_requests ? (
                <Row label="Customer requests">{checkIn.customer_requests}</Row>
              ) : null}
              {checkIn.access_notes ? <Row label="Access">{checkIn.access_notes}</Row> : null}
              <Row label="Water / electric">
                {checkIn.water_available == null
                  ? "—"
                  : checkIn.water_available
                    ? "Water: yes"
                    : "Water: no"}{" "}
                ·{" "}
                {checkIn.electric_available == null
                  ? "—"
                  : checkIn.electric_available
                    ? "Electric: yes"
                    : "Electric: no"}
              </Row>
              {checkIn.vehicle_position_notes ? (
                <Row label="Vehicle position">{checkIn.vehicle_position_notes}</Row>
              ) : null}
              {checkIn.blocking_issue ? (
                <Row label="Blocking issue">
                  <span className="flex items-center gap-1.5 text-destructive">
                    <TriangleAlert className="h-3.5 w-3.5" strokeWidth={2.2} />
                    {checkIn.blocking_issue}
                  </span>
                </Row>
              ) : null}
              <Row label="Customer ack">
                {checkIn.customer_ack_at
                  ? `Confirmed by ${checkIn.customer_ack_name}`
                  : "Not yet confirmed"}
              </Row>
            </dl>
            {photos && photos.length > 0 ? (
              <div className="mt-3 grid grid-cols-4 gap-2">
                {photos.map((p) => (
                  <a
                    key={p.id}
                    href={p.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="aspect-square overflow-hidden border border-hairline"
                  >
                    <img src={p.url} alt="" className="h-full w-full object-cover" />
                  </a>
                ))}
              </div>
            ) : null}
          </section>
        ) : null}

        <section className="mt-4 rounded-2xl border border-hairline bg-surface p-5">
          <p className="eyebrow text-muted-foreground">Progress</p>
          <BookingTimeline className="mt-4" steps={timelineForStatus(booking.status)} />
        </section>

        {booking.status !== "completed" && booking.status !== "cancelled" ? (
          <section className="mt-4 rounded-2xl border border-destructive/25 bg-destructive/5 p-5">
            <p className="eyebrow text-destructive">Cancel booking</p>
            <select
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value as CancellationReason)}
              className="mt-2 min-h-10 w-full rounded-xl border border-destructive/25 bg-surface px-3 text-sm outline-none"
            >
              {CANCELLATION_REASONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <PrimaryActionButton
              variant="ghostDestructive"
              className="mt-2"
              loading={cancelMutation.isPending}
              onClick={() => cancelMutation.mutate()}
            >
              Cancel this booking
            </PrimaryActionButton>
          </section>
        ) : null}
      </div>
    </main>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{children}</dd>
    </div>
  );
}

function Tile({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-hairline bg-surface-2 p-3.5">
      <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
        <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={2.2} />
        <span className="min-w-0 text-[10px] font-semibold uppercase leading-tight tracking-[0.04em]">
          {label}
        </span>
      </span>
      <p className="mt-1.5 text-[15px] font-semibold leading-tight">{children}</p>
    </div>
  );
}
