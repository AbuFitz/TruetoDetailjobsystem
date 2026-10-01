import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { MessageCircle, PartyPopper, Phone, Sparkles } from "lucide-react";
import { BookingSummary } from "@/components/ttd/BookingSummary";
import { PublicShell } from "@/components/ttd/PublicShell";
import { StatusBadge } from "@/components/ttd/StatusBadge";
import { LiveJobPanel, StepTracker, viewFromTracked } from "@/components/ttd/LiveJob";
import { BrandedLoading } from "@/components/ttd/BrandedLoading";
import { getTrackedBooking } from "@/lib/tracking";
import {
  AlertsToggle,
  ConnectionBanner,
  JourneyLog,
  PrepList,
  ShareLink,
  useLiveTitle,
  useTrackingAlerts,
} from "@/components/ttd/TrackingExtras";
import { customerHeadline, formatDuration } from "@/lib/progress";
import { journeyEvents, timeOnSiteMinutes } from "@/lib/journey";
import { formatAppointment } from "@/lib/format";
import { supportContact } from "@/lib/constants";

export const Route = createFileRoute("/account/track/$token")({
  head: () => ({
    meta: [{ title: "Your booking | True To Detail" }, { name: "robots", content: "noindex" }],
  }),
  component: TrackPage,
});

