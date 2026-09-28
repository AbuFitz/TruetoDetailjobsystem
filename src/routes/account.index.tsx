import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { addWeeks, format, isFuture } from "date-fns";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarPlus, Car, ChevronRight, LogOut, MapPin, Sparkles } from "lucide-react";
import { TtdHeader } from "@/components/ttd/Header";
import { StatusBadge } from "@/components/ttd/StatusBadge";
import { PlateTag } from "@/components/ttd/VehicleTag";
import { BrandedLoading } from "@/components/ttd/BrandedLoading";
import { EmptyState } from "@/components/ttd/EmptyState";
import { PrimaryActionButton } from "@/components/ttd/PrimaryActionButton";
import { useRequireCustomerSession } from "@/hooks/use-session";
import { getMyProfile } from "@/lib/customers";
import { listMyBookings, LIVE_JOB_STATUSES, type BookingWithDetailer } from "@/lib/bookings";
import { listMyVehicles, vehicleDescription } from "@/lib/vehicles";
import { formatAppointment } from "@/lib/format";
import { MAINTENANCE_DETAIL_INTERVAL_WEEKS } from "@/lib/constants";
import { signOut } from "@/lib/auth";

export const Route = createFileRoute("/account/")({
  head: () => ({
    meta: [{ title: "Your account | True To Detail" }, { name: "robots", content: "noindex" }],
  }),
  component: AccountDashboard,
});

/** How soon after account creation a sign-in still counts as "the first one" — Supabase sets last_sign_in_at to the same moment as created_at on that very first session. */
const FIRST_SIGN_IN_WINDOW_MS = 2 * 60 * 1000;

