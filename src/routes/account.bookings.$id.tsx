import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Check, Link2 } from "lucide-react";
import { AppShell } from "@/components/ttd/AppShell";
import { StatusBadge } from "@/components/ttd/StatusBadge";
import { BookingSummary } from "@/components/ttd/BookingSummary";
import {
  AlertsToggle,
  JourneyLog,
  PrepList,
  useTrackingAlerts,
} from "@/components/ttd/TrackingExtras";
import { journeyEvents, timeOnSiteMinutes } from "@/lib/journey";
import { LiveJobPanel, StepTracker, viewFromBooking } from "@/components/ttd/LiveJob";
import { BrandedLoading } from "@/components/ttd/BrandedLoading";
import { PrimaryActionButton } from "@/components/ttd/PrimaryActionButton";
import { useRequireCustomerSession } from "@/hooks/use-session";
import {
  getMyBookingById,
  cancelOwnBooking,
  listMyBookings,
  LIVE_JOB_STATUSES,
} from "@/lib/bookings";
import { formatAppointment } from "@/lib/format";
import { customerHeadline, customerStepIndex, formatDuration } from "@/lib/progress";
import { sendBookingEmail } from "@/lib/portal-email";
import { copyText } from "@/lib/clipboard";
import { supabase } from "@/lib/supabase";
import { ttdSiteLinks, supportContact, REWARD_VISITS_REQUIRED } from "@/lib/constants";
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
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const { data: booking, isLoading } = useQuery({
    queryKey: ["my-booking", id],
    queryFn: () => getMyBookingById(id),
    enabled: Boolean(session),
    refetchInterval: 5_000,
  });

  const { data: stages } = useQuery({
    queryKey: ["booking-stages", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("booking_stage_progress")
        .select("stage_key, completed_at")
        .eq("booking_id", id);
      if (error) throw error;
      return data as unknown as StageProgress[];
    },
    enabled:
      Boolean(session) &&
      Boolean(booking) &&
      ["in_progress", "qc", "handover", "arrived", "check_in"].includes(booking?.status ?? ""),
    refetchInterval: 10_000,
  });

  // Which counted visit this is once it is done, from the same list the account home reads.
  const { data: allBookings } = useQuery({
    queryKey: ["my-bookings"],
    queryFn: listMyBookings,
    enabled: Boolean(session),
  });
  const visitNumber = useMemo(() => {
    if (!allBookings || booking?.status !== "completed") return null;
    const done = allBookings
      .filter((b) => b.status === "completed")
      .sort(
        (a, b) => new Date(a.scheduled_start).getTime() - new Date(b.scheduled_start).getTime(),
      );
    const i = done.findIndex((b) => b.id === id);
    return i >= 0 ? i + 1 : null;
  }, [allBookings, booking?.status, id]);

  async function handleCancel() {
    setCancelError(null);
    setCancelling(true);
    try {
      await cancelOwnBooking(id);
      void sendBookingEmail(id, "cancelled");
      await queryClient.invalidateQueries({ queryKey: ["my-booking", id] });
      await queryClient.invalidateQueries({ queryKey: ["my-bookings"] });
      setConfirmCancel(false);
    } catch (err) {
      setCancelError(err instanceof Error ? err.message : "Couldn't cancel this booking.");
    } finally {
      setCancelling(false);
    }
  }

  async function copyLink() {
    if (!booking) return;
    const ok = await copyText(`${ttdSiteLinks.website}/account/track/${booking.tracking_token}`);
    setCopied(ok);
    if (ok) setTimeout(() => setCopied(false), 2500);
  }

  // Say so in the page when the detailer sets off, arrives or finishes while it is open.
  useTrackingAlerts(booking?.status, booking?.detailer?.name?.split(" ")[0] ?? null, null);

  if (authLoading || isLoading || !booking) {
    return (
      <div className="min-h-screen bg-background">
        <BrandedLoading label="Loading your booking" />
      </div>
    );
  }

  const { dayLabel, timeLabel } = formatAppointment(booking.scheduled_start);
  const view = viewFromBooking(booking, stages ?? []);
  const live = LIVE_JOB_STATUSES.includes(booking.status) && booking.status !== "assigned";
  const canCancel = booking.status === "requested" || booking.status === "confirmed";
  const stepNow = customerStepIndex(booking.status);
  const upcoming = ["requested", "confirmed", "assigned", "en_route"].includes(booking.status);
  const events = journeyEvents(booking, view.detailerFirstName);
  const calendarEvent = {
    uid: booking.booking_reference,
    title: `True To Detail: ${booking.package_name}`,
    start: new Date(booking.scheduled_start),
    durationMinutes: booking.estimated_duration_minutes || 120,
    location: `${booking.service_address_line1}, ${booking.service_postcode}`,
    description: `Booking ${booking.booking_reference}.`,
  };

  return (
    <AppShell
      area="customer"
      width="wide"
      eyebrow={booking.booking_reference}
      title={
        <>
          {customerHeadline(booking.status, view.detailerFirstName).toUpperCase()}
          <span className="text-signal">.</span>
        </>
      }
      back={{ to: "/account", label: "My Account" }}
      actions={
        <span className="inline-flex rounded-full bg-surface p-1 text-foreground">
          <StatusBadge status={booking.status} />
        </span>
      }
    >
      {/*
        One column on a phone, in the order a customer needs it: where things stand, the
        booking itself, then the story so far and what to do before we arrive, with the
        cancel control last. From lg up the booking sits in a side column beside them.
      */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:grid-rows-[auto_1fr_auto] lg:gap-x-6">
        <div className="lg:col-start-1 lg:row-start-1">
          {live ? (
            <LiveJobPanel view={view} showHeadline={false} />
          ) : (
            <section className="rounded-2xl border border-hairline bg-surface p-5 sm:p-6">
              <div className="flex items-center justify-between gap-3">
                <p className="eyebrow text-muted-foreground">Progress</p>
                {stepNow >= 0 ? (
                  <p className="font-mono text-[12px] text-muted-foreground">
                    Step {Math.min(5, Math.floor(stepNow) + 1)} of 5
                  </p>
                ) : null}
              </div>
              <StepTracker status={booking.status} className="mt-5" />
              {booking.status === "requested" ? (
                <p className="mt-5 text-[14px] leading-relaxed text-muted-foreground">
                  We are checking your slot and will email you as soon as it is confirmed.
                </p>
              ) : null}
              {booking.status === "assigned" && view.detailerName ? (
                <p className="mt-5 text-[14px] leading-relaxed text-muted-foreground">
                  {view.detailerName} will be with you at {timeLabel}. You will get a message when
                  they set off, with a live map and arrival time.
                </p>
              ) : null}
              {booking.status === "completed" ? (
                <p className="mt-5 text-[14px] leading-relaxed text-muted-foreground">
                  Thank you for booking with us.
                  {timeOnSiteMinutes(booking)
                    ? ` ${formatDuration(timeOnSiteMinutes(booking)! * 60)} on site.`
                    : ""}
                  {visitNumber && visitNumber <= REWARD_VISITS_REQUIRED
                    ? ` That is visit ${visitNumber} of ${REWARD_VISITS_REQUIRED}.`
                    : ""}{" "}
                  See you next time.
                </p>
              ) : null}
              {booking.status === "cancelled" ? (
                <p className="mt-5 text-[14px] leading-relaxed text-muted-foreground">
                  {booking.cancellation_reason ? `${booking.cancellation_reason}. ` : ""}To rebook,
                  use Book a detail or call {supportContact.phone}.
                </p>
              ) : null}
            </section>
          )}
        </div>

        <aside className="flex flex-col gap-4 lg:col-start-2 lg:row-span-2 lg:row-start-1">
          <BookingSummary
            packageName={booking.package_name}
            addons={booking.addon_labels}
            dayLabel={dayLabel}
            timeLabel={timeLabel}
            startIso={booking.scheduled_start}
            vehicleDescription={booking.vehicle_description}
            registration={booking.vehicle_registration}
            where={`${booking.service_address_line1}, ${booking.service_postcode}`}
            price={booking.price}
            notes={booking.customer_notes}
            calendar={upcoming ? calendarEvent : null}
          />
          {upcoming ? <AlertsToggle /> : null}

          {booking.status !== "cancelled" && booking.status !== "completed" ? (
            <button
              type="button"
              onClick={copyLink}
              className="press flex min-h-16 items-center justify-between gap-3 rounded-2xl border border-hairline bg-surface p-4 text-left hover:bg-surface-2"
            >
              <span>
                <span className="block text-[14px] font-semibold">
                  {copied ? "Link copied" : "Share a live link"}
                </span>
                <span className="block text-[12px] text-muted-foreground">
                  {copied
                    ? "Paste it into a message. They do not need to sign in."
                    : "Let someone else follow this booking without signing in."}
                </span>
              </span>
              <span
                className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${copied ? "bg-success/12 text-success" : "bg-surface-2 text-muted-foreground"}`}
              >
                {copied ? <Check className="h-5 w-5" /> : <Link2 className="h-5 w-5" />}
              </span>
            </button>
          ) : null}
        </aside>

        <div className="flex flex-col gap-4 lg:col-start-1 lg:row-start-2">
          {booking.status !== "requested" ? <JourneyLog events={events} /> : null}
          {upcoming ? <PrepList /> : null}
        </div>

        {canCancel ? (
          <div className="lg:col-start-2 lg:row-start-3">
            {cancelError ? (
              <p className="mb-2 text-[13px] text-destructive">{cancelError}</p>
            ) : null}
            {confirmCancel ? (
              <div className="rounded-2xl border border-destructive/25 p-4">
                <p className="text-[14px] font-semibold">Cancel this booking?</p>
                <p className="mt-1 text-[13px] text-muted-foreground">
                  To change the date instead, call or WhatsApp {supportContact.phone}. We are happy
                  to move it.
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <PrimaryActionButton
                    variant="outline"
                    size="md"
                    onClick={() => setConfirmCancel(false)}
                  >
                    Keep it
                  </PrimaryActionButton>
                  <PrimaryActionButton
                    variant="ghostDestructive"
                    size="md"
                    loading={cancelling}
                    onClick={handleCancel}
                  >
                    Yes, cancel
                  </PrimaryActionButton>
                </div>
              </div>
            ) : (
              <PrimaryActionButton
                variant="ghostDestructive"
                onClick={() => setConfirmCancel(true)}
              >
                Cancel this booking
              </PrimaryActionButton>
            )}
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}
