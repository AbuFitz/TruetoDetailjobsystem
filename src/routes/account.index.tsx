import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { addWeeks, format, isFuture } from "date-fns";
import { cn } from "@/lib/utils";
import { UK_TIME } from "@/lib/uk-time";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, CalendarPlus, ChevronRight, MapPin, Check } from "lucide-react";
import { AppShell } from "@/components/ttd/AppShell";
import { StatusBadge } from "@/components/ttd/StatusBadge";
import { PlateTag } from "@/components/ttd/VehicleTag";
import { BrandedLoading } from "@/components/ttd/BrandedLoading";
import { ErrorState } from "@/components/ttd/ErrorState";
import { Avatar } from "@/components/ttd/Avatar";
import { StepTracker } from "@/components/ttd/LiveJob";
import { VisitHero } from "@/components/ttd/VisitHero";
import { DashboardSkeleton } from "@/components/ttd/Skeleton";
import { useRequireCustomerSession } from "@/hooks/use-session";
import { getMyProfile } from "@/lib/customers";
import { listMyBookings, LIVE_JOB_STATUSES, type BookingWithDetailer } from "@/lib/bookings";
import { listMyVehicles, vehicleDescription } from "@/lib/vehicles";
import { daysUntilLabel, formatAppointment } from "@/lib/format";
import { MAINTENANCE_DETAIL_INTERVAL_WEEKS, REWARD_VISITS_REQUIRED } from "@/lib/constants";
import { customerHeadline, formatDuration } from "@/lib/progress";

export const Route = createFileRoute("/account/")({
  head: () => ({
    meta: [{ title: "Your account | True To Detail" }, { name: "robots", content: "noindex" }],
  }),
  component: AccountDashboard,
});

/** How soon after account creation a sign-in still counts as "the first one" — Supabase sets last_sign_in_at to the same moment as created_at on that very first session. */
const FIRST_SIGN_IN_WINDOW_MS = 2 * 60 * 1000;

const plateKey = (reg: string) => reg.replace(/\s+/g, "").toUpperCase();

