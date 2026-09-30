import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { format, isToday } from "date-fns";
import { UK_TIME } from "@/lib/uk-time";
import {
  BellRing,
  CalendarClock,
  Check,
  CheckCheck,
  Plus,
  Radio,
  Search,
  Wrench,
  X,
  Loader2,
} from "lucide-react";
import { AppShell } from "@/components/ttd/AppShell";
import { AdminBookingCard } from "@/components/ttd/AdminBookingCard";
import { ScheduleTimeline } from "@/components/ttd/ScheduleTimeline";
import { EmptyState } from "@/components/ttd/EmptyState";
import { ErrorState } from "@/components/ttd/ErrorState";
import { BrandedLoading } from "@/components/ttd/BrandedLoading";
import { ListSkeleton } from "@/components/ttd/Skeleton";
import { useCountUp } from "@/hooks/use-motion";
import { toast } from "sonner";
import { StatusBadge } from "@/components/ttd/StatusBadge";
import { PlateTag } from "@/components/ttd/VehicleTag";
import { useRequireStaffSession } from "@/hooks/use-session";
import {
  cancelBooking,
  confirmRequest,
  listBookings,
  type BookingStatus,
  type BookingWithDetailer,
} from "@/lib/bookings";
import { sendBookingEmail } from "@/lib/portal-email";
import { formatAppointment } from "@/lib/format";

