import { useEffect, useRef, useState } from "react";
import { Check, Clock, MapPinned } from "lucide-react";
import { format } from "date-fns";
import { UK_TIME } from "@/lib/uk-time";
import { cn } from "@/lib/utils";
import {
  CUSTOMER_STEPS,
  customerHeadline,
  customerStepIndex,
  formatDuration,
} from "@/lib/progress";
import { formatRelativeUpdate } from "@/lib/format";
import { fetchDrivingRoute, formatMiles, type DrivingRoute } from "@/lib/eta";
import { estimatedFinish } from "@/lib/journey";
import type { BookingStatus, BookingWithDetailer } from "@/lib/bookings";
import type { TrackedBooking } from "@/lib/tracking";
import { TrackingMap } from "@/components/ttd/TrackingMap";
import { DetailerCard } from "@/components/ttd/DetailerCard";
import { StageChecklist } from "@/components/ttd/StageChecklist";
import { FinishPanel } from "@/components/ttd/TrackingExtras";
import type { StageProgress } from "@/lib/detailers";
import type { DetailStageKey } from "@/lib/constants";

/** Everything the live view needs, whether it came from the signed-in booking or the public tracking link. */
export interface JobView {
  status: BookingStatus;
  scheduledStart: string;
  detailerName: string | null;
  detailerFirstName: string | null;
  detailerRole: string | null;
  detailerPhoto: string | null;
  detailerVehicle: string | null;
  detailerPhone: string | null;
  position: { lat: number; lng: number } | null;
  destination: { lat: number; lng: number } | null;
  locationUpdatedAt: string | null;
  etaSeconds: number | null;
  etaUpdatedAt: string | null;
  arrivedAt: string | null;
  inProgressAt: string | null;
  durationMinutes: number;
  stages: StageProgress[];
}

export function viewFromBooking(b: BookingWithDetailer, stages: StageProgress[] = []): JobView {
  return {
    status: b.status,
    scheduledStart: b.scheduled_start,
    detailerName: b.detailer?.name ?? null,
    detailerFirstName: b.detailer?.name?.split(" ")[0] ?? null,
    detailerRole: b.detailer?.job_title ?? null,
    detailerPhoto: b.detailer?.photo_url ?? null,
    detailerVehicle: b.detailer?.vehicle_description ?? null,
    detailerPhone: b.detailer?.phone ?? null,
    position:
      b.tracking_active && b.current_lat != null && b.current_lng != null
        ? { lat: b.current_lat, lng: b.current_lng }
        : null,
    destination:
      b.destination_lat != null && b.destination_lng != null
        ? { lat: b.destination_lat, lng: b.destination_lng }
        : null,
    locationUpdatedAt: b.location_updated_at,
    etaSeconds: b.eta_seconds,
    etaUpdatedAt: b.eta_updated_at,
    arrivedAt: b.arrived_at,
    inProgressAt: b.in_progress_at,
    durationMinutes: b.estimated_duration_minutes,
    stages,
  };
}

export function viewFromTracked(t: TrackedBooking): JobView {
  const tr = t.tracking;
  return {
    status: t.status,
    scheduledStart: t.scheduled_start,
    detailerName: t.detailer?.first_name ?? null,
    detailerFirstName: t.detailer?.first_name ?? null,
    detailerRole: t.detailer?.job_title ?? null,
    detailerPhoto: t.detailer?.photo_url ?? null,
    detailerVehicle: t.detailer?.vehicle_description ?? null,
    detailerPhone: null,
    position: tr && tr.lat != null && tr.lng != null ? { lat: tr.lat, lng: tr.lng } : null,
    destination:
      tr && tr.destination_lat != null && tr.destination_lng != null
        ? { lat: tr.destination_lat, lng: tr.destination_lng }
        : null,
    locationUpdatedAt: tr?.updated_at ?? null,
    etaSeconds: tr?.eta_seconds ?? null,
    etaUpdatedAt: tr?.eta_updated_at ?? null,
    arrivedAt: t.arrived_at,
    inProgressAt: t.in_progress_at,
    durationMinutes: t.estimated_duration_minutes,
    stages: t.stages.map((s) => ({
      stage_key: s.key as DetailStageKey,
      completed_at: s.done ? "done" : null,
    })) as StageProgress[],
  };
}

function useNow(everyMs = 20_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(id);
  }, [everyMs]);
  return now;
}