function AccountDashboard() {
  const { session, loading: authLoading } = useRequireCustomerSession();
  const [selectedVisit, setSelectedVisit] = useState<number | null>(null);
  const [showEarlier, setShowEarlier] = useState(false);

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

  const {
    data: bookings,
    isLoading: bookingsLoading,
    isError: bookingsFailed,
    refetch: refetchBookings,
  } = useQuery({
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

  const { liveBooking, nextBooking, otherUpcoming, previous, completedVisits, recommendedDate } =
    useMemo(() => {
      const all = bookings ?? [];
      const live = all.find((b) => LIVE_JOB_STATUSES.includes(b.status)) ?? null;
      const upcoming = all
        .filter(
          (b) => b.status === "requested" || b.status === "confirmed" || b.status === "assigned",
        )
        .sort(
          (a, b) => new Date(a.scheduled_start).getTime() - new Date(b.scheduled_start).getTime(),
        );
      const done = all
        .filter((b) => b.status === "completed")
        .sort(
          (a, b) => new Date(b.scheduled_start).getTime() - new Date(a.scheduled_start).getTime(),
        );
      const lastCompleted = done[0];
      const recommended = lastCompleted
        ? addWeeks(new Date(lastCompleted.scheduled_start), MAINTENANCE_DETAIL_INTERVAL_WEEKS)
        : null;
      const next = live ?? upcoming[0] ?? null;
      return {
        liveBooking: live,
        nextBooking: next,
        // Every other future booking. Only one gets the big treatment, so without
        // this list a second upcoming detail would be invisible on the dashboard.
        otherUpcoming: upcoming.filter((b) => b.id !== next?.id),
        previous: done,
        // Oldest first, so visit 1 is the first visit.
        completedVisits: [...done].reverse().map((b) => ({
          id: b.id,
          scheduled_start: b.scheduled_start,
          package_name: b.package_name,
        })),
        // No "you're due" nudge when a detail is already booked.
        recommendedDate: live || upcoming.length > 0 ? null : recommended,
      };
    }, [bookings]);

  // Which counted visit each completed booking is (1 is the oldest).
  const visitNumber = useMemo(
    () =>
      new Map(
        [...previous]
          .reverse()
          .map((b, i) => [b.id, i + 1 <= REWARD_VISITS_REQUIRED ? i + 1 : 0] as const),
      ),
    [previous],
  );
  const selectedBookingId = selectedVisit ? completedVisits[selectedVisit - 1]?.id : undefined;

  // Completed visits per car, from the same bookings, so the garage and history agree.
  const visitsByCar = useMemo(() => {
    const m = new Map<string, number>();
    for (const b of previous) {
      const k = plateKey(b.vehicle_registration);
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  }, [previous]);

  if (authLoading || !session) {
    return (
      <div className="min-h-screen bg-background">
        <BrandedLoading label="Checking session" />
      </div>
    );
  }

  const railItems = [
    ...otherUpcoming,
    ...previous.slice(0, showEarlier ? undefined : REWARD_VISITS_REQUIRED),
  ];
  const hiddenEarlier = previous.length - REWARD_VISITS_REQUIRED;
  const dataFailed = bookingsFailed && !bookings;

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
      stage={
        // Only once the real bookings are known: a count of zero while loading would be remembered as "nothing earned".
        bookings ? (
          <VisitHero
            visits={completedVisits}
            required={REWARD_VISITS_REQUIRED}
            storageKey={session.user.id}
            selected={selectedVisit}
            onSelect={setSelectedVisit}
          />
        ) : undefined
      }
    >
      <div className="grid gap-12 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-10">
          {bookingsLoading ? (
            <DashboardSkeleton />
          ) : dataFailed ? (
            // Never say "nothing booked" when the truth is that bookings did not load.
            <ErrorState
              title="Couldn't load your bookings"
              description="Your visits and rewards will show here as soon as they load."
              onRetry={() => void refetchBookings()}
            />
          ) : nextBooking ? (
            <NowBand booking={nextBooking} live={Boolean(liveBooking)} />
          ) : (
            <BookNext lastVisit={previous[0] ?? null} />
          )}

          <div className="grid grid-cols-2 gap-2">
            <Link
              to="/book"
              className="press col-span-2 inline-flex min-h-12 items-center justify-between bg-signal px-5 text-[12px] font-bold uppercase tracking-[0.12em] text-signal-foreground hover:bg-signal-deep sm:col-span-1"
            >
              Book a detail
              <CalendarPlus className="h-4 w-4" strokeWidth={2.4} />
            </Link>
            <Link
              to="/account/addresses"
              className="press col-span-2 inline-flex min-h-12 items-center justify-between border border-hairline bg-surface px-5 text-[12px] font-bold uppercase tracking-[0.12em] hover:bg-surface-2 sm:col-span-1"
            >
              Your addresses
              <MapPin className="h-4 w-4 text-signal-deep" strokeWidth={2.4} />
            </Link>
          </div>

          {dataFailed ? null : (
            <section aria-label="Your visits">
              <h2 className="font-display text-[28px] leading-none">YOUR VISITS</h2>
              {railItems.length > 0 ? (
                <VisitRail
                  bookings={railItems}
                  upcomingCount={otherUpcoming.length}
                  visitNumber={visitNumber}
                  selectedId={selectedBookingId}
                />
              ) : (
                <p className="mt-4 border-l-2 border-hairline pl-5 text-[14px] text-muted-foreground">
                  Your finished details will collect here, with the date, car and what we did.
                </p>
              )}
              {hiddenEarlier > 0 && !showEarlier ? (
                <button
                  type="button"
                  onClick={() => setShowEarlier(true)}
                  className="press mt-2 inline-flex min-h-11 items-center gap-2 pl-7 text-[12px] font-bold uppercase tracking-[0.12em] text-signal-deep"
                >
                  Show {hiddenEarlier} earlier {hiddenEarlier === 1 ? "visit" : "visits"}
                </button>
              ) : null}
            </section>
          )}
        </div>

        <aside className="flex min-w-0 flex-col gap-10">
          <section aria-label="Your garage">
            <h2 className="font-display text-[28px] leading-none">YOUR GARAGE</h2>
            {vehicles && vehicles.length > 0 ? (
              <ul className="mt-4 divide-y divide-hairline border-y border-hairline">
                {vehicles.map((v) => {
                  const n = visitsByCar.get(plateKey(v.registration)) ?? 0;
                  return (
                    <li key={v.id} className="flex items-center justify-between gap-3 py-3.5">
                      <div className="min-w-0">
                        <p className="truncate text-[15px] font-semibold">
                          {vehicleDescription(v) || "Saved car"}
                        </p>
                        <p className="mt-0.5 text-[12px] text-muted-foreground">
                          {n === 0
                            ? "No details yet"
                            : `${n} ${n === 1 ? "detail" : "details"} with us`}
                        </p>
                      </div>
                      <PlateTag registration={v.registration} />
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="mt-4 text-[14px] text-muted-foreground">
                Cars you book are saved here, so rebooking takes two taps.
              </p>
            )}
            <Link
              to="/account/vehicles"
              className="press mt-2 inline-flex min-h-11 items-center gap-2 text-[12px] font-bold uppercase tracking-[0.12em] text-signal-deep"
            >
              Manage garage <ChevronRight className="h-4 w-4" strokeWidth={2.6} />
            </Link>
          </section>

          {recommendedDate ? (
            <section aria-label="Recommended" className="border-l-4 border-signal pl-5">
              <h2 className="font-display text-[28px] leading-[0.95]">
                MAINTENANCE DETAIL DUE AROUND{" "}
                {format(recommendedDate, "d MMMM", { in: UK_TIME }).toUpperCase()}
              </h2>
              <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
                {isFuture(recommendedDate)
                  ? "Keeps your finish looking its best between full details."
                  : "You are due. Book whenever suits."}
              </p>
              <Link
                to="/book"
                className="press mt-2 inline-flex min-h-11 items-center gap-2 text-[12px] font-bold uppercase tracking-[0.12em] text-signal-deep"
              >
                Book now <ArrowRight className="h-4 w-4" strokeWidth={2.6} />
              </Link>
            </section>
          ) : null}
        </aside>
      </div>
    </AppShell>
  );
}

/** Big day and month, the way the booking sits on a calendar. */
function DateBlock({ iso }: { iso: string }) {
  const d = new Date(iso);
  return (
    <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-xl bg-surface-2">
      <span className="font-display text-[26px] leading-[0.85]">
        {format(d, "d", { in: UK_TIME })}
      </span>
      <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
        {format(d, "MMM", { in: UK_TIME })}
      </span>
    </div>
  );
}

/**
 * Upcoming bookings and completed visits on one rail, so history and rewards
 * are visibly the same thing: each completed visit carries the number it counts
 * as, and choosing a visit in the hero lights its row here.
 */
function VisitRail({
  bookings,
  upcomingCount,
  visitNumber,
  selectedId,
}: {
  bookings: BookingWithDetailer[];
  upcomingCount: number;
  visitNumber: Map<string, number>;
  selectedId: string | undefined;
}) {
  return (
    <ol className="relative ml-[6px] mt-4 border-l border-hairline">
      {bookings.map((b, i) => {
        const upcoming = i < upcomingCount;
        const { dayLabel, timeLabel } = formatAppointment(b.scheduled_start);
        const n = upcoming ? 0 : (visitNumber.get(b.id) ?? 0);
        const selected = selectedId === b.id;
        return (
          <li key={b.id} className="rise-in relative" style={{ animationDelay: `${i * 45}ms` }}>
            <span
              aria-hidden
              className={cn(
                "state-transition absolute -left-[7px] top-[26px] h-[13px] w-[13px] rounded-full border-2",
                upcoming
                  ? "border-signal bg-background"
                  : selected
                    ? "border-signal bg-signal"
                    : "border-foreground bg-foreground",
              )}
            />
            <Link
              to="/account/bookings/$id"
              params={{ id: b.id }}
              aria-current={selected ? "true" : undefined}
              className={cn(
                "press state-transition flex items-center gap-3.5 py-3.5 pl-6 pr-2 hover:bg-surface-2",
                selected && "bg-signal/8",
              )}
            >
              <DateBlock iso={b.scheduled_start} />
              <div className="min-w-0 flex-1">
                <p className="font-display text-[22px] leading-[1.02] sm:truncate">
                  {b.package_name}
                </p>
                <p className="mt-1 text-[12px] text-muted-foreground">
                  {upcoming
                    ? `${dayLabel}, ${timeLabel}`
                    : format(new Date(b.scheduled_start), "EEEE", { in: UK_TIME })}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <PlateTag registration={b.vehicle_registration} className="text-[13px]" />
                  {n > 0 ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-[0.1em] text-signal-deep">
                      <Check className="h-3 w-3" strokeWidth={3.2} />
                      Visit {n}
                    </span>
                  ) : null}
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
    </ol>
  );
}

/**
 * What is happening with the car right now, or next. Not a box: large type on
 * the sheet with the brand's orange bar, so the hero above and the rail below
 * read as one page.
 */
function NowBand({ booking, live }: { booking: BookingWithDetailer; live: boolean }) {
  const { timeLabel } = formatAppointment(booking.scheduled_start);
  const d = new Date(booking.scheduled_start);
  const first = booking.detailer?.name?.split(" ")[0];
  const line =
    booking.status === "requested"
      ? "We are checking your slot and will confirm by email."
      : booking.status === "assigned"
        ? "Your detailer is set. You will be told when they set off."
        : "You are booked in. There is nothing you need to do.";

  return (
    <Link
      to="/account/bookings/$id"
      params={{ id: booking.id }}
      className="press group relative block border-l-4 border-signal pl-5 sm:pl-7"
    >
      <div className="flex items-center justify-between gap-3">
        <p className="eyebrow flex items-center gap-2 text-muted-foreground">
          {live ? (
            <span className="relative grid h-2 w-2 place-items-center">
              <span className="pulse-ring absolute h-2 w-2 rounded-full bg-signal" />
              <span className="h-2 w-2 rounded-full bg-signal" />
            </span>
          ) : null}
          {live ? "Happening now" : "Next visit"}
        </p>
        {!live ? (
          <span className="bg-ink px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-signal">
            {daysUntilLabel(booking.scheduled_start)}
          </span>
        ) : (
          <StatusBadge status={booking.status} size="sm" />
        )}
      </div>

      {live ? (
        <>
          <p className="mt-3 font-display text-[44px] leading-[0.9] sm:text-[60px]">
            {customerHeadline(booking.status, first).toUpperCase()}
          </p>
          {booking.status === "en_route" && booking.eta_seconds != null ? (
            <p className="mt-2 text-[17px] font-semibold text-signal-deep">
              About {formatDuration(booking.eta_seconds)} away
            </p>
          ) : null}
          <StepTracker status={booking.status} className="mt-5 max-w-xl" />
        </>
      ) : (
        <p className="mt-3 font-display text-[64px] leading-[0.82] sm:text-[92px]">
          {format(d, "EEE d", { in: UK_TIME }).toUpperCase()}
          <span className="ml-3 text-foreground/35">
            {format(d, "MMM", { in: UK_TIME }).toUpperCase()}
          </span>
        </p>
      )}

      <p className="mt-4 font-display text-[28px] leading-none sm:text-[32px]">
        {booking.package_name}
        {!live ? <span className="text-foreground/45"> · {timeLabel}</span> : null}
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-3">
        <PlateTag registration={booking.vehicle_registration} />
        <span className="flex min-w-0 items-center gap-1.5 text-[13px] text-muted-foreground">
          <MapPin className="h-4 w-4 shrink-0" strokeWidth={2.1} />
          <span className="truncate">{booking.service_postcode}</span>
        </span>
        {booking.detailer ? (
          <span className="flex items-center gap-2 text-[13px]">
            <Avatar
              name={booking.detailer.name}
              photoUrl={booking.detailer.photo_url}
              size="sm"
              className="bg-signal text-signal-foreground"
            />
            {first}
          </span>
        ) : null}
        <span className="ml-auto inline-flex min-h-11 items-center gap-2 bg-signal px-5 text-[12px] font-bold uppercase tracking-[0.12em] text-signal-foreground group-hover:bg-signal-deep">
          {live ? (booking.status === "en_route" ? "Watch live" : "View job") : "View booking"}
          <ArrowRight className="h-4 w-4" strokeWidth={2.6} />
        </span>
      </div>
      {!live ? <p className="mt-4 text-[13px] text-muted-foreground">{line}</p> : null}
    </Link>
  );
}

function BookNext({ lastVisit }: { lastVisit: BookingWithDetailer | null }) {
  return (
    <div className="border-l-4 border-signal pl-5 sm:pl-7">
      <p className="eyebrow text-muted-foreground">Nothing booked</p>
      <p className="mt-3 font-display text-[44px] leading-[0.9] sm:text-[64px]">
        READY FOR YOUR NEXT DETAIL?
      </p>
      <p className="mt-3 max-w-md text-[15px] leading-relaxed text-muted-foreground">
        {lastVisit
          ? `Your last detail was on ${format(new Date(lastVisit.scheduled_start), "d MMMM", { in: UK_TIME })}. Pick a day and we come to you.`
          : "Pick a day and we come to you, with our own water and power."}
      </p>
      <Link
        to="/book"
        className="press mt-5 inline-flex min-h-12 items-center gap-2 bg-signal px-6 text-[12px] font-bold uppercase tracking-[0.12em] text-signal-foreground hover:bg-signal-deep"
      >
        Book a detail <ArrowRight className="h-4 w-4" strokeWidth={2.6} />
      </Link>
    </div>
  );
}