const STATUS_FILTER_OPTIONS: { value: BookingStatus | "all"; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "requested", label: "Needs confirming" },
  { value: "confirmed", label: "Confirmed" },
  { value: "assigned", label: "Assigned" },
  { value: "en_route", label: "En route" },
  { value: "arrived", label: "Arrived" },
  { value: "in_progress", label: "Detailing" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

export const Route = createFileRoute("/admin/")({
  head: () => ({
    meta: [{ title: "Dashboard | True To Detail" }, { name: "robots", content: "noindex" }],
  }),
  component: AdminDashboard,
});

function AdminDashboard() {
  const { session, loading: authLoading, isStaff } = useRequireStaffSession();
  const [query, setQuery] = useState("");
  // "/" jumps to the search box, the way it does in most work tools.
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const [statusFilter, setStatusFilter] = useState<BookingStatus | "all">("all");

  const {
    data: bookings,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["admin-bookings"],
    queryFn: listBookings,
    enabled: Boolean(session) && isStaff === true,
    refetchInterval: 15_000,
  });

  const all = bookings ?? [];

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const byStatus = statusFilter === "all" ? all : all.filter((b) => b.status === statusFilter);
    if (!q) return byStatus;
    return byStatus.filter((b) =>
      [b.booking_reference, b.vehicle_registration, b.service_postcode, b.detailer?.name]
        .filter((v): v is string => Boolean(v))
        .some((v) => v.toLowerCase().includes(q)),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookings, query, statusFilter]);

  if (authLoading || !session || isStaff === null) {
    return (
      <div className="min-h-screen bg-background">
        <BrandedLoading label="Checking session" />
      </div>
    );
  }

  const active = filtered.filter((b) =>
    ["en_route", "arrived", "check_in", "in_progress", "qc", "handover"].includes(b.status),
  );
  const requests = filtered
    .filter((b) => b.status === "requested")
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  const unassigned = filtered.filter((b) => b.status === "confirmed");
  // Assigned but not started yet. Without its own section, a job assigned
  // for any day other than today appeared nowhere on this page.
  const assigned = filtered
    .filter((b) => b.status === "assigned")
    .sort((a, b) => new Date(a.scheduled_start).getTime() - new Date(b.scheduled_start).getTime());
  const done = filtered.filter((b) => b.status === "completed" || b.status === "cancelled");
  const completedToday = all.filter(
    (b) =>
      b.status === "completed" &&
      b.completed_at &&
      isToday(new Date(b.completed_at), { in: UK_TIME }),
  ).length;
  const isFiltering = query.trim().length > 0 || statusFilter !== "all";

  const todaysAssigned = all.filter(
    (b) =>
      isToday(new Date(b.scheduled_start), { in: UK_TIME }) &&
      b.assigned_detailer_id &&
      b.status !== "cancelled",
  );
  const byDetailer = new Map<string, BookingWithDetailer[]>();
  for (const b of todaysAssigned) {
    const key = b.assigned_detailer_id!;
    if (!byDetailer.has(key)) byDetailer.set(key, []);
    byDetailer.get(key)!.push(b);
  }
  for (const list of byDetailer.values()) {
    list.sort(
      (a, b) => new Date(a.scheduled_start).getTime() - new Date(b.scheduled_start).getTime(),
    );
  }

  return (
    <AppShell
      area="admin"
      eyebrow={format(new Date(), "EEEE, d MMMM", { in: UK_TIME })}
      title={
        <>
          TODAY<span className="text-signal">.</span>
        </>
      }
      subtitle="Every request, booking and job in one place."
    >
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          icon={BellRing}
          label="Needs confirming"
          value={all.filter((b) => b.status === "requested").length}
          highlight
        />
        <Stat
          icon={CalendarClock}
          label="Unassigned"
          value={all.filter((b) => b.status === "confirmed").length}
        />
        <Stat
          icon={Radio}
          label="Active now"
          value={
            all.filter((b) =>
              ["en_route", "arrived", "check_in", "in_progress", "qc", "handover"].includes(
                b.status,
              ),
            ).length
          }
        />
        <Stat icon={CheckCheck} label="Completed today" value={completedToday} />
      </div>

      <div className="mt-8 flex gap-2">
        <div className="relative min-w-0 flex-1">
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            strokeWidth={2.2}
          />
          <input
            ref={searchRef}
            type="search"
            aria-keyshortcuts="/"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search bookings"
            aria-label="Search by reference, reg, postcode or detailer"
            className="min-h-11 w-full rounded-xl border border-hairline bg-surface-2 pl-10 pr-9 text-base outline-none transition-colors focus:border-signal focus:bg-surface focus:ring-2 focus:ring-signal/30"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="press absolute right-2.5 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-full text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" strokeWidth={2.2} />
            </button>
          ) : null}
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as BookingStatus | "all")}
          aria-label="Filter by status"
          className="select-field min-h-11 shrink-0 rounded-xl border border-hairline bg-surface-2 pl-3 text-[13px] font-medium outline-none transition-colors focus:border-signal focus:bg-surface focus:ring-2 focus:ring-signal/30"
        >
          {STATUS_FILTER_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <div className="mt-8">
          <ListSkeleton rows={3} />
        </div>
      ) : isError ? (
        <ErrorState
          className="mt-8"
          title="Couldn't load bookings"
          description={error instanceof Error ? error.message : undefined}
          onRetry={() => refetch()}
        />
      ) : isFiltering && filtered.length === 0 ? (
        <EmptyState
          className="mt-8"
          icon={Search}
          title="No matches"
          description="Try a different search or filter."
        />
      ) : (
        <div className="grid gap-x-8 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <div className="min-w-0">
            {requests.length > 0 ? (
              <Section title="Needs confirming">
                <div className="flex flex-col gap-3">
                  {requests.map((b) => (
                    <RequestCard key={b.id} booking={b} />
                  ))}
                </div>
              </Section>
            ) : null}
            {active.length || !isFiltering ? (
              <Section title="Active jobs">
                {active.length ? (
                  <BookingList bookings={active} />
                ) : (
                  <EmptyState icon={Wrench} title="No active jobs" />
                )}
              </Section>
            ) : null}
            {unassigned.length || !isFiltering ? (
              <Section title="Confirmed, needs a detailer">
                {unassigned.length ? (
                  <BookingList bookings={unassigned} />
                ) : (
                  <EmptyState icon={CalendarClock} title="Nothing waiting for a detailer" />
                )}
              </Section>
            ) : null}
            {assigned.length ? (
              <Section title="Assigned, not started">
                <BookingList bookings={assigned} />
              </Section>
            ) : null}
          </div>

          <div className="min-w-0">
            {byDetailer.size > 0 ? (
              <Section title="Today's schedule">
                <div className="flex flex-col gap-6">
                  {Array.from(byDetailer.entries()).map(([detailerId, list]) => (
                    <div key={detailerId}>
                      <p className="mb-2 text-[13px] font-semibold text-muted-foreground">
                        {list[0]?.detailer?.name ?? "Detailer"}
                      </p>
                      <ScheduleTimeline bookings={list} />
                    </div>
                  ))}
                </div>
              </Section>
            ) : (
              <Section title="Today's schedule">
                <EmptyState icon={CalendarClock} title="Nothing scheduled for today" />
              </Section>
            )}
            {done.length || !isFiltering ? (
              <Section title="History">
                {done.length ? (
                  <BookingList bookings={done.slice(0, 20)} />
                ) : (
                  <EmptyState icon={CheckCheck} title="Nothing completed or cancelled yet" />
                )}
              </Section>
            ) : null}
          </div>
        </div>
      )}
    </AppShell>
  );
}

