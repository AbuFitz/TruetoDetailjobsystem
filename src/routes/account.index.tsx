import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { addWeeks, format, isFuture } from "date-fns";
import { cn } from "@/lib/utils";
import { UK_TIME } from "@/lib/uk-time";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, ChevronRight } from "lucide-react";
import { AppShell } from "@/components/ttd/AppShell";
import { StatusBadge } from "@/components/ttd/StatusBadge";
import { BrandedLoading } from "@/components/ttd/BrandedLoading";
import { ErrorState } from "@/components/ttd/ErrorState";
import { RewardsCard } from "@/components/ttd/RewardsCard";
import { DashboardSkeleton } from "@/components/ttd/Skeleton";
import { useRequireCustomerSession } from "@/hooks/use-session";
import { getMyProfile } from "@/lib/customers";
import { listMyBookings, LIVE_JOB_STATUSES, type BookingWithDetailer } from "@/lib/bookings";
import { listMyVehicles } from "@/lib/vehicles";
import { formatAppointment, whenParts } from "@/lib/format";
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

function AccountDashboard() {
  const { session, loading: authLoading } = useRequireCustomerSession();
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

  if (authLoading || !session) {
    return (
      <div className="min-h-screen bg-background">
        <BrandedLoading label="Checking session" />
      </div>
    );
  }

  const multiCar = (vehicles?.length ?? 0) > 1;
  const railItems = [
    ...otherUpcoming,
    ...previous.slice(0, showEarlier ? undefined : EARLIER_SHOWN),
  ];
  const hiddenEarlier = previous.length - EARLIER_SHOWN;
  const dataFailed = bookingsFailed && !bookings;

  return (
    <AppShell
      area="customer"
      width="medium"
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
      <div className="flex flex-col gap-8">
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
          <BookNext lastVisit={previous[0] ?? null} due={recommendedDate} />
        )}

        {/* Only once the real bookings are known: a count of zero while loading would be remembered as "nothing earned". */}
        {bookings && !dataFailed ? (
          <RewardsCard
            visits={completedVisits}
            required={REWARD_VISITS_REQUIRED}
            storageKey={session.user.id}
          />
        ) : null}

        {dataFailed ? null : (
          <section aria-label="Your visits">
            <h2 className="font-display text-[26px] leading-none">YOUR VISITS</h2>
            {railItems.length > 0 ? (
              <VisitList
                bookings={railItems}
                upcomingCount={otherUpcoming.length}
                visitNumber={visitNumber}
                showPlate={multiCar}
              />
            ) : (
              <p className="mt-3 text-[14px] text-muted-foreground">
                Your finished details will collect here.
              </p>
            )}
            {hiddenEarlier > 0 && !showEarlier ? (
              <button
                type="button"
                onClick={() => setShowEarlier(true)}
                className="press mt-1 inline-flex min-h-11 items-center gap-2 text-[12px] font-bold uppercase tracking-[0.12em] text-signal-deep"
              >
                Show {hiddenEarlier} earlier {hiddenEarlier === 1 ? "visit" : "visits"}
              </button>
            ) : null}
          </section>
        )}
      </div>
    </AppShell>
  );
}

/** Past visits shown before "Show earlier". */
const EARLIER_SHOWN = 3;

/** The booking's day on one line of a list: a plain date, or TODAY. */
function DayLabel({ iso }: { iso: string }) {
  if (whenParts(iso).today) {
    return (
      <span data-today="true" className="font-display text-[20px] leading-none text-signal-deep">
        TODAY
      </span>
    );
  }
  return (
    <span className="font-display text-[20px] leading-none">
      {format(new Date(iso), "d MMM", { in: UK_TIME }).toUpperCase()}
    </span>
  );
}

/**
 * Upcoming bookings and completed visits as one plain list: the day, what it
 * was, and where it stands. The car's plate is only shown when there is more
 * than one car to tell apart.
 */
