import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { addWeeks, format, isFuture } from "date-fns";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Car, LogOut, MapPin, Sparkles, Trophy } from "lucide-react";
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

function AccountDashboard() {
  const { session, loading: authLoading } = useRequireCustomerSession();

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

  const { liveBooking, nextBooking, previousBookings, qualifyingVisits, recommendedDate } =
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
      return {
        liveBooking: live,
        nextBooking: live ?? upcoming[0] ?? null,
        previousBookings: previous.slice(0, 5),
        qualifyingVisits: visits,
        recommendedDate: recommended,
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
            className="press inline-flex min-h-9 items-center gap-1.5 rounded-full border border-hairline bg-surface-2 px-3 text-[12px] font-medium text-muted-foreground hover:text-foreground"
          >
            <LogOut className="h-3.5 w-3.5" strokeWidth={2.2} />
            <span className="hidden sm:inline">Sign out</span>
          </button>
        }
      />

      <div className="mx-auto w-full max-w-2xl px-5 py-6 sm:px-6">
        <h1 className="font-display text-[32px] leading-none">
          Welcome back{profile?.first_name ? `, ${profile.first_name}` : ""}
        </h1>

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

        <Section title="Your Garage">
          {vehicles && vehicles.length > 0 ? (
            <div className="flex flex-col gap-2">
              {vehicles.map((v) => (
                <div
                  key={v.id}
                  className="flex items-center gap-3 rounded-xl border border-hairline bg-surface p-3.5"
                >
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-surface-2 text-foreground">
                    <Car className="h-5 w-5" strokeWidth={2} />
                  </span>
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
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-signal/12 text-signal-deep">
                <Trophy className="h-5 w-5" strokeWidth={2} />
              </span>
              <div>
                <p className="font-display text-xl leading-none">{qualifyingVisits} / 7</p>
                <p className="mt-1 text-[13px] text-muted-foreground">
                  qualifying visits toward your next reward
                </p>
              </div>
            </div>
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
                  : "You're due — book whenever suits."}
              </p>
              <Link to="/book" className="mt-3 inline-block">
                <PrimaryActionButton size="sm" variant="outline" className="w-auto px-4">
                  Book now
                </PrimaryActionButton>
              </Link>
            </div>
          </Section>
        ) : null}

        <p className="mt-8 flex items-center gap-1.5 text-[12px] text-muted-foreground">
          <MapPin className="h-3.5 w-3.5" strokeWidth={2.2} />
          Manage your saved addresses under{" "}
          <Link to="/account/addresses" className="ml-1 underline underline-offset-2">
            Addresses
          </Link>
          .
        </p>
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
        className={`press block rounded-2xl border border-signal/30 bg-ink p-5 text-ink-foreground shadow-lift ${className ?? ""}`}
      >
        <StatusBadge status={booking.status} size="sm" />
        <p className="mt-3 font-display text-2xl leading-tight">
          {booking.detailer?.name ?? "Your detailer"} is on the way
        </p>
        <p className="mt-1 text-[14px] text-ink-foreground/70">
          {booking.package_name} · {booking.vehicle_registration}
        </p>
        <span className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-signal px-5 font-display text-sm font-bold uppercase tracking-[0.08em] text-signal-foreground">
          View live job
        </span>
      </Link>
    );
  }

  return (
    <Link
      to="/account/bookings/$id"
      params={{ id: booking.id }}
      className={`press block rounded-2xl border border-hairline bg-surface p-5 shadow-card hover:bg-surface-2 ${className ?? ""}`}
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
