import { useEffect, useRef, useState } from "react";
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
import { Check } from "lucide-react";
import { StatusBadge } from "@/components/ttd/StatusBadge";
import { PlateTag } from "@/components/ttd/VehicleTag";
import { StepTracker } from "@/components/ttd/LiveJob";
import { ListSkeleton } from "@/components/ttd/Skeleton";
import { toast } from "sonner";
import { ContactActions } from "@/components/ttd/ContactActions";
import { BrandedLoading } from "@/components/ttd/BrandedLoading";
import { PrimaryActionButton } from "@/components/ttd/PrimaryActionButton";
import { CheckInForm } from "@/components/ttd/CheckInForm";
import { StageChecklist } from "@/components/ttd/StageChecklist";
import { useDetailerTracking } from "@/hooks/use-detailer-tracking";
import { formatAppointment, formatRelativeUpdate, getScheduleStatus } from "@/lib/format";
import {
  detailerFinishJob,
  detailerMarkArrived,
  detailerStartJourney,
  detailerToggleStage,
  detailerUpdateLocation,
  getDetailerJobStages,
  getDetailerJobs,
  getDetailerProfile,
  navigationUrlFor,
} from "@/lib/detailers";
import type { DetailStageKey } from "@/lib/constants";
import { fetchDrivingEtaSeconds, type Point } from "@/lib/eta";
import { geocodePostcode } from "@/lib/postcode";
import { formatDuration } from "@/lib/progress";
import { sendBookingEmail } from "@/lib/portal-email";

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

  // The detailer's phone works out the driving time to the address (public
  // routing, no key) and sends it with each location update, so the customer
  // sees a real ETA on their map. No coordinates or routing means no ETA is
  // shown, never a guess.
  const jobRef = useRef(job);
  jobRef.current = job;
  const destRef = useRef<Point | null>(null);
  const lastEtaAtRef = useRef(0);
  const [etaSeconds, setEtaSeconds] = useState<number | null>(null);

  async function etaFor(pos: Point, force = false): Promise<number | null | undefined> {
    const j = jobRef.current;
    if (!j) return undefined;
    if (!force && Date.now() - lastEtaAtRef.current < 45_000) return undefined;
    if (!destRef.current) {
      if (j.destination_lat != null && j.destination_lng != null) {
        destRef.current = { lat: j.destination_lat, lng: j.destination_lng };
      } else {
        try {
          const g = await geocodePostcode(j.service_postcode);
          destRef.current = { lat: g.lat, lng: g.lng };
        } catch {
          return null;
        }
      }
    }
    lastEtaAtRef.current = Date.now();
    const eta = await fetchDrivingEtaSeconds(pos, destRef.current);
    if (eta != null) setEtaSeconds(eta);
    return eta;
  }

  const tracking = useDetailerTracking({
    onStart: async (pos) => {
      await detailerStartJourney(token, bookingId, pos);
      const eta = await etaFor(pos, true);
      if (eta != null) await detailerUpdateLocation(token, bookingId, pos, eta).catch(() => {});
      // Tell the customer their detailer is on the way (once; best effort).
      void sendBookingEmail(bookingId, "on_the_way", { detailerToken: token });
      toast.success("Journey started");
      await refetch();
    },
    onUpdate: async (pos) => {
      const eta = await etaFor(pos);
      await detailerUpdateLocation(token, bookingId, pos, eta);
    },
  });

  useEffect(() => {
    if (!isLoading && jobs && !job) {
      navigate({ to: "/d/$token", params: { token }, replace: true });
    }
  }, [isLoading, jobs, job, navigate, token]);

  const { data: stages, refetch: refetchStages } = useQuery({
    queryKey: ["detailer-job-stages", token, bookingId],
    queryFn: () => getDetailerJobStages(token, bookingId),
    enabled:
      Boolean(job) &&
      (job?.status === "in_progress" || job?.status === "qc" || job?.status === "handover"),
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
      toast.success("Marked as arrived");
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

  const [handedTo, setHandedTo] = useState("");

  async function handleFinish() {
    if (!job) return;
    setActionError(null);
    setTransitioning(true);
    try {
      await detailerFinishJob(token, job.id, handedTo);
      void sendBookingEmail(job.id, "completed", { detailerToken: token });
      // A clear "that's done" before the list takes over.
      toast.success(`${job.customer_first_name}'s car is finished. Nice work.`);
      navigate({ to: "/d/$token", params: { token } });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Couldn't finish this job.");
      setTransitioning(false);
    }
  }

  if (isLoading || !job) {
    return (
      <div className="min-h-screen bg-background">
        <div className="mx-auto w-full max-w-md px-5 py-8 sm:max-w-lg sm:px-6">
          <ListSkeleton rows={2} />
        </div>
      </div>
    );
  }

  const { dayLabel, timeLabel } = formatAppointment(job.scheduled_start);
  const schedule = getScheduleStatus(job.scheduled_start, timeLabel);

  return (
    <main className="min-h-screen bg-background pb-10">
      <header className="border-b border-white/10 bg-ink px-5 py-5 text-ink-foreground sm:px-6">
        <div className="mx-auto flex w-full max-w-md items-center justify-between gap-3 sm:max-w-lg">
          <Link
            to="/d/$token"
            params={{ token }}
            aria-label="True To Detail, your jobs"
            className="press"
          >
            <TtdLogo tone="light" />
          </Link>
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

        <section className="mt-5 rounded-2xl border border-hairline bg-surface p-5">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
            <div className="min-w-0">
              <p className="mono-ref text-muted-foreground">{job.booking_reference}</p>
              <h1 className="mt-1 font-display text-[28px] leading-none">
                {job.customer_first_name}
              </h1>
            </div>
            <StatusBadge status={job.status} size="sm" />
          </div>

          <StepTracker status={job.status} className="mt-5" />

          <dl className="mt-4 divide-y divide-hairline border-y border-hairline text-[14px]">
            <div className="flex items-start gap-3 py-3">
              <CalendarClock
                className="mt-0.5 h-4 w-4 shrink-0 text-signal-deep"
                strokeWidth={2.2}
              />
              <div className="min-w-0">
                <dt className="eyebrow text-muted-foreground">Appointment</dt>
                <dd className="mt-0.5 font-semibold">
                  {dayLabel}, {timeLabel}
                </dd>
              </div>
            </div>
            <div className="flex items-start gap-3 py-3">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-signal-deep" strokeWidth={2.2} />
              <div className="min-w-0">
                <dt className="eyebrow text-muted-foreground">Address</dt>
                <dd className="mt-0.5 font-semibold">
                  {job.service_address_line1}, {job.service_postcode}
                </dd>
              </div>
            </div>
            <div className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <dt className="eyebrow text-muted-foreground">Vehicle</dt>
                {job.vehicle_description ? (
                  <dd className="mt-0.5 truncate font-semibold">{job.vehicle_description}</dd>
                ) : null}
              </div>
              <PlateTag registration={job.vehicle_registration} />
            </div>
          </dl>

          <a
            href={navigationUrlFor(job)}
            target="_blank"
            rel="noopener noreferrer"
            className="press mt-3 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-hairline bg-surface-2 font-sans text-[13px] font-bold uppercase tracking-[0.1em] hover:bg-surface"
          >
            <Navigation className="h-4 w-4" strokeWidth={2.4} />
            Start navigation
          </a>

          <ContactActions className="mt-2.5" phone={job.customer_phone} label="the customer" />

          {job.internal_notes ? (
            <div className="mt-4 border-l-2 border-signal pl-3.5">
              <p className="eyebrow flex items-center gap-1.5 text-signal-deep">
                <NotebookPen className="h-3 w-3" strokeWidth={2.4} />
                Job notes
              </p>
              <p className="mt-1.5 text-[13px] leading-relaxed">{job.internal_notes}</p>
            </div>
          ) : null}
          {job.customer_notes ? (
            <div className="mt-4 border-l-2 border-hairline pl-3.5">
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
          <section className="rise-in mt-4 rounded-2xl border border-hairline bg-surface p-5">
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
          <section className="rise-in mt-4 rounded-2xl border border-hairline bg-surface p-5">
            <p className="text-[13px] font-medium text-muted-foreground">
              {etaSeconds != null
                ? `About ${formatDuration(etaSeconds)} to the address. The customer can see this.`
                : schedule.label}
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

        {job.status === "arrived" || job.status === "check_in" ? (
          <section className="rise-in mt-4 rounded-2xl border border-hairline bg-surface p-5">
            <p className="eyebrow mb-3 text-muted-foreground">Check in the car</p>
            <CheckInForm token={token} bookingId={job.id} onSubmitted={() => refetch()} />
          </section>
        ) : null}

        {job.status === "in_progress" || job.status === "qc" || job.status === "handover" ? (
          <section className="rise-in mt-4 rounded-2xl border border-hairline bg-surface p-5">
            <p className="eyebrow text-muted-foreground">Detailing</p>
            <p className="mb-3 mt-1 text-[13px] text-muted-foreground">
              Tick items as you go so the customer can follow along. Finish when you are done.
            </p>
            <StageChecklist
              stages={stages ?? []}
              interactive
              pendingStage={pendingStage}
              onToggle={handleToggleStage}
            />
            <div className="mt-5 border-t border-hairline pt-4">
              <label htmlFor="handed-to" className="eyebrow block text-muted-foreground">
                Handed back to (optional)
              </label>
              <input
                id="handed-to"
                value={handedTo}
                onChange={(e) => setHandedTo(e.target.value)}
                placeholder="Customer's name"
                className="mt-2 min-h-11 w-full rounded-xl border border-input bg-surface-2 px-3.5 text-sm outline-none focus:border-signal"
              />
              <PrimaryActionButton
                className="mt-3"
                variant="success"
                loading={transitioning}
                onClick={handleFinish}
              >
                <Check className="h-5 w-5" strokeWidth={2.6} />
                Finish job
              </PrimaryActionButton>
              {stages && stages.some((s) => !s.completed_at) ? (
                <p className="mt-2 text-[12px] text-muted-foreground">
                  Tick every item above to finish the job.
                </p>
              ) : null}
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
