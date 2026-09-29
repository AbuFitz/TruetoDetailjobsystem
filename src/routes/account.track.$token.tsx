import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarClock, Car, MapPin, MessageCircle, Phone, Sparkles } from "lucide-react";
import { PublicShell } from "@/components/ttd/PublicShell";
import { StatusBadge } from "@/components/ttd/StatusBadge";
import { LiveJobPanel, StepTracker, viewFromTracked } from "@/components/ttd/LiveJob";
import { BrandedLoading } from "@/components/ttd/BrandedLoading";
import { getTrackedBooking } from "@/lib/tracking";
import { customerHeadline } from "@/lib/progress";
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
  } = useQuery({
    queryKey: ["tracked", token],
    queryFn: () => getTrackedBooking(token),
    refetchInterval: 10_000,
  });

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
          {!live && view.detailerName ? (
            <p className="rounded-xl bg-surface-2 px-4 py-3 text-[14px]">
              <span className="font-semibold">{view.detailerName}</span> is your detailer
              {view.detailerVehicle ? ` (${view.detailerVehicle})` : ""}.
            </p>
          ) : null}
        </div>

        <aside className="flex flex-col gap-4">
          <section className="rounded-2xl border border-hairline bg-surface p-5">
            <p className="eyebrow text-muted-foreground">Your booking</p>
            <p className="mt-2 font-display text-[28px] leading-none">{booking.package_name}</p>
            {booking.addon_labels && booking.addon_labels.length > 0 ? (
              <p className="mt-1.5 text-[13px] text-muted-foreground">
                + {booking.addon_labels.join(", ")}
              </p>
            ) : null}
            <dl className="mt-4 flex flex-col gap-3 text-[14px]">
              <Row icon={CalendarClock} label="When">
                {dayLabel}, {timeLabel}
              </Row>
              <Row icon={Car} label="Vehicle">
                {[booking.vehicle_description, booking.vehicle_registration]
                  .filter(Boolean)
                  .join(" · ")}
              </Row>
              <Row icon={MapPin} label="Where">
                {[booking.service_city, booking.service_postcode].filter(Boolean).join(", ")}
              </Row>
            </dl>
            {booking.price != null ? (
              <p className="mt-4 flex items-baseline justify-between border-t border-hairline pt-3">
                <span className="eyebrow">Total</span>
                <span className="font-display text-[28px] leading-none">£{booking.price}</span>
              </p>
            ) : null}
            <p className="mt-2 text-[12px] text-muted-foreground">
              Paid on the day by card, bank transfer or cash. The price is fixed.
            </p>
          </section>

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
                className="press mt-4 inline-flex min-h-11 w-full items-center justify-center bg-signal px-4 text-[12px] font-bold uppercase tracking-[0.1em] text-signal-foreground hover:bg-signal-deep"
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
                className="press inline-flex min-h-11 items-center justify-center gap-2 border border-hairline text-[13px] font-semibold hover:bg-surface-2"
                href={`tel:${supportContact.phone.replace(/\s/g, "")}`}
              >
                <Phone className="h-4 w-4" /> Call
              </a>
              <a
                className="press inline-flex min-h-11 items-center justify-center gap-2 border border-hairline text-[13px] font-semibold hover:bg-surface-2"
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

function Row({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={2.2} />
      <div className="min-w-0">
        <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          {label}
        </dt>
        <dd className="font-semibold">{children}</dd>
      </div>
    </div>
  );
}