function TrackPage() {
  const { token } = Route.useParams();
  const {
    data: booking,
    isLoading,
    isError,
    dataUpdatedAt,
  } = useQuery({
    queryKey: ["tracked", token],
    queryFn: () => getTrackedBooking(token),
    // Quicker while the detailer is driving, relaxed otherwise; pauses in a hidden tab.
    refetchInterval: (q) => (q.state.data?.status === "en_route" ? 5_000 : 15_000),
    refetchOnWindowFocus: true,
  });

  const detailerFirst = booking?.detailer?.first_name ?? null;
  const etaAt = booking?.tracking?.eta_updated_at;
  const etaSecs = booking?.tracking?.eta_seconds;
  const etaMinutes =
    booking?.status === "en_route" && etaAt && etaSecs != null
      ? Math.max(1, Math.round((new Date(etaAt).getTime() + etaSecs * 1000 - Date.now()) / 60_000))
      : null;
  useTrackingAlerts(booking?.status, detailerFirst, etaMinutes);
  useLiveTitle(
    booking?.status === "en_route" && etaMinutes != null
      ? `${detailerFirst ?? "Detailer"} is ${etaMinutes} min away`
      : booking
        ? customerHeadline(booking.status, detailerFirst)
        : null,
  );

  if (isLoading) {
    return (
      <PublicShell eyebrow="Your booking" title="One moment">
        <BrandedLoading label="Finding your booking" />
      </PublicShell>
    );
  }

  if (isError || !booking) {
    return (
      <PublicShell eyebrow="Your booking" title="We could not find it">
        <p className="text-[15px] leading-relaxed text-muted-foreground">
          This link may be incomplete. Open the link from your confirmation email again, or call or
          WhatsApp us on{" "}
          <a
            className="font-semibold text-foreground underline underline-offset-2"
            href={`tel:${supportContact.phone.replace(/\s/g, "")}`}
          >
            {supportContact.phone}
          </a>
          .
        </p>
        <Link
          to="/account/login"
          className="mt-6 inline-block text-[13px] font-semibold text-signal-deep underline underline-offset-2"
        >
          Sign in to your account
        </Link>
      </PublicShell>
    );
  }

  const view = viewFromTracked(booking);
  const { dayLabel, timeLabel } = formatAppointment(booking.scheduled_start);
  const live = ["en_route", "arrived", "check_in", "in_progress", "qc", "handover"].includes(
    booking.status,
  );
  const first = booking.customer_first_name;
  const upcoming = ["requested", "confirmed", "assigned", "en_route"].includes(booking.status);
  const events = journeyEvents(booking, view.detailerFirstName);
  const onSite = timeOnSiteMinutes(booking);
  const calendarEvent = {
    uid: booking.reference,
    title: `True To Detail: ${booking.package_name}`,
    start: new Date(booking.scheduled_start),
    durationMinutes: booking.estimated_duration_minutes || 120,
    location: [booking.service_city, booking.service_postcode].filter(Boolean).join(", "),
    description: `Booking ${booking.reference}. Follow your detailer live: ${typeof window === "undefined" ? "" : window.location.href}`,
  };

  return (
    <PublicShell
      width="wide"
      eyebrow={booking.reference}
      title={
        <>
          {customerHeadline(booking.status, view.detailerFirstName).toUpperCase()}
          <span className="text-signal">.</span>
        </>
      }
      subtitle={
        first ? `Hi ${first}, this page updates by itself.` : "This page updates by itself."
      }
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          <ConnectionBanner
            dataUpdatedAt={dataUpdatedAt}
            live={booking.status === "en_route"}
            locationUpdatedAt={booking.tracking?.updated_at ?? null}
          />
          {booking.status === "completed" ? (
            <section className="rounded-2xl bg-ink p-5 text-ink-foreground shadow-card">
              <p className="eyebrow flex items-center gap-2 text-ink-foreground/55">
                <PartyPopper className="h-3.5 w-3.5" strokeWidth={2.4} /> Finished
              </p>
              <p className="mt-3 font-display text-[40px] leading-none">
                Enjoy the finish{first ? `, ${first}` : ""}
              </p>
              <p className="mt-2 text-[14px] leading-relaxed text-ink-foreground/70">
                {onSite ? `${formatDuration(onSite * 60)} on site. ` : ""}Thanks for choosing True
                To Detail. Rebooking takes a couple of taps.
              </p>
              <Link
                to="/book"
                className="press rounded-full mt-4 inline-flex min-h-11 items-center justify-center bg-signal px-5 text-[12px] font-bold uppercase tracking-[0.1em] text-signal-foreground hover:bg-signal-deep"
              >
                Book again
              </Link>
            </section>
          ) : null}
          {live ? (
            <LiveJobPanel view={view} showHeadline={false} />
          ) : (
            <div className="rounded-2xl border border-hairline bg-surface p-5">
              <StatusBadge status={booking.status} size="sm" />
              {booking.status === "requested" ? (
                <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
                  Thanks for your request. We are checking your slot and will confirm it shortly by
                  email. There is nothing else you need to do.
                </p>
              ) : null}
              {booking.status === "cancelled" ? (
                <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
                  If that is a surprise, or you would like another slot, call or WhatsApp us on{" "}
                  {supportContact.phone}.
                </p>
              ) : null}
              <StepTracker status={booking.status} className="mt-6" />
            </div>
          )}
          {booking.status !== "requested" ? <JourneyLog events={events} /> : null}
          {["confirmed", "assigned", "en_route", "requested"].includes(booking.status) ? (
            <PrepList />
          ) : null}
          {!live && view.detailerName ? (
            <p className="rounded-xl bg-surface-2 px-4 py-3 text-[14px]">
              <span className="font-semibold">{view.detailerName}</span> is your detailer
              {view.detailerVehicle ? ` (${view.detailerVehicle})` : ""}.
            </p>
          ) : null}
        </div>

        <aside className="flex flex-col gap-4">
          {upcoming ? <AlertsToggle /> : null}
          <BookingSummary
            packageName={booking.package_name}
            addons={booking.addon_labels}
            dayLabel={dayLabel}
            timeLabel={timeLabel}
            startIso={booking.scheduled_start}
            vehicleDescription={booking.vehicle_description}
            registration={booking.vehicle_registration}
            where={[booking.service_city, booking.service_postcode].filter(Boolean).join(", ")}
            price={booking.price}
            calendar={upcoming ? calendarEvent : null}
          />
          {upcoming ? <ShareLink /> : null}

          {!booking.customer_has_account ? (
            <section className="rounded-2xl border border-signal/30 bg-signal/8 p-5">
              <p className="flex items-center gap-2 font-display text-[24px] leading-none">
                <Sparkles className="h-5 w-5 text-signal" strokeWidth={2.4} /> MAKE IT EASIER NEXT
                TIME
              </p>
              <ul className="mt-3 flex flex-col gap-1.5 text-[14px] text-muted-foreground">
                <li>Rebook in two taps with your car and address saved</li>
                <li>Follow every visit and see your history</li>
                <li>Earn rewards toward your next detail</li>
              </ul>
              <Link
                to="/account/create"
                search={{ from: token }}
                className="press rounded-full mt-4 inline-flex min-h-11 w-full items-center justify-center bg-signal px-4 text-[12px] font-bold uppercase tracking-[0.1em] text-signal-foreground hover:bg-signal-deep"
              >
                Create your free account
              </Link>
            </section>
          ) : (
            <Link
              to="/account/login"
              className="press rounded-2xl border border-hairline bg-surface p-4 text-[14px] font-semibold hover:bg-surface-2"
            >
              Sign in to manage this booking
            </Link>
          )}

          <section className="rounded-2xl border border-hairline bg-surface p-5">
            <p className="eyebrow text-muted-foreground">Need to change something?</p>
            <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">
              Call or WhatsApp us and we will sort it.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <a
                className="press inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-hairline text-[13px] font-semibold hover:bg-surface-2"
                href={`tel:${supportContact.phone.replace(/\s/g, "")}`}
              >
                <Phone className="h-4 w-4" /> Call
              </a>
              <a
                className="press inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-hairline text-[13px] font-semibold hover:bg-surface-2"
                href={`https://wa.me/44${supportContact.phone.replace(/\s/g, "").slice(1)}`}
              >
                <MessageCircle className="h-4 w-4" /> WhatsApp
              </a>
            </div>
          </section>
        </aside>
      </div>
    </PublicShell>
  );
}