/** A website request waiting for staff: confirm it (and the customer is emailed) or decline it. */
function RequestCard({ booking }: { booking: BookingWithDetailer }) {
  const queryClient = useQueryClient();
  const [note, setNote] = useState<string | null>(null);
  const { dayLabel, timeLabel } = formatAppointment(booking.scheduled_start);

  const confirm = useMutation({
    mutationFn: async () => {
      await confirmRequest(booking.id, booking.service_postcode);
      return sendBookingEmail(booking.id, "booked_in");
    },
    onSuccess: (res) => {
      setNote(
        res.sent
          ? "Confirmed. The customer has been emailed."
          : `Confirmed. Email not sent: ${res.reason ?? "unknown"}`,
      );
      // The card leaves the list once it refetches, so say it in a toast that outlives it.
      if (res.sent) toast.success(`${booking.booking_reference} confirmed. Customer emailed.`);
      else toast.warning(`${booking.booking_reference} confirmed. Email not sent.`);
      void queryClient.invalidateQueries({ queryKey: ["admin-bookings"] });
    },
    onError: (e) => setNote(e instanceof Error ? e.message : "Couldn't confirm this request."),
  });

  const decline = useMutation({
    mutationFn: async () => {
      await cancelBooking(booking.id, "Other");
      return sendBookingEmail(booking.id, "cancelled");
    },
    onSuccess: () => {
      toast(`${booking.booking_reference} declined. Customer emailed.`);
      void queryClient.invalidateQueries({ queryKey: ["admin-bookings"] });
    },
    onError: (e) => setNote(e instanceof Error ? e.message : "Couldn't decline this request."),
  });

  return (
    <article className="border border-warning/40 bg-warning/8 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="mono-ref text-muted-foreground">{booking.booking_reference}</p>
          <p className="mt-1 font-display text-[26px] leading-none">{booking.package_name}</p>
        </div>
        <StatusBadge status={booking.status} size="sm" />
      </div>
      <p className="mt-2 text-[14px] font-semibold">
        {dayLabel}, {timeLabel} · {booking.service_postcode}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-3 text-[13px] text-muted-foreground">
        <PlateTag registration={booking.vehicle_registration} />
        <span>£{booking.price}</span>
      </div>
      {booking.customer_notes ? (
        <p className="mt-2 text-[13px] text-muted-foreground">Note: {booking.customer_notes}</p>
      ) : null}
      {note ? (
        <p role="status" className="slide-down mt-2 text-[13px] font-medium">
          {note}
        </p>
      ) : null}
      <div className="mt-3 grid grid-cols-[1fr_1fr_auto] gap-2">
        <button
          type="button"
          onClick={() => confirm.mutate()}
          disabled={confirm.isPending || confirm.isSuccess || decline.isPending}
          aria-busy={confirm.isPending}
          className="press state-transition inline-flex min-h-11 items-center justify-center gap-1.5 bg-signal px-3 font-sans text-[12px] font-bold uppercase tracking-[0.1em] text-signal-foreground hover:bg-signal-deep disabled:opacity-50"
        >
          {confirm.isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Confirming
            </>
          ) : confirm.isSuccess ? (
            <>
              <Check className="pop-in h-4 w-4" strokeWidth={2.8} /> Confirmed
            </>
          ) : (
            <>
              <Check className="h-4 w-4" strokeWidth={2.8} /> Confirm
            </>
          )}
        </button>
        <Link
          to="/admin/bookings/$id"
          params={{ id: booking.id }}
          className="press inline-flex min-h-11 items-center justify-center border border-hairline bg-surface px-3 font-sans text-[12px] font-bold uppercase tracking-[0.1em] hover:bg-surface-2"
        >
          Open
        </Link>
        <button
          type="button"
          onClick={() => {
            if (window.confirm("Decline this request? The customer will be emailed."))
              decline.mutate();
          }}
          disabled={confirm.isPending || decline.isPending}
          aria-label="Decline request"
          className="press inline-flex min-h-11 items-center justify-center border border-destructive/25 px-3 text-destructive hover:bg-destructive/8 disabled:opacity-50"
        >
          <X className="h-4 w-4" strokeWidth={2.6} />
        </button>
      </div>
    </article>
  );
}

function BookingList({ bookings }: { bookings: BookingWithDetailer[] }) {
  return (
    <div className="flex flex-col gap-3">
      {bookings.map((b) => (
        <AdminBookingCard key={b.id} booking={b} />
      ))}
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  highlight,
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  value: number;
  highlight?: boolean;
}) {
  const shown = useCountUp(value, { durationMs: 550 });
  return (
    <div
      className={`min-w-0 rounded-xl border p-4 ${highlight && value > 0 ? "border-warning/40 bg-warning/8" : "border-hairline bg-surface"}`}
    >
      <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
        <Icon
          className={`h-4 w-4 shrink-0 ${highlight ? "text-signal-deep" : ""}`}
          strokeWidth={2.2}
        />
        <span className="min-w-0 text-[11px] font-semibold uppercase leading-tight tracking-[0.08em]">
          {label}
        </span>
      </span>
      <p className="mt-2 font-display text-[44px] leading-none tabular-nums">{shown}</p>
    </div>
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
