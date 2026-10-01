import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarClock, ChevronRight, Clock3, Mail, MapPin, Phone, Wrench } from "lucide-react";
import { TtdLogo } from "@/components/ttd/Header";
import { StatusBadge } from "@/components/ttd/StatusBadge";
import { PlateTag } from "@/components/ttd/VehicleTag";
import { EmptyState } from "@/components/ttd/EmptyState";
import { BrandedLoading } from "@/components/ttd/BrandedLoading";
import { ListSkeleton } from "@/components/ttd/Skeleton";
import { formatAppointment, formatCountdownToAppointment } from "@/lib/format";
import { getDetailerJobHistory, getDetailerJobs, getDetailerProfile } from "@/lib/detailers";
import { supportContact, ttdSiteLinks } from "@/lib/constants";
import { cn } from "@/lib/utils";

const LIVE_STATUSES: string[] = [
  "en_route",
  "arrived",
  "check_in",
  "in_progress",
  "qc",
  "handover",
];

export const Route = createFileRoute("/d/$token")({
  head: () => ({
    meta: [
      { title: "Your jobs | True To Detail" },
      { name: "description", content: "Your assigned True To Detail mobile detailing jobs." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DetailerQueue,
});

const POLL_INTERVAL_MS = 20_000;

function DetailerQueue() {
  const { token } = Route.useParams();

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ["detailer-profile", token],
    queryFn: () => getDetailerProfile(token),
  });

  const {
    data: jobs,
    isLoading: jobsLoading,
    isError,
  } = useQuery({
    queryKey: ["detailer-jobs", token],
    queryFn: () => getDetailerJobs(token),
    refetchInterval: POLL_INTERVAL_MS,
    enabled: Boolean(profile),
  });

  const { data: history } = useQuery({
    queryKey: ["detailer-history", token],
    queryFn: () => getDetailerJobHistory(token),
    enabled: Boolean(profile),
  });

  if (profileLoading) {
    return (
      <div className="min-h-screen bg-background">
        <BrandedLoading label="Loading your link" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-background">
        <InvalidDetailerLink />
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-background pb-10">
      <header className="border-b border-white/10 bg-ink px-5 py-5 text-ink-foreground sm:px-6">
        <div className="mx-auto w-full max-w-md sm:max-w-2xl">
          <Link
            to="/d/$token"
            params={{ token }}
            aria-label="True To Detail, your jobs"
            className="press inline-block"
          >
            <TtdLogo tone="light" />
          </Link>
          <h1 className="mt-5 font-display text-[34px] leading-none">
            HI {profile.name.split(" ")[0]?.toUpperCase()}
            <span className="text-signal">.</span>
          </h1>
          <p className="mt-1.5 text-sm text-ink-foreground/50">Your assigned jobs</p>
        </div>
      </header>

      <div className="mx-auto w-full max-w-md px-5 py-6 sm:max-w-2xl sm:px-6">
        {jobsLoading ? (
          <ListSkeleton rows={2} />
        ) : isError ? (
          <EmptyState
            icon={Wrench}
            title="Couldn't load your jobs"
            description="Check your connection and reload this page."
          />
        ) : jobs && jobs.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {jobs.map((job, i) => {
              const { dayLabel, timeLabel } = formatAppointment(job.scheduled_start);
              return (
                <Link
                  key={job.id}
                  style={{ animationDelay: `${Math.min(i, 5) * 60}ms` }}
                  to="/d/$token/$bookingId"
                  params={{ token, bookingId: job.id }}
                  className={cn(
                    "press rise-in relative overflow-hidden rounded-xl border border-hairline bg-surface p-4",
                    // A job you are in the middle of stands out from the ones still to come.
                    LIVE_STATUSES.includes(job.status) && "border-l-4 border-l-signal",
                  )}
                >
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                    <div className="min-w-0">
                      <p className="mono-ref text-muted-foreground">{job.booking_reference}</p>
                      <p className="mt-1 truncate font-display text-[26px] leading-none">
                        {job.customer_first_name}
                      </p>
                    </div>
                    <StatusBadge status={job.status} size="sm" />
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
                    {job.vehicle_description ? (
                      <span className="text-sm font-medium">{job.vehicle_description}</span>
                    ) : null}
                    <PlateTag registration={job.vehicle_registration} />
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5">
                      <CalendarClock className="h-3.5 w-3.5" strokeWidth={2.2} />
                      {dayLabel}, {timeLabel}
                    </span>
                    {job.status === "assigned" ? (
                      <span className="text-signal-deep">
                        {formatCountdownToAppointment(job.scheduled_start)}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5" strokeWidth={2.2} />
                      {[job.service_address_city, job.service_postcode].filter(Boolean).join(", ")}
                    </span>
                    <span>{job.package_name}</span>
                  </div>
                  <p className="mt-3 flex min-h-8 items-center justify-end gap-1.5 text-[12px] font-bold uppercase tracking-[0.12em] text-signal-deep">
                    {LIVE_STATUSES.includes(job.status) ? "Continue job" : "Open job"}
                    <ChevronRight className="h-4 w-4" strokeWidth={2.6} />
                  </p>
                </Link>
              );
            })}
          </div>
        ) : (
          <EmptyState
            icon={Wrench}
            title="No jobs right now"
            description="Jobs assigned to you will show up here as soon as they're created."
          />
        )}

        {history && history.length > 0 ? (
          <section className="mt-8">
            <p className="eyebrow text-muted-foreground">Recent jobs</p>
            <div className="mt-3 flex flex-col gap-2">
              {history.map((h) => {
                const { dayLabel } = formatAppointment(h.scheduled_start);
                return (
                  <div
                    key={h.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-hairline bg-surface px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="mono-ref text-muted-foreground">{h.booking_reference}</p>
                      <p className="mt-0.5 truncate text-[13px] font-medium">
                        {h.vehicle_description ? `${h.vehicle_description} · ` : ""}
                        {h.vehicle_registration}
                      </p>
                      <p className="text-[12px] text-muted-foreground">{dayLabel}</p>
                    </div>
                    <StatusBadge status={h.status} size="sm" />
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}

function InvalidDetailerLink() {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-5 py-12">
      <div className="rise-in rounded-2xl border border-hairline bg-surface p-7 text-center">
        <a
          href={ttdSiteLinks.website}
          aria-label="True To Detail, home"
          className="press inline-block"
        >
          <TtdLogo size="lg" />
        </a>
        <span className="mt-7 inline-grid h-14 w-14 place-items-center rounded-full bg-surface-2 text-muted-foreground">
          <Clock3 className="h-6 w-6" strokeWidth={2} />
        </span>
        <h1 className="mt-5 font-display text-[26px] leading-tight">This link isn't active</h1>
        <p className="mt-2.5 text-[15px] leading-relaxed text-muted-foreground">
          This detailer link is invalid or has been deactivated. Contact the office for a new one.
        </p>
        <div className="mt-7 border-t border-hairline pt-5 text-left">
          <p className="eyebrow text-muted-foreground">Need help?</p>
          <div className="mt-3 flex flex-col gap-2">
            <a
              href={`mailto:${supportContact.email}`}
              className="press flex items-center gap-3 rounded-xl border border-hairline bg-surface-2 px-3.5 py-3 text-sm font-medium hover:bg-accent"
            >
              <Mail className="h-4 w-4 shrink-0 text-signal-deep" strokeWidth={2.2} />
              <span className="truncate">{supportContact.email}</span>
            </a>
            <a
              href={`tel:${supportContact.phone.replace(/\s/g, "")}`}
              className="press flex items-center gap-3 rounded-xl border border-hairline bg-surface-2 px-3.5 py-3 text-sm font-medium hover:bg-accent"
            >
              <Phone className="h-4 w-4 shrink-0 text-signal-deep" strokeWidth={2.2} />
              {supportContact.phone}
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