function AccountDashboard() {
  const { session, loading: authLoading } = useRequireCustomerSession();

  // "Welcome back" should only say "back" once someone has actually been
  // here before — comparing the auth account's creation time against its
  // last sign-in time (both on the session already, no extra query) tells
  // a genuine first-ever sign-in apart from every visit after it.
  const isFirstSignIn = useMemo(() => {
    const createdAt = session?.user.created_at;
    const lastSignInAt = session?.user.last_sign_in_at;
    if (!createdAt || !lastSignInAt) return false;
    return (
      new Date(lastSignInAt).getTime() - new Date(createdAt).getTime() < FIRST_SIGN_IN_WINDOW_MS
    );
  }, [session]);

  const { data: profile } = useQuery({
    queryKey: ["my-profile"],
    queryFn: getMyProfile,
    enabled: Boolean(session),
  });

  const { data: bookings, isLoading: bookingsLoading } = useQuery({
    queryKey: ["my-bookings"],
    queryFn: listMyBookings,
    enabled: Boolean(session),
    refetchInterval: 20_000,
  });

  const { data: vehicles } = useQuery({
    queryKey: ["my-vehicles"],
    queryFn: listMyVehicles,
    enabled: Boolean(session),
  });

  const { liveBooking, nextBooking, otherUpcoming, previousBookings, qualifyingVisits, recommendedDate } =
    useMemo(() => {
      const all = bookings ?? [];
      const live = all.find((b) => LIVE_JOB_STATUSES.includes(b.status)) ?? null;
      const upcoming = all
        .filter((b) => b.status === "confirmed" || b.status === "assigned")
        .sort(
          (a, b) => new Date(a.scheduled_start).getTime() - new Date(b.scheduled_start).getTime(),
        );
      const previous = all
        .filter((b) => b.status === "completed")
        .sort(
          (a, b) => new Date(b.scheduled_start).getTime() - new Date(a.scheduled_start).getTime(),
        );
      const visits = previous.length;
      const lastCompleted = previous[0];
      const recommended = lastCompleted
        ? addWeeks(new Date(lastCompleted.scheduled_start), MAINTENANCE_DETAIL_INTERVAL_WEEKS)
        : null;
      const next = live ?? upcoming[0] ?? null;
      return {
        liveBooking: live,
        nextBooking: next,
        // Every other future booking. Only one gets the big card, so without
        // this list a second upcoming detail was invisible on the dashboard.
        otherUpcoming: upcoming.filter((b) => b.id !== next?.id),
        previousBookings: previous.slice(0, 5),
        qualifyingVisits: visits,
        // No "you're due" nudge when a detail is already booked.
        recommendedDate: live || upcoming.length > 0 ? null : recommended,
      };
    }, [bookings]);

  if (authLoading || !session) {
    return (
      <main className="min-h-screen bg-background">
        <BrandedLoading label="Checking session" />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background pb-16">
      <TtdHeader
        homeTo="/account"
        right={
          <button
            type="button"
            onClick={() => signOut()}
            aria-label="Sign out"
            className="press inline-flex min-h-9 items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 text-[12px] font-medium text-ink-foreground/70 hover:text-ink-foreground"
          >
            <LogOut className="h-3.5 w-3.5" strokeWidth={2.2} />
            <span className="hidden sm:inline">Sign out</span>
          </button>
        }
      />

      <div className="bg-ink px-5 py-7 text-ink-foreground sm:px-6">
        <div className="mx-auto w-full max-w-2xl">
          <p className="eyebrow text-ink-foreground/30">{format(new Date(), "EEEE, d MMMM")}</p>
          <h1 className="mt-1 font-display text-[40px] leading-[0.9] sm:text-[48px]">
            {isFirstSignIn ? "WELCOME" : "WELCOME BACK"}
            {profile?.first_name ? (
              <span className="text-ink-foreground/40">, {profile.first_name.toUpperCase()}</span>
            ) : null}
            <span className="text-signal">.</span>
          </h1>
        </div>
      </div>

      <div className="mx-auto w-full max-w-2xl px-5 py-6 sm:px-6">
        {bookingsLoading ? (
          <BrandedLoading label="Loading your bookings" className="mt-8" />
        ) : nextBooking ? (
          <NextBookingCard booking={nextBooking} live={Boolean(liveBooking)} className="mt-6" />
        ) : (
          <EmptyState
            className="mt-6"
            icon={Sparkles}
            title="No upcoming detail"
            description="Book your next mobile detail and we'll come to you."
            action={
              <Link to="/book">
                <PrimaryActionButton size="md" className="w-auto px-6">
                  Book a detail
                </PrimaryActionButton>
              </Link>
            }
          />
        )}

        {otherUpcoming.length > 0 ? (
          <Section title="Also Booked">
            <div className="flex flex-col gap-2">
              {otherUpcoming.map((b) => {
                const { dayLabel, timeLabel } = formatAppointment(b.scheduled_start);
                return (
                  <Link
                    key={b.id}
                    to="/account/bookings/$id"
                    params={{ id: b.id }}
                    className="press flex items-center justify-between gap-3 rounded-xl border border-hairline bg-surface p-3.5 hover:bg-surface-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[14px] font-semibold">{b.package_name}</p>
                      <p className="text-[12px] text-muted-foreground">
                        {dayLabel}, {timeLabel} · {b.vehicle_registration}
                      </p>
                    </div>
                    <StatusBadge status={b.status} size="sm" />
                  </Link>
                );
              })}
            </div>
          </Section>
        ) : null}

        <nav aria-label="Account" className="mt-6 grid grid-cols-3 gap-2">
          {(
            [
              { to: "/book", label: "Book a detail", icon: CalendarPlus },
              { to: "/account/vehicles", label: "Your garage", icon: Car },
              { to: "/account/addresses", label: "Addresses", icon: MapPin },
            ] as const
          ).map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className="press flex flex-col items-start gap-3 rounded-xl border border-hairline bg-surface p-3.5 hover:bg-surface-2"
            >
              <Icon className="h-5 w-5 text-signal" strokeWidth={2.2} />
              <span className="flex w-full items-center justify-between gap-1 text-[13px] font-semibold leading-tight">
                {label}
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" strokeWidth={2.4} />
              </span>
            </Link>
          ))}
        </nav>

        <Section title="Your Garage">
          {vehicles && vehicles.length > 0 ? (
            <div className="flex flex-col gap-2">
              {vehicles.map((v) => (
                <div
                  key={v.id}
                  className="flex items-center gap-3 rounded-xl border border-hairline bg-surface p-3.5"
                >
                  <div className="min-w-0">
                    {vehicleDescription(v) ? (
                      <p className="truncate text-[15px] font-semibold">{vehicleDescription(v)}</p>
                    ) : null}
                    <PlateTag registration={v.registration} className="mt-1" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={Car}
              title="No vehicles saved yet"
              description="Add a vehicle from your next booking."
            />
          )}
          <Link
            to="/account/vehicles"
            className="mt-3 inline-block text-[13px] font-semibold text-signal-deep underline underline-offset-2"
          >
            Manage garage
          </Link>
        </Section>

        <Section title="TTD Rewards">
          <div className="rounded-xl border border-hairline bg-surface p-4">
            <div className="flex items-baseline gap-1.5">
              <p className="font-display text-[44px] leading-none">{qualifyingVisits}</p>
              <p className="font-display text-xl leading-none text-muted-foreground/50">/ 7</p>
            </div>
            <p className="mt-2 text-[13px] text-muted-foreground">
              qualifying visits toward your next reward
            </p>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full rounded-full bg-signal"
                style={{ width: `${Math.min(100, (qualifyingVisits / 7) * 100)}%` }}
              />
            </div>
          </div>
        </Section>

        <Section title="Previous Details">
          {previousBookings.length > 0 ? (
            <div className="flex flex-col gap-2">
              {previousBookings.map((b) => {
                const { dayLabel } = formatAppointment(b.scheduled_start);
                return (
                  <Link
                    key={b.id}
                    to="/account/bookings/$id"
                    params={{ id: b.id }}
                    className="press flex items-center justify-between gap-3 rounded-xl border border-hairline bg-surface p-3.5 hover:bg-surface-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[14px] font-semibold">{b.package_name}</p>
                      <p className="text-[12px] text-muted-foreground">
                        {format(new Date(b.scheduled_start), "d MMM yyyy")} ·{" "}
                        {dayLabel === "Today"
                          ? "Today"
                          : format(new Date(b.scheduled_start), "EEE")}
                      </p>
                    </div>
                    <StatusBadge status={b.status} size="sm" />
                  </Link>
                );
              })}
            </div>
          ) : (
            <p className="text-[13px] text-muted-foreground">Nothing completed yet.</p>
          )}
        </Section>

        {recommendedDate ? (
          <Section title="Recommended">
            <div className="rounded-xl border border-signal/25 bg-signal/8 p-4">
              <p className="text-[14px] font-semibold">
                Maintenance detail due around {format(recommendedDate, "d MMMM")}
              </p>
              <p className="mt-1 text-[13px] text-muted-foreground">
                {isFuture(recommendedDate)
                  ? "Keeps your finish looking its best between full details."
                  : "You're due, book whenever suits."}
              </p>
              <Link to="/book" className="mt-3 inline-block">
                <PrimaryActionButton size="sm" variant="outline" className="w-auto px-4">
                  Book now
                </PrimaryActionButton>
              </Link>
            </div>
          </Section>
        ) : null}

      </div>
    </main>
  );
}

function NextBookingCard({
  booking,
  live,
  className,
}: {
  booking: BookingWithDetailer;
  live: boolean;
  className?: string;
}) {
  const { dayLabel, timeLabel } = formatAppointment(booking.scheduled_start);

  if (live) {
    return (
      <Link
        to="/account/bookings/$id"
        params={{ id: booking.id }}
        className={`press block rounded-2xl border border-signal/30 bg-ink p-5 text-ink-foreground ${className ?? ""}`}
      >
        <StatusBadge status={booking.status} size="sm" />
        <p className="mt-3 font-display text-2xl leading-tight">
          {booking.detailer?.name ?? "Your detailer"} is on the way
        </p>
        <p className="mt-1 text-[14px] text-ink-foreground/70">
          {booking.package_name} · {booking.vehicle_registration}
        </p>
        <span className="mt-4 inline-flex min-h-11 items-center gap-2 bg-signal px-5 font-sans text-[13px] font-bold uppercase tracking-[0.1em] text-signal-foreground">
          View live job
        </span>
      </Link>
    );
  }

  return (
    <Link
      to="/account/bookings/$id"
      params={{ id: booking.id }}
      className={`press block rounded-2xl border border-hairline bg-surface p-5 hover:bg-surface-2 ${className ?? ""}`}
    >
      <p className="eyebrow text-muted-foreground">Next mobile detail</p>
      <p className="mt-2 font-display text-2xl leading-tight">{booking.package_name}</p>
      <p className="mt-1 text-[15px] text-muted-foreground">
        {dayLabel} · {timeLabel}
      </p>
      <p className="mt-1 text-[14px] text-muted-foreground">
        {booking.vehicle_registration} · {booking.service_postcode}
      </p>
      <div className="mt-3">
        <StatusBadge status={booking.status} size="sm" />
      </div>
    </Link>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <div className="mb-3 flex items-center gap-3">
        <h2 className="eyebrow text-muted-foreground">{title}</h2>
        <span className="h-px flex-1 bg-hairline" />
      </div>
      {children}
    </section>
  );
}
