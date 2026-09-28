import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { isToday } from "date-fns";
import {
  CalendarClock,
  CheckCheck,
  LogOut,
  Plus,
  Radio,
  Search,
  UserRound,
  Users,
  Wrench,
  X,
} from "lucide-react";
import { TtdHeader } from "@/components/ttd/Header";
import { AdminBookingCard } from "@/components/ttd/AdminBookingCard";
import { ScheduleTimeline } from "@/components/ttd/ScheduleTimeline";
import { EmptyState } from "@/components/ttd/EmptyState";
import { ErrorState } from "@/components/ttd/ErrorState";
import { BrandedLoading } from "@/components/ttd/BrandedLoading";
import { useRequireStaffSession } from "@/hooks/use-session";
import { listBookings, type BookingStatus, type BookingWithDetailer } from "@/lib/bookings";
import { signOut } from "@/lib/auth";

const STATUS_FILTER_OPTIONS: { value: BookingStatus | "all"; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "confirmed", label: "Confirmed" },
  { value: "assigned", label: "Assigned" },
  { value: "en_route", label: "En route" },
  { value: "arrived", label: "Arrived" },
  { value: "check_in", label: "Checking in" },
  { value: "in_progress", label: "In progress" },
  { value: "qc", label: "Final QC" },
  { value: "handover", label: "Handover" },
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
      <main className="min-h-screen bg-background">
        <BrandedLoading label="Checking session" />
      </main>
    );
  }

  const active = filtered.filter((b) =>
    ["en_route", "arrived", "check_in", "in_progress", "qc", "handover"].includes(b.status),
  );
  const unassigned = filtered.filter((b) => b.status === "confirmed");
  const done = filtered.filter((b) => b.status === "completed" || b.status === "cancelled");
  const completedToday = all.filter(
    (b) => b.status === "completed" && b.completed_at && isToday(new Date(b.completed_at)),
  ).length;
  const isFiltering = query.trim().length > 0 || statusFilter !== "all";

  const todaysAssigned = all.filter(
    (b) =>
      isToday(new Date(b.scheduled_start)) && b.assigned_detailer_id && b.status !== "cancelled",
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
    <main className="min-h-screen bg-background">
      <TtdHeader
        homeTo="/admin"
        eyebrow="Staff console"
        right={
          <div className="flex items-center gap-1.5 sm:gap-2">
            <Link
              to="/admin/customers"
              aria-label="Customers"
              className="press inline-flex min-h-9 items-center gap-1.5 rounded-full border border-hairline bg-surface-2 px-2.5 text-[12px] font-medium text-muted-foreground hover:text-foreground sm:px-3"
            >
              <Users className="h-3.5 w-3.5" strokeWidth={2.2} />
              <span className="hidden sm:inline">Customers</span>
            </Link>
            <Link
              to="/admin/detailers"
              aria-label="Detailers"
              className="press inline-flex min-h-9 items-center gap-1.5 rounded-full border border-hairline bg-surface-2 px-2.5 text-[12px] font-medium text-muted-foreground hover:text-foreground sm:px-3"
            >
              <UserRound className="h-3.5 w-3.5" strokeWidth={2.2} />
              <span className="hidden sm:inline">Detailers</span>
            </Link>
            <button
              type="button"
              onClick={() => signOut()}
              aria-label="Sign out"
              className="press inline-flex min-h-9 items-center gap-1.5 rounded-full border border-hairline bg-surface-2 px-2.5 text-[12px] font-medium text-muted-foreground hover:text-foreground sm:px-3"
            >
              <LogOut className="h-3.5 w-3.5" strokeWidth={2.2} />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        }
      />

      <div className="mx-auto w-full max-w-2xl px-5 py-6 sm:px-6">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-4">
          <div className="min-w-0">
            <h1 className="font-display text-[30px] leading-none">True To Detail</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">Mobile job system</p>
          </div>
          <Link
            to="/admin/bookings/new"
            className="press inline-flex min-h-11 shrink-0 items-center gap-2 bg-signal px-4 font-sans text-[12px] font-bold uppercase tracking-[0.1em] text-signal-foreground hover:bg-signal-deep"
          >
            <Plus className="h-4 w-4" strokeWidth={2.8} />
            New<span className="hidden sm:inline"> booking</span>
          </Link>
        </div>

        <div className="mt-5 grid grid-cols-3 divide-x divide-hairline overflow-hidden rounded-xl border border-hairline bg-surface">
          <Stat icon={Radio} label="Active" value={active.length} highlight />
          <Stat icon={CalendarClock} label="Unassigned" value={unassigned.length} />
          <Stat icon={CheckCheck} label="Completed today" value={completedToday} />
        </div>

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
        ) : null}

        <div className="mt-8 flex gap-2">
          <div className="relative min-w-0 flex-1">
            <Search
              className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              strokeWidth={2.2}
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by reference, plate, postcode or detailer"
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
            className="min-h-11 shrink-0 rounded-xl border border-hairline bg-surface-2 pl-3 pr-8 text-[13px] font-medium outline-none transition-colors focus:border-signal focus:bg-surface focus:ring-2 focus:ring-signal/30"
          >
            {STATUS_FILTER_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {isLoading ? (
          <BrandedLoading label="Loading bookings" className="mt-10" />
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
          <>
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
              <Section title="Unassigned">
                {unassigned.length ? (
                  <BookingList bookings={unassigned} />
                ) : (
                  <EmptyState icon={CalendarClock} title="Nothing unassigned" />
                )}
              </Section>
            ) : null}
            {done.length || !isFiltering ? (
              <Section title="History">
                {done.length ? (
                  <BookingList bookings={done} />
                ) : (
                  <EmptyState icon={CheckCheck} title="Nothing completed or cancelled yet" />
                )}
              </Section>
            ) : null}
          </>
        )}
      </div>
    </main>
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
  return (
    <div className="min-w-0 px-3.5 py-3">
      <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
        <Icon
          className={`h-3.5 w-3.5 shrink-0 ${highlight ? "text-signal-deep" : ""}`}
          strokeWidth={2.2}
        />
        <span className="min-w-0 text-[10px] font-semibold uppercase leading-tight tracking-[0.04em]">
          {label}
        </span>
      </span>
      <p className="mt-1 font-display text-2xl leading-none">{value}</p>
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
