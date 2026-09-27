import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  MapPin,
  Navigation,
  NotebookPen,
  RotateCw,
  Radio,
  ShieldOff,
  TriangleAlert,
} from "lucide-react";
import { TtdLogo } from "@/components/ttd/Header";
import { StatusBadge } from "@/components/ttd/StatusBadge";
import { VehicleCard } from "@/components/ttd/VehicleTag";
import { ContactActions } from "@/components/ttd/ContactActions";
import { BrandedLoading } from "@/components/ttd/BrandedLoading";
import { PrimaryActionButton } from "@/components/ttd/PrimaryActionButton";
import { CheckInForm } from "@/components/ttd/CheckInForm";
import { StageChecklist } from "@/components/ttd/StageChecklist";
import { useDetailerTracking } from "@/hooks/use-detailer-tracking";
import { formatAppointment, formatRelativeUpdate, getScheduleStatus } from "@/lib/format";
import {
  detailerCompleteBooking,
  detailerCustomerAck,
  detailerMarkArrived,
  detailerStartCheckIn,
  detailerStartHandover,
  detailerStartJourney,
  detailerToggleStage,
  detailerUpdateLocation,
  getDetailerJobStages,
  getDetailerJobs,
  getDetailerProfile,
  navigationUrlFor,
} from "@/lib/detailers";
import type { DetailStageKey } from "@/lib/constants";

export const Route = createFileRoute("/d/$token_/$bookingId")({
  head: () => ({
    meta: [{ title: "Job | True To Detail" }, { name: "robots", content: "noindex" }],
  }),
  component: DetailerJob,
});

