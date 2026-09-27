import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, CalendarClock, MapPin } from "lucide-react";
import { TtdHeader } from "@/components/ttd/Header";
import { StatusBadge } from "@/components/ttd/StatusBadge";
import { VehicleCard } from "@/components/ttd/VehicleTag";
import { DetailerCard } from "@/components/ttd/DetailerCard";
import { TrackingMap } from "@/components/ttd/TrackingMap";
import { BookingTimeline, timelineForStatus } from "@/components/ttd/BookingTimeline";
import { StageChecklist } from "@/components/ttd/StageChecklist";
import { BrandedLoading } from "@/components/ttd/BrandedLoading";
import { PrimaryActionButton } from "@/components/ttd/PrimaryActionButton";
import { useRequireCustomerSession } from "@/hooks/use-session";
import {
  getMyBookingById,
  getBookingEta,
  cancelOwnBooking,
  LIVE_JOB_STATUSES,
} from "@/lib/bookings";
import { formatAppointment, getScheduleStatus, getEtaStatus } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import type { StageProgress } from "@/lib/detailers";

export const Route = createFileRoute("/account/bookings/$id")({
  head: () => ({
    meta: [{ title: "Your booking | True To Detail" }, { name: "robots", content: "noindex" }],
  }),
  component: BookingDetail,
});

function BookingDetail() {
  const { session, loading: authLoading } = useRequireCustomerSession();
  const { id } = Route.useParams();
  const queryClient = useQueryClient();
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const { data: booking, isLoading } = useQuery({
    queryKey: ["my-booking", id],
    queryFn: () => getMyBookingById(id),
    enabled: Boolean(session),
    refetchInterval: 5_000,
  });

  const isLive = booking ? LIVE_JOB_STATUSES.includes(booking.status) : false;
  const detailerPosition =
    booking?.current_lat != null && booking?.current_lng != null
      ? { lat: booking.current_lat, lng: booking.current_lng }
      : null;
  const destination =
    booking?.destination_lat != null && booking?.destination_lng != null
      ? { lat: booking.destination_lat, lng: booking.destination_lng }
      : null;

  const { data: eta } = useQuery({
    queryKey: ["booking-eta", id],
    queryFn: () => getBookingEta(id),
    enabled: booking?.status === "en_route" && Boolean(detailerPosition),
    refetchInterval: 30_000,
    retry: false,
  });

  async function handleCancel() {
    setCancelError(null);
    setCancelling(true);
    try {
      await cancelOwnBooking(id);
      await queryClient.invalidateQueries({ queryKey: ["my-booking", id] });
      await queryClient.invalidateQueries({ queryKey: ["my-bookings"] });
    } catch (err) {
      setCancelError(err instanceof Error ? err.message : "Couldn't cancel this booking.");
    } finally {
      setCancelling(false);
    }
  }

  if (authLoading || isLoading || !booking) {
    return (
      <main className="min-h-screen bg-background">
        <BrandedLoading label="Loading your booking" />
      </main>
    );
  }

  const { dayLabel, timeLabel } = formatAppointment(booking.scheduled_start);
  const schedule = getScheduleStatus(booking.scheduled_start, timeLabel);
  const etaStatus = eta ? getEtaStatus(eta.durationSeconds, booking.scheduled_start) : null;

  return (
    <main className="min-h-screen bg-background pb-16">
      <TtdHeader eyebrow="Your booking" containerClassName="max-w-2xl" />

      <div className="mx-auto w-full max-w-2xl px-5 py-6 sm:px-6">
        <Link
          to="/account"
          className="press inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Your account
        </Link>

        <section className="mt-5 rounded-2xl border border-hairline bg-surface p-5 shadow-card">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
            <div className="min-w-0">
              <p className="mono-ref text-muted-foreground">{booking.booking_reference}</p>
              <h1 className="mt-1 font-display text-[28px] leading-none">{booking.package_name}</h1>
            </div>
            <StatusBadge status={booking.status} size="sm" />
          </div>

          <VehicleCard
            className="mt-4 border-0 bg-surface-2 p-3"
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

          {booking.status === "en_route" ? (
            <p
              className={`mt-3 text-[14px] font-medium ${etaStatus ? (etaStatus.tone === "on-track" ? "text-success" : "text-warning-foreground") : schedule.tone === "on-track" ? "text-success" : "text-muted-foreground"}`}
            >
              {etaStatus ? etaStatus.label : schedule.label}
            </p>
          ) : null}
        </section>

        {isLive && (detailerPosition || destination) ? (
          <TrackingMap
            className="mt-4 h-[280px] sm:h-[340px]"
            detailerPosition={detailerPosition}
            destination={destination}
            detailerPhotoUrl={booking.detailer?.photo_url ?? null}
            lastUpdate={booking.location_updated_at}
          />
        ) : null}

        {booking.detailer ? (
          <DetailerCard
            className="mt-4"
            detailer={{ name: booking.detailer.name, role: booking.detailer.job_title }}
            photoUrl={booking.detailer.photo_url}
            vehicleDescription={booking.detailer.vehicle_description}
            phone={booking.detailer.phone}
          />
        ) : null}

        {booking.status === "in_progress" ? (
          <section className="mt-4 rounded-2xl border border-hairline bg-surface p-5 shadow-card">
            <p className="eyebrow text-muted-foreground">Detail in progress</p>
            <BookingStages bookingId={booking.id} />
          </section>
        ) : null}

        <section className="mt-4 rounded-2xl border border-hairline bg-surface p-5 shadow-card">
          <p className="eyebrow text-muted-foreground">Progress</p>
          <BookingTimeline className="mt-4" steps={timelineForStatus(booking.status)} />
        </section>

        {booking.status === "confirmed" ? (
          <div className="mt-4">
            {cancelError ? (
              <p className="mb-2 text-[13px] text-destructive">{cancelError}</p>
            ) : null}
            <PrimaryActionButton
              variant="ghostDestructive"
              loading={cancelling}
              onClick={handleCancel}
            >
              Cancel this booking
            </PrimaryActionButton>
          </div>
        ) : null}
      </div>
    </main>
  );
}

function BookingStages({ bookingId }: { bookingId: string }) {
  // Customer-facing checklist reads booking_stage_progress directly (RLS lets
  // them read their own booking's rows) — no detailer token needed here.
  const { data } = useQuery({
    queryKey: ["booking-stages", bookingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("booking_stage_progress")
        .select("stage_key, completed_at")
        .eq("booking_id", bookingId);
      if (error) throw error;
      return data as unknown as StageProgress[];
    },
    refetchInterval: 10_000,
  });

  if (!data) return null;
  return <StageChecklist className="mt-3" stages={data} />;
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
