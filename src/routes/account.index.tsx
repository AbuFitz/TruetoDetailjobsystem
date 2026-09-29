import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { addWeeks, format, isFuture } from "date-fns";
import { cn } from "@/lib/utils";
import { UK_TIME } from "@/lib/uk-time";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, CalendarPlus, Car, ChevronRight, Gift, MapPin, Check } from "lucide-react";
import { AppShell } from "@/components/ttd/AppShell";
import { StatusBadge } from "@/components/ttd/StatusBadge";
import { PlateTag } from "@/components/ttd/VehicleTag";
import { BrandedLoading } from "@/components/ttd/BrandedLoading";
import { Avatar } from "@/components/ttd/Avatar";
import { useRequireCustomerSession } from "@/hooks/use-session";
import { getMyProfile } from "@/lib/customers";
import { listMyBookings, LIVE_JOB_STATUSES, type BookingWithDetailer } from "@/lib/bookings";
import { listMyVehicles, vehicleDescription } from "@/lib/vehicles";
import { daysUntilLabel, formatAppointment } from "@/lib/format";
import { MAINTENANCE_DETAIL_INTERVAL_WEEKS } from "@/lib/constants";
import { customerHeadline, formatDuration } from "@/lib/progress";

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

  const {
    liveBooking,
    nextBooking,
    otherUpcoming,
    previousBookings,
    qualifyingVisits,
    recommendedDate,
  } = useMemo(() => {
    const all = bookings ?? [];
    const live = all.find((b) => LIVE_JOB_STATUSES.includes(b.status)) ?? null;
    const upcoming = all
      .filter(
        (b) => b.status === "requested" || b.status === "confirmed" || b.status === "assigned",
      )
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
      <div className="min-h-screen bg-background">
        <BrandedLoading label="Checking session" />
      </div>
    );
  }

  const REWARD_VISITS = 7;
  const toReward = Math.max(0, REWARD_VISITS - qualifyingVisits);

  return (
    <AppShell
      area="customer"
      eyebrow={format(new Date(), "EEEE, d MMMM", { in: UK_TIME })}
      title={
        <>
          {isFirstSignIn ? "WELCOME" : "WELCOME BACK"}
          {profile?.first_name ? (
            <span className="text-ink-foreground/40">, {profile.first_name.toUpperCase()}</span>
          ) : null}
          <span className="text-signal">.</span>
        </>
      }
    >
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-8">
          {bookingsLoading ? (
            <BrandedLoading label="Loading your bookings" className="mt-8" />
          ) : nextBooking ? (
            <NextVisitCard booking={nextBooking} live={Boolean(liveBooking)} />
          ) : (
            <BookNextCard lastVisit={previousBookings[0] ?? null} />
          )}

          {otherUpcoming.length > 0 ? (
            <Section title="Also booked">
              <VisitList bookings={otherUpcoming} />
            </Section>
          ) : null}

          <Section title="Previous details">
            {previousBookings.length > 0 ? (
              <VisitList bookings={previousBookings} past />
            ) : (
              <p className="rounded-2xl border border-dashed border-hairline px-5 py-6 text-center text-[14px] text-muted-foreground">
                Your finished details will collect here, with the date, car and what we did.
              </p>
            )}
          </Section>
        </div>

        <div className="flex min-w-0 flex-col gap-8">
          <div className="grid grid-cols-2 gap-2">
            <Link
              to="/book"
              className="press col-span-2 inline-flex min-h-12 items-center justify-between bg-signal px-5 text-[12px] font-bold uppercase tracking-[0.12em] text-signal-foreground hover:bg-signal-deep sm:col-span-1 lg:col-span-2"
            >
              Book a detail
              <CalendarPlus className="h-4 w-4" strokeWidth={2.4} />
            </Link>
            <Link
              to="/account/addresses"
              className="press col-span-2 inline-flex min-h-12 items-center justify-between border border-hairline bg-surface px-5 text-[12px] font-bold uppercase tracking-[0.12em] hover:bg-surface-2 sm:col-span-1 lg:col-span-2"
            >
              Your addresses
              <MapPin className="h-4 w-4 text-signal-deep" strokeWidth={2.4} />
            </Link>
          </div>

          <Section title="Rewards">
            <div className="rounded-2xl border border-hairline bg-surface p-5 shadow-card">
              <div className="flex items-end justify-between gap-4">
                <p className="font-display text-[56px] leading-[0.8]">
                  {Math.min(qualifyingVisits, REWARD_VISITS)}
                  <span className="text-[28px] text-muted-foreground/50"> / {REWARD_VISITS}</span>
                </p>
                <p className="max-w-[9rem] text-right text-[13px] leading-snug text-muted-foreground">
                  {toReward === 0
                    ? "Reward unlocked. Ask us on your next visit."
                    : `${toReward} more ${toReward === 1 ? "visit" : "visits"} to your reward`}
                </p>
              </div>
              <ol className="mt-5 grid grid-cols-7 gap-1.5" aria-label="Reward stamps">
                {Array.from({ length: REWARD_VISITS }, (_, i) => {
                  const done = i < qualifyingVisits;
                  const last = i === REWARD_VISITS - 1;
                  return (
                    <li
                      key={i}
                      className={cn(
                        "grid aspect-square place-items-center rounded-full border-2",
                        done
                          ? "border-signal bg-signal text-signal-foreground"
                          : last
                            ? "border-dashed border-signal/60 text-signal-deep"
                            : "border-hairline text-transparent",
                      )}
                    >
                      {done ? (
                        <Check className="h-3.5 w-3.5" strokeWidth={3.2} />
                      ) : last ? (
                        <Gift className="h-3.5 w-3.5" strokeWidth={2.4} />
                      ) : null}
                    </li>
                  );
                })}
              </ol>
            </div>
          </Section>

          <Section title="Your garage">
            <div className="overflow-hidden rounded-2xl border border-hairline bg-surface">
              {vehicles && vehicles.length > 0 ? (
                <ul className="divide-y divide-hairline">
                  {vehicles.map((v) => (
                    <li key={v.id} className="flex items-center justify-between gap-3 px-4 py-3.5">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface-2 text-muted-foreground">
                          <Car className="h-4 w-4" strokeWidth={2.1} />
                        </span>
                        <p className="truncate text-[14px] font-semibold">
                          {vehicleDescription(v) || "Saved car"}
                        </p>
                      </div>
                      <PlateTag registration={v.registration} />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-4 py-5 text-[14px] text-muted-foreground">
                  Cars you book are saved here, so rebooking takes two taps.
                </p>
              )}
              <Link
                to="/account/vehicles"
                className="press flex items-center justify-between border-t border-hairline bg-surface-2 px-4 py-3 text-[12px] font-bold uppercase tracking-[0.12em] hover:bg-surface"
              >
                Manage garage
                <ChevronRight className="h-4 w-4 text-muted-foreground" strokeWidth={2.4} />
              </Link>
            </div>
          </Section>

          {recommendedDate ? (
            <div className="rounded-2xl border border-signal/30 bg-signal/8 p-5">
              <p className="eyebrow text-signal-deep">Recommended</p>
              <p className="mt-2 font-display text-[28px] leading-[0.95]">
                MAINTENANCE DETAIL DUE AROUND{" "}
                {format(recommendedDate, "d MMMM", { in: UK_TIME }).toUpperCase()}
              </p>
              <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
                {isFuture(recommendedDate)
                  ? "Keeps your finish looking its best between full details."
                  : "You are due. Book whenever suits."}
              </p>
              <Link
                to="/book"
                className="press mt-4 inline-flex min-h-11 items-center gap-2 text-[12px] font-bold uppercase tracking-[0.12em] text-signal-deep"
              >
                Book now <ArrowRight className="h-4 w-4" strokeWidth={2.6} />
              </Link>
            </div>
          ) : null}
        </div>
      </div>
    </AppShell>
  );
}

/** Big day and month, the way the booking sits on a calendar. */
function DateBlock({ iso, tone = "light" }: { iso: string; tone?: "light" | "dark" }) {
  const d = new Date(iso);
  return (
    <div
      className={cn(
        "flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-xl",
        tone === "dark" ? "bg-white/10" : "bg-surface-2",
      )}
    >
      <span className="font-display text-[26px] leading-[0.85]">
        {format(d, "d", { in: UK_TIME })}
      </span>
      <span
        className={cn(
          "text-[10px] font-bold uppercase tracking-[0.14em]",
          tone === "dark" ? "text-ink-foreground/60" : "text-muted-foreground",
        )}
      >
        {format(d, "MMM", { in: UK_TIME })}
      </span>
    </div>
  );
}

/** One card with rows, not a stack of separate boxes. */
function VisitList({
  bookings,
  past = false,
}: {
  bookings: BookingWithDetailer[];
  past?: boolean;
}) {
  return (
    <ul className="divide-y divide-hairline overflow-hidden rounded-2xl border border-hairline bg-surface">
      {bookings.map((b) => {
        const { dayLabel, timeLabel } = formatAppointment(b.scheduled_start);
        return (
          <li key={b.id}>
            <Link
              to="/account/bookings/$id"
              params={{ id: b.id }}
              className="press flex items-center gap-3.5 px-4 py-3.5 hover:bg-surface-2"
            >
              <DateBlock iso={b.scheduled_start} />
              <div className="min-w-0 flex-1">
                <p className="font-display text-[22px] leading-[1.02] sm:truncate">
                  {b.package_name}
                </p>
                <p className="mt-1 text-[12px] text-muted-foreground">
                  {past
                    ? format(new Date(b.scheduled_start), "EEEE", { in: UK_TIME })
                    : `${dayLabel}, ${timeLabel}`}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <PlateTag registration={b.vehicle_registration} className="text-[13px]" />
                  <span className="sm:hidden">
                    <StatusBadge status={b.status} size="sm" />
                  </span>
                </div>
              </div>
              <span className="hidden shrink-0 sm:block">
                <StatusBadge status={b.status} size="sm" />
              </span>
              <ChevronRight
                className="hidden h-4 w-4 shrink-0 text-muted-foreground sm:block"
                strokeWidth={2.4}
              />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function NextVisitCard({ booking, live }: { booking: BookingWithDetailer; live: boolean }) {
  const { timeLabel } = formatAppointment(booking.scheduled_start);
  const d = new Date(booking.scheduled_start);
  const first = booking.detailer?.name?.split(" ")[0];

  return (
    <Link
      to="/account/bookings/$id"
      params={{ id: booking.id }}
      className="press relative block overflow-hidden rounded-2xl bg-ink p-5 text-ink-foreground shadow-card sm:p-7"
    >
      <span className="absolute inset-x-0 top-0 h-1 bg-signal" aria-hidden />
      <div className="flex items-center justify-between gap-3">
        <p className="eyebrow flex items-center gap-2 text-ink-foreground/55">
          {live ? (
            <span className="relative grid h-2 w-2 place-items-center">
              <span className="pulse-ring absolute h-2 w-2 rounded-full bg-signal" />
              <span className="h-2 w-2 rounded-full bg-signal" />
            </span>
          ) : null}
          {live ? "Happening now" : "Next visit"}
        </p>
        {!live ? (
          <span className="bg-white/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-signal">
            {daysUntilLabel(booking.scheduled_start)}
          </span>
        ) : (
          <StatusBadge status={booking.status} size="sm" />
        )}
      </div>

      {live ? (
        <>
          <p className="mt-4 font-display text-[44px] leading-[0.9] sm:text-[56px]">
            {customerHeadline(booking.status, first).toUpperCase()}
          </p>
          {booking.status === "en_route" && booking.eta_seconds != null ? (
            <p className="mt-2 text-[17px] font-semibold text-signal">
              About {formatDuration(booking.eta_seconds)} away
            </p>
          ) : null}
        </>
      ) : (
        <div className="mt-4 flex items-end gap-4">
          <p className="font-display text-[64px] leading-[0.82] sm:text-[88px]">
            {format(d, "EEE d", { in: UK_TIME }).toUpperCase()}
            <span className="ml-3 text-ink-foreground/40">
              {format(d, "MMM", { in: UK_TIME }).toUpperCase()}
            </span>
          </p>
        </div>
      )}

      <p className="mt-4 font-display text-[28px] leading-none sm:text-[32px]">
        {booking.package_name}
        {!live ? <span className="text-ink-foreground/45"> · {timeLabel}</span> : null}
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-3 border-t border-white/10 pt-5">
        <PlateTag registration={booking.vehicle_registration} />
        <span className="flex min-w-0 items-center gap-1.5 text-[13px] text-ink-foreground/65">
          <MapPin className="h-4 w-4 shrink-0" strokeWidth={2.1} />
          <span className="truncate">{booking.service_postcode}</span>
        </span>
        {booking.detailer ? (
          <span className="flex items-center gap-2 text-[13px] text-ink-foreground/80">
            <Avatar
              name={booking.detailer.name}
              photoUrl={booking.detailer.photo_url}
              size="sm"
              className="bg-signal text-signal-foreground"
            />
            {first}
          </span>
        ) : null}
        <span className="ml-auto inline-flex min-h-11 items-center gap-2 bg-signal px-5 text-[12px] font-bold uppercase tracking-[0.12em] text-signal-foreground">
          {live ? (booking.status === "en_route" ? "Watch live" : "View job") : "View booking"}
          <ArrowRight className="h-4 w-4" strokeWidth={2.6} />
        </span>
      </div>
      {!live ? <StatusBadgeRow status={booking.status} /> : null}
    </Link>
  );
}

function StatusBadgeRow({ status }: { status: BookingWithDetailer["status"] }) {
  const line =
    status === "requested"
      ? "We are checking your slot and will confirm by email."
      : status === "assigned"
        ? "Your detailer is set. You will be told when they set off."
        : "You are booked in. There is nothing you need to do.";
  return <p className="mt-4 text-[13px] text-ink-foreground/55">{line}</p>;
}

function BookNextCard({ lastVisit }: { lastVisit: BookingWithDetailer | null }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-signal/30 bg-signal/8 p-6 sm:p-8">
      <p className="eyebrow text-signal-deep">Nothing booked</p>
      <p className="mt-3 font-display text-[44px] leading-[0.9] sm:text-[60px]">
        READY FOR YOUR NEXT DETAIL?
      </p>
      <p className="mt-3 max-w-md text-[15px] leading-relaxed text-muted-foreground">
        {lastVisit
          ? `Your last detail was on ${format(new Date(lastVisit.scheduled_start), "d MMMM", { in: UK_TIME })}. Pick a day and we come to you.`
          : "Pick a day and we come to you, with our own water and power."}
      </p>
      <Link
        to="/book"
        className="press mt-6 inline-flex min-h-12 items-center gap-2 bg-signal px-6 text-[12px] font-bold uppercase tracking-[0.12em] text-signal-foreground hover:bg-signal-deep"
      >
        Book a detail <ArrowRight className="h-4 w-4" strokeWidth={2.6} />
      </Link>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-3 flex items-center gap-3">
        <h2 className="eyebrow text-muted-foreground">{title}</h2>
        <span className="h-px flex-1 bg-hairline" />
      </div>
      {children}
    </section>
  );
}