function DetailerJob() {
  const { token, bookingId } = Route.useParams();
  const navigate = useNavigate();

  const { data: profile } = useQuery({
    queryKey: ["detailer-profile", token],
    queryFn: () => getDetailerProfile(token),
  });

  const {
    data: jobs,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["detailer-jobs", token],
    queryFn: () => getDetailerJobs(token),
    refetchInterval: 15_000,
  });

  const job = jobs?.find((j) => j.id === bookingId);

  const [transitioning, setTransitioning] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const tracking = useDetailerTracking({
    onStart: async (pos) => {
      await detailerStartJourney(token, bookingId, pos);
      await refetch();
    },
    onUpdate: (pos) => detailerUpdateLocation(token, bookingId, pos),
  });

  useEffect(() => {
    if (!isLoading && jobs && !job) {
      navigate({ to: "/d/$token", params: { token }, replace: true });
    }
  }, [isLoading, jobs, job, navigate, token]);

  const { data: stages, refetch: refetchStages } = useQuery({
    queryKey: ["detailer-job-stages", token, bookingId],
    queryFn: () => getDetailerJobStages(token, bookingId),
    enabled: Boolean(job) && (job?.status === "in_progress" || job?.status === "qc"),
    refetchInterval: 8_000,
  });

  const [pendingStage, setPendingStage] = useState<DetailStageKey | null>(null);

  async function handleArrived() {
    if (!job) return;
    tracking.endWatching();
    setActionError(null);
    setTransitioning(true);
    try {
      await detailerMarkArrived(token, job.id);
      await refetch();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Couldn't mark this job as arrived.");
    } finally {
      setTransitioning(false);
    }
  }

  async function handleToggleStage(stageKey: DetailStageKey, completed: boolean) {
    setPendingStage(stageKey);
    try {
      await detailerToggleStage(token, bookingId, stageKey, completed);
      await Promise.all([refetchStages(), refetch()]);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Couldn't update the checklist.");
    } finally {
      setPendingStage(null);
    }
  }

  async function handleStartHandover() {
    if (!job) return;
    setActionError(null);
    setTransitioning(true);
    try {
      await detailerStartHandover(token, job.id);
      await refetch();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Couldn't start handover.");
    } finally {
      setTransitioning(false);
    }
  }

  async function handleComplete() {
    if (!job) return;
    setActionError(null);
    setTransitioning(true);
    try {
      await detailerCompleteBooking(token, job.id);
      navigate({ to: "/d/$token", params: { token } });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Couldn't complete this job.");
      setTransitioning(false);
    }
  }

  if (isLoading || !job) {
    return (
      <main className="min-h-screen bg-background">
        <BrandedLoading label="Loading job" />
      </main>
    );
  }

  const { dayLabel, timeLabel } = formatAppointment(job.scheduled_start);
  const schedule = getScheduleStatus(job.scheduled_start, timeLabel);

  return (
    <main className="min-h-screen bg-background pb-10">
      <header className="border-b border-hairline bg-background/85 px-5 py-5 backdrop-blur-xl sm:px-6">
        <div className="mx-auto flex w-full max-w-md items-center justify-between gap-3 sm:max-w-lg">
          <TtdLogo />
          {profile?.photo_url ? (
            <img
              src={profile.photo_url}
              alt={profile.name}
              className="h-11 w-11 shrink-0 rounded-full border border-hairline object-cover"
            />
          ) : null}
        </div>
      </header>

      <div className="mx-auto w-full max-w-md px-5 py-6 sm:max-w-lg sm:px-6">
        <Link
          to="/d/$token"
          params={{ token }}
          className="press inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Your jobs
        </Link>

        <section className="mt-5 rounded-2xl border border-hairline bg-surface p-5 shadow-card">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
            <div className="min-w-0">
              <p className="mono-ref text-muted-foreground">{job.booking_reference}</p>
              <h1 className="mt-1 font-display text-[28px] leading-none">
                {job.customer_first_name}
              </h1>
            </div>
            <StatusBadge status={job.status} size="sm" />
          </div>

          <VehicleCard
            className="mt-4 border-0 bg-surface-2 p-3"
            vehicle={{
              description: job.vehicle_description,
              registration: job.vehicle_registration,
            }}
          />

          <div className="mt-3 grid grid-cols-2 gap-2.5">
            <Tile icon={CalendarClock} label="Appointment">
              {dayLabel}, {timeLabel}
            </Tile>
            <Tile icon={MapPin} label="Address">
              {job.service_address_line1}, {job.service_postcode}
            </Tile>
          </div>

          <a
            href={navigationUrlFor(job)}
            target="_blank"
            rel="noopener noreferrer"
            className="press mt-3 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-hairline bg-surface-2 font-display text-sm font-bold uppercase tracking-[0.08em] hover:bg-surface"
          >
            <Navigation className="h-4 w-4" strokeWidth={2.4} />
            Start navigation
          </a>

          <ContactActions className="mt-2.5" phone={job.customer_phone} label="the customer" />

          {job.internal_notes ? (
            <div className="mt-3 rounded-xl border border-signal/30 bg-signal/10 p-3.5">
              <p className="eyebrow flex items-center gap-1.5 text-signal-deep">
                <NotebookPen className="h-3 w-3" strokeWidth={2.4} />
                Job notes
              </p>
              <p className="mt-1.5 text-[13px] leading-relaxed">{job.internal_notes}</p>
            </div>
          ) : null}
          {job.customer_notes ? (
            <div className="mt-2 rounded-xl border border-hairline bg-surface-2 p-3.5">
              <p className="eyebrow text-muted-foreground">Customer requested</p>
              <p className="mt-1.5 text-[13px] leading-relaxed">{job.customer_notes}</p>
            </div>
          ) : null}
        </section>

        {actionError ? (
          <p className="mt-4 flex items-start gap-2 rounded-xl border border-destructive/25 bg-destructive/8 px-3.5 py-3 text-[13px] leading-relaxed text-destructive">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.2} />
            {actionError}
          </p>
        ) : null}

        {job.status === "assigned" && tracking.geoError ? (
          <p className="mt-3 text-[13px] text-destructive">{tracking.geoError}</p>
        ) : null}

        {job.status === "assigned" ? (
          <section className="rise-in mt-4 rounded-2xl border border-hairline bg-surface p-5 shadow-card">
            <PrimaryActionButton loading={tracking.starting} onClick={tracking.startJourney}>
              <Navigation className="h-5 w-5 rotate-45" strokeWidth={2.6} />
              Start journey
            </PrimaryActionButton>
            <p className="mt-2.5 text-[13px] leading-relaxed text-muted-foreground">
              Starting your journey shares your live location and notifies the customer.
            </p>
          </section>
        ) : null}

        {job.status === "en_route" ? (
          <section className="rise-in mt-4 rounded-2xl border border-hairline bg-surface p-5 shadow-card">
            <p
              className={`text-[13px] font-medium ${schedule.tone === "on-track" ? "text-success" : "text-muted-foreground"}`}
            >
              {schedule.label}
            </p>

            {tracking.isWatching ? (
              <div className="mt-3 flex items-center gap-3 rounded-xl border border-signal/40 bg-signal/12 px-3.5 py-3">
                <span className="relative grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ink text-signal">
                  <span className="absolute h-9 w-9 rounded-full bg-signal/50 pulse-ring" />
                  <Radio className="relative h-4 w-4" strokeWidth={2.4} />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold">Live location sharing active</p>
                  <p className="text-[13px] text-muted-foreground">
                    Last update:{" "}
                    {tracking.lastLocalFix
                      ? formatRelativeUpdate(new Date(tracking.lastLocalFix).toISOString())
                      : "waiting for a fix…"}
                  </p>
                </div>
              </div>
            ) : (
              <div className="mt-3 flex items-center gap-3 rounded-xl border border-hairline bg-surface-2 px-3.5 py-3">
                <ShieldOff className="h-5 w-5 shrink-0 text-muted-foreground" strokeWidth={2.2} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">Location sharing isn't active here</p>
                  <p className="text-[13px] text-muted-foreground">
                    This job is en route, but this tab isn't sending GPS updates.
                  </p>
                </div>
              </div>
            )}

            {!tracking.isWatching ? (
              <PrimaryActionButton
                className="mt-3"
                loading={tracking.resuming}
                onClick={tracking.resumeSharing}
              >
                <RotateCw className="h-5 w-5" strokeWidth={2.4} />
                Resume location sharing
              </PrimaryActionButton>
            ) : null}

            <PrimaryActionButton
              className="mt-3"
              variant="ink"
              loading={transitioning}
              onClick={handleArrived}
            >
              <CheckCircle2 className="h-5 w-5" strokeWidth={2.4} />
              I've arrived
            </PrimaryActionButton>
          </section>
        ) : null}

        {job.status === "arrived" ? (
          <section className="rise-in mt-4 rounded-2xl border border-hairline bg-surface p-5 shadow-card">
            <PrimaryActionButton
              loading={transitioning}
              onClick={async () => {
                setActionError(null);
                setTransitioning(true);
                try {
                  await detailerStartCheckIn(token, job.id);
                  await refetch();
                } catch (err) {
                  setActionError(err instanceof Error ? err.message : "Couldn't start check-in.");
                } finally {
                  setTransitioning(false);
                }
              }}
            >
              Start check-in
            </PrimaryActionButton>
          </section>
        ) : null}

        {job.status === "check_in" ? (
          <section className="rise-in mt-4 rounded-2xl border border-hairline bg-surface p-5 shadow-card">
            <p className="eyebrow mb-3 text-muted-foreground">Vehicle check-in</p>
            <CheckInForm token={token} bookingId={job.id} onSubmitted={() => refetch()} />
          </section>
        ) : null}

        {job.status === "in_progress" || job.status === "qc" ? (
          <section className="rise-in mt-4 rounded-2xl border border-hairline bg-surface p-5 shadow-card">
            <p className="eyebrow mb-3 text-muted-foreground">Detail in progress</p>
            <StageChecklist
              stages={stages ?? []}
              interactive={job.status === "in_progress"}
              pendingStage={pendingStage}
              onToggle={handleToggleStage}
            />
            <CustomerAckSection token={token} bookingId={job.id} />
          </section>
        ) : null}

        {job.status === "qc" ? (
          <section className="rise-in mt-4 rounded-2xl border border-hairline bg-surface p-5 shadow-card">
            <PrimaryActionButton loading={transitioning} onClick={handleStartHandover}>
              Start handover
            </PrimaryActionButton>
          </section>
        ) : null}

        {job.status === "handover" ? (
          <section className="rise-in mt-4 rounded-2xl border border-hairline bg-surface p-5 shadow-card">
            <PrimaryActionButton variant="success" loading={transitioning} onClick={handleComplete}>
              Complete job
            </PrimaryActionButton>
          </section>
        ) : null}
      </div>
    </main>
  );
}

