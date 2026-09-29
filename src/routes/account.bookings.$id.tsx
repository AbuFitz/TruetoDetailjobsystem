import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { CalendarClock, Check, Link2, MapPin } from "lucide-react";
import { AppShell } from "@/components/ttd/AppShell";
import { StatusBadge } from "@/components/ttd/StatusBadge";
import { VehicleCard } from "@/components/ttd/VehicleTag";
import { LiveJobPanel, StepTracker, viewFromBooking } from "@/components/ttd/LiveJob";
import { BrandedLoading } from "@/components/ttd/BrandedLoading";
import { PrimaryActionButton } from "@/components/ttd/PrimaryActionButton";
import { useRequireCustomerSession } from "@/hooks/use-session";
import { getMyBookingById, cancelOwnBooking, LIVE_JOB_STATUSES } from "@/lib/bookings";
import { formatAppointment } from "@/lib/format";
import { customerHeadline } from "@/lib/progress";
import { sendBookingEmail } from "@/lib/portal-email";
import { supabase } from "@/lib/supabase";
import { ttdSiteLinks, supportContact } from "@/lib/constants";
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
    const url = `${ttdSiteLinks.website}/account/track/${booking.tracking_token}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      window.prompt("Copy this link", url);
    }
  }

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
      actions={<StatusBadge status={booking.status} />}
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          {live ? (
            <LiveJobPanel view={view} showHeadline={false} />
          ) : (
            <section className="rounded-2xl border border-hairline bg-surface p-5">
              <p className="eyebrow text-muted-foreground">Progress</p>
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
                  Thank you for booking with us. See you next time.
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

        <aside className="flex flex-col gap-4">
          <section className="rounded-2xl border border-hairline bg-surface p-5">
            <p className="eyebrow text-muted-foreground">Your booking</p>
            <h2 className="mt-2 text-[28px] leading-none">{booking.package_name}</h2>
            <VehicleCard
              className="mt-4 rounded-xl border-0 bg-surface-2 p-3"
              vehicle={{
                description: booking.vehicle_description,
                registration: booking.vehicle_registration,
              }}
            />
            <div className="mt-3 flex flex-col gap-2.5">
              <Fact icon={CalendarClock} label="When">
                {dayLabel}, {timeLabel}
              </Fact>
              <Fact icon={MapPin} label="Where">
                {booking.service_address_line1}, {booking.service_postcode}
              </Fact>
            </div>
            <dl className="mt-4 flex flex-col gap-2 border-t border-hairline pt-4 text-[14px]">
              {booking.addon_labels.length > 0 ? (
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Add-ons</dt>
                  <dd className="text-right font-medium">{booking.addon_labels.join(", ")}</dd>
                </div>
              ) : null}
              <div className="flex items-baseline justify-between gap-4">
                <dt className="eyebrow text-foreground">Total</dt>
                <dd className="font-display text-[28px] leading-none">£{booking.price}</dd>
              </div>
            </dl>
            {booking.customer_notes ? (
              <p className="mt-3 rounded-xl bg-surface-2 px-3.5 py-3 text-[13px] leading-relaxed text-muted-foreground">
                <span className="font-semibold text-foreground">Your notes: </span>
                {booking.customer_notes}
              </p>
            ) : null}
            <p className="mt-3 text-[12px] text-muted-foreground">
              Paid on the day by card, bank transfer or cash. The price is fixed.
            </p>
          </section>

          {booking.status !== "cancelled" && booking.status !== "completed" ? (
            <button
              type="button"
              onClick={copyLink}
              className="press flex items-center justify-between gap-3 rounded-2xl border border-hairline bg-surface p-4 text-left hover:bg-surface-2"
            >
              <span>
                <span className="block text-[14px] font-semibold">Share a live link</span>
                <span className="block text-[12px] text-muted-foreground">
                  Let someone else follow this booking without signing in.
                </span>
              </span>
              {copied ? (
                <Check className="h-5 w-5 shrink-0 text-success" />
              ) : (
                <Link2 className="h-5 w-5 shrink-0 text-muted-foreground" />
              )}
            </button>
          ) : null}

          {canCancel ? (
            <div>
              {cancelError ? (
                <p className="mb-2 text-[13px] text-destructive">{cancelError}</p>
              ) : null}
              {confirmCancel ? (
                <div className="rounded-2xl border border-destructive/25 p-4">
                  <p className="text-[14px] font-semibold">Cancel this booking?</p>
                  <p className="mt-1 text-[13px] text-muted-foreground">
                    To change the date instead, call or WhatsApp {supportContact.phone}. We are
                    happy to move it.
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
        </aside>
      </div>
    </AppShell>
  );
}

function Fact({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-hairline bg-surface-2 p-3.5">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={2.2} />
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          {label}
        </p>
        <p className="text-[15px] font-semibold leading-tight">{children}</p>
      </div>
    </div>
  );
}