/** The road route from the detailer to the address, refreshed at most every 30 seconds while they are on the way. */
export function useDrivingRoute(
  position: { lat: number; lng: number } | null,
  destination: { lat: number; lng: number } | null,
  active: boolean,
): DrivingRoute | null {
  const [route, setRoute] = useState<DrivingRoute | null>(null);
  const lastAt = useRef(0);
  const lat = position?.lat;
  const lng = position?.lng;
  const dLat = destination?.lat;
  const dLng = destination?.lng;
  useEffect(() => {
    if (!active || lat == null || lng == null || dLat == null || dLng == null) return;
    if (Date.now() - lastAt.current < 30_000) return;
    lastAt.current = Date.now();
    let cancelled = false;
    void fetchDrivingRoute({ lat, lng }, { lat: dLat, lng: dLng }).then((r) => {
      if (!cancelled && r) setRoute(r);
    });
    return () => {
      cancelled = true;
    };
  }, [active, lat, lng, dLat, dLng]);
  return route;
}

/** Five steps, one line. The current step is highlighted; on a phone the labels stay under the dots. */
export function StepTracker({ status, className }: { status: BookingStatus; className?: string }) {
  const idx = customerStepIndex(status);
  // Steps fill in one after another when the tracker first appears, then follow status changes.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(id);
  }, []);
  if (idx === -1) return null;
  return (
    <ol className={cn("grid grid-cols-5 gap-1", className)} aria-label="Progress">
      {CUSTOMER_STEPS.map((step, i) => {
        const done = i < idx || (status === "completed" && i === 4);
        const active = i === Math.ceil(idx) && !done;
        return (
          <li key={step.key} className="flex min-w-0 flex-col items-center gap-2 text-center">
            <span className="relative flex w-full items-center justify-center">
              {i > 0 ? (
                <span
                  className="absolute right-1/2 top-1/2 h-[2px] w-full -translate-y-1/2 overflow-hidden bg-hairline"
                  aria-hidden
                >
                  <span
                    className="block h-full origin-left bg-signal transition-transform duration-500 ease-out"
                    style={{
                      transform: `scaleX(${ready && i <= idx ? 1 : 0})`,
                      transitionDelay: `${i * 90}ms`,
                    }}
                  />
                </span>
              ) : null}
              <span
                className={cn(
                  "state-transition relative z-10 grid h-7 w-7 place-items-center rounded-full border-2",
                  done && "border-signal bg-signal text-signal-foreground",
                  active && "glow-next border-signal bg-surface text-signal",
                  !done && !active && "border-hairline bg-surface text-transparent",
                )}
                aria-current={active ? "step" : undefined}
              >
                {done ? (
                  <Check className="h-3.5 w-3.5" strokeWidth={3.2} />
                ) : active ? (
                  <span className="h-2 w-2 rounded-full bg-signal" />
                ) : (
                  <span className="h-2 w-2 rounded-full bg-border" />
                )}
              </span>
            </span>
            <span
              className={cn(
                "text-[11px] leading-tight sm:text-[12px]",
                done || active ? "font-semibold text-foreground" : "text-muted-foreground",
              )}
            >
              {step.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** The big "Arriving in 12 min" card, driven by the detailer's phone (routing ETA), never a guess. */
export function EtaPanel({
  view,
  distanceMeters,
}: {
  view: JobView;
  distanceMeters?: number | null;
}) {
  const now = useNow();
  if (view.status !== "en_route") return null;

  const hasEta = view.etaSeconds != null && view.etaUpdatedAt != null;
  let remaining = 0;
  let arrival: Date | null = null;
  if (hasEta) {
    const base = new Date(view.etaUpdatedAt!).getTime();
    arrival = new Date(base + view.etaSeconds! * 1000);
    remaining = Math.max(60, Math.round((arrival.getTime() - now) / 1000));
  }
  const slot = new Date(view.scheduledStart);
  const lateMs = arrival ? arrival.getTime() - slot.getTime() : 0;
  const fresh = view.locationUpdatedAt
    ? Math.round((now - new Date(view.locationUpdatedAt).getTime()) / 1000)
    : null;

  return (
    <div
      className="rounded-2xl bg-ink p-5 text-ink-foreground shadow-card"
      role="status"
      aria-live="polite"
    >
      <p className="eyebrow flex items-center gap-2 text-ink-foreground/55">
        <span className="relative grid h-2 w-2 place-items-center">
          <span className="pulse-ring absolute h-2 w-2 rounded-full bg-signal" />
          <span className="h-2 w-2 rounded-full bg-signal" />
        </span>
        Live
      </p>
      {hasEta && arrival ? (
        <>
          <p
            key={formatDuration(remaining)}
            className="fade-in mt-3 font-display text-[52px] leading-none"
          >
            {formatDuration(remaining)}
            <span className="ml-2 text-[22px] text-ink-foreground/45">away</span>
          </p>
          <p className="mt-2 flex items-center gap-2 text-[15px] text-ink-foreground/75">
            <Clock className="h-4 w-4" strokeWidth={2.2} />
            Arriving around {format(arrival, "h:mm a", { in: UK_TIME })}
            {lateMs > 10 * 60 * 1000
              ? ` (a little after your ${format(slot, "h:mm a", { in: UK_TIME })} slot)`
              : null}
            {distanceMeters != null ? (
              <span className="ml-1 text-ink-foreground/55">
                · {formatMiles(distanceMeters)} by road
              </span>
            ) : null}
          </p>
        </>
      ) : (
        <p className="mt-3 text-[18px] font-semibold leading-snug">
          {view.detailerFirstName ?? "Your detailer"} is on the way. Your arrival time appears here
          as soon as their phone shares it.
        </p>
      )}
      {fresh != null ? (
        <p className="mt-3 text-[12px] text-ink-foreground/45">
          Location updated {formatRelativeUpdate(view.locationUpdatedAt)}
        </p>
      ) : null}
    </div>
  );
}

/** Everything a customer sees for a live job: headline, steps, ETA, map, detailer and the detailing checklist. */
export function LiveJobPanel({
  view,
  className,
  showSteps = true,
  showHeadline = true,
}: {
  view: JobView;
  className?: string;
  showSteps?: boolean;
  showHeadline?: boolean;
}) {
  const detailing = ["arrived", "check_in", "in_progress", "qc", "handover"].includes(view.status);
  const route = useDrivingRoute(view.position, view.destination, view.status === "en_route");
  const finish = estimatedFinish({
    status: view.status,
    arrived_at: view.arrivedAt,
    in_progress_at: view.inProgressAt,
    estimated_duration_minutes: view.durationMinutes,
  });
  const checklist = view.stages.map((s) => ({
    key: s.stage_key as string,
    done: Boolean(s.completed_at),
  }));
  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <div className="rounded-2xl border border-hairline bg-surface p-5">
        {showHeadline ? (
          <>
            <p className="eyebrow text-muted-foreground">Right now</p>
            <p className="mt-1.5 font-display text-[30px] leading-none sm:text-[36px]">
              {customerHeadline(view.status, view.detailerFirstName)}
            </p>
          </>
        ) : (
          <p className="eyebrow text-muted-foreground">Progress</p>
        )}
        {showSteps ? (
          <StepTracker status={view.status} className={showHeadline ? "mt-6" : "mt-4"} />
        ) : null}
      </div>

      <EtaPanel view={view} distanceMeters={route?.meters ?? null} />

      {detailing ? <FinishPanel stages={checklist} finish={finish} /> : null}

      {view.status === "en_route" && (view.position || view.destination) ? (
        <TrackingMap
          className="h-[300px] sm:h-[380px]"
          detailerPosition={view.position}
          destination={view.destination}
          detailerPhotoUrl={view.detailerPhoto}
          lastUpdate={view.locationUpdatedAt}
          route={route?.line ?? null}
        />
      ) : null}

      {view.status === "en_route" && !view.position ? (
        <p className="flex items-center gap-2 rounded-xl bg-surface-2 px-4 py-3 text-[13px] text-muted-foreground">
          <MapPinned className="h-4 w-4 shrink-0" strokeWidth={2.2} />
          The map appears as soon as your detailer&rsquo;s phone shares its location.
        </p>
      ) : null}

      {view.detailerName ? (
        <DetailerCard
          detailer={{ name: view.detailerName, role: view.detailerRole }}
          photoUrl={view.detailerPhoto}
          vehicleDescription={view.detailerVehicle}
          phone={view.detailerPhone}
        />
      ) : null}

      {detailing && view.stages.length > 0 ? (
        <section className="rounded-2xl border border-hairline bg-surface p-5">
          <p className="eyebrow text-muted-foreground">Detailing checklist</p>
          <StageChecklist className="mt-3" stages={view.stages} />
        </section>
      ) : null}
    </div>
  );
}