function CustomerAckSection({ token, bookingId }: { token: string; bookingId: string }) {
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (done) {
    return (
      <p className="mt-4 flex items-center gap-2 rounded-xl border border-success/30 bg-success/10 px-3.5 py-3 text-[13px] font-medium text-success">
        <CheckCircle2 className="h-4 w-4" strokeWidth={2.4} />
        Customer confirmed the recorded condition and requested work.
      </p>
    );
  }

  return (
    <div className="mt-4 rounded-xl border border-hairline bg-surface-2 p-3.5">
      <p className="eyebrow text-muted-foreground">Customer acknowledgement</p>
      <p className="mt-1 text-[13px] text-muted-foreground">
        Ask the customer to confirm the recorded condition and requested work.
      </p>
      <div className="mt-2.5 flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Customer's name"
          className="min-h-10 flex-1 rounded-lg border border-input bg-surface px-3 text-sm outline-none focus:border-signal"
        />
        <PrimaryActionButton
          size="sm"
          className="w-auto px-4"
          loading={submitting}
          disabled={!name.trim()}
          onClick={async () => {
            setError(null);
            setSubmitting(true);
            try {
              await detailerCustomerAck(token, bookingId, name.trim());
              setDone(true);
            } catch (err) {
              setError(err instanceof Error ? err.message : "Couldn't record this.");
            } finally {
              setSubmitting(false);
            }
          }}
        >
          Confirm
        </PrimaryActionButton>
      </div>
      {error ? <p className="mt-2 text-[12px] text-destructive">{error}</p> : null}
    </div>
  );
}

function Tile({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-hairline bg-surface-2 p-3.5">
      <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
        <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={2.2} />
        <span className="min-w-0 text-[10px] font-semibold uppercase leading-tight tracking-[0.04em]">
          {label}
        </span>
      </span>
      <p className="mt-1.5 text-[15px] font-semibold leading-tight">{children}</p>
    </div>
  );
}