function VisitList({
  bookings,
  upcomingCount,
  visitNumber,
  showPlate,
}: {
  bookings: BookingWithDetailer[];
  upcomingCount: number;
  visitNumber: Map<string, number>;
  showPlate: boolean;
}) {
  return (
    <ul className="mt-3 divide-y divide-hairline border-y border-hairline">
      {bookings.map((b, i) => {
        const upcoming = i < upcomingCount;
        const { timeLabel } = formatAppointment(b.scheduled_start);
        const n = upcoming ? 0 : (visitNumber.get(b.id) ?? 0);
        return (
          <li key={b.id}>
            <Link
              to="/account/bookings/$id"
              params={{ id: b.id }}
              className="flex min-h-14 items-center gap-4 py-3 hover:bg-surface-2"
            >
              <span className="w-[64px] shrink-0">
                <DayLabel iso={b.scheduled_start} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold leading-snug">
                  {b.package_name}
                </span>
                <span className="block truncate text-[12px] text-muted-foreground">
                  {[
                    upcoming ? timeLabel : null,
                    showPlate ? b.vehicle_registration : null,
                    n > 0 ? `Visit ${n}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "\u00A0"}
                </span>
              </span>
              <StatusBadge status={b.status} size="sm" />
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

/**
 * What is happening with the car right now, or next: one plain card with the
 * day, what it is and where it stands. The full progress steps live on the
 * booking page, one tap away.
 */
function NowBand({ booking, live }: { booking: BookingWithDetailer; live: boolean }) {
  const { dayLabel, timeLabel } = formatAppointment(booking.scheduled_start);
  const first = booking.detailer?.name?.split(" ")[0];
  const line = live
    ? booking.status === "en_route" && booking.eta_seconds != null
      ? `About ${formatDuration(booking.eta_seconds)} away`
      : booking.package_name
    : booking.status === "requested"
      ? "We are checking your slot and will confirm it with you."
      : booking.status === "assigned"
        ? "Your detailer is set. You will be told when they set off."
        : "You are booked in. There is nothing you need to do.";

  return (
    <Link
      to="/account/bookings/$id"
      params={{ id: booking.id }}
      className={cn(
        "press group block rounded-2xl border p-5",
        live ? "border-signal bg-signal/8" : "border-hairline bg-surface hover:bg-surface-2",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="eyebrow text-muted-foreground">{live ? "Happening now" : "Next visit"}</p>
        <StatusBadge status={booking.status} size="sm" />
      </div>
      {live ? (
        <p className="mt-2 font-display text-[34px] leading-[0.95]">
          {customerHeadline(booking.status, first).toUpperCase()}
        </p>
      ) : (
        <p className="mt-2 font-display text-[34px] leading-[0.95]">
          {whenParts(booking.scheduled_start).today ? (
            <>
              <span className="sr-only">Today</span>
              <span aria-hidden data-today="true" className="text-signal-deep">
                TODAY
              </span>
            </>
          ) : (
            dayLabel.toUpperCase()
          )}
          <span className="text-foreground/40"> · {timeLabel}</span>
        </p>
      )}
      <p className="mt-2 text-[14px] font-semibold">{booking.package_name}</p>
      <p className="mt-0.5 text-[13px] text-muted-foreground">{line}</p>
      <span className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-full bg-signal px-5 text-[12px] font-bold uppercase tracking-[0.12em] text-signal-foreground group-hover:bg-signal-deep">
        {live ? (booking.status === "en_route" ? "Watch live" : "View job") : "View booking"}
        <ArrowRight className="h-4 w-4" strokeWidth={2.6} />
      </span>
    </Link>
  );
}

function BookNext({ lastVisit, due }: { lastVisit: BookingWithDetailer | null; due: Date | null }) {
  return (
    <div className="rounded-2xl border border-hairline bg-surface p-5">
      <p className="eyebrow text-muted-foreground">Nothing booked</p>
      <p className="mt-2 font-display text-[34px] leading-[0.95]">READY FOR YOUR NEXT DETAIL?</p>
      <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">
        {due
          ? isFuture(due)
            ? `A maintenance detail is due around ${format(due, "d MMMM", { in: UK_TIME })}.`
            : "You are due a maintenance detail. Book whenever suits."
          : lastVisit
            ? `Your last detail was on ${format(new Date(lastVisit.scheduled_start), "d MMMM", { in: UK_TIME })}.`
            : "Pick a day and we come to you, with our own water and power."}
      </p>
      <Link
        to="/book"
        className="press mt-4 inline-flex min-h-12 items-center gap-2 rounded-full bg-signal px-6 text-[12px] font-bold uppercase tracking-[0.12em] text-signal-foreground hover:bg-signal-deep"
      >
        Book a detail <ArrowRight className="h-4 w-4" strokeWidth={2.6} />
      </Link>
    </div>
  );
}
