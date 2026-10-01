import { Link } from "@tanstack/react-router";
import { format } from "date-fns";
import { ArrowRight, Check } from "lucide-react";
import { UK_TIME } from "@/lib/uk-time";
import { cn } from "@/lib/utils";
import { DETAIL_STAGE_LABELS, STAGE_DISPLAY_ORDER } from "@/lib/constants";
import { checklistProgress, estimatedFinish } from "@/lib/journey";
import { formatDuration } from "@/lib/progress";
import { formatMiles } from "@/lib/eta";
import { DateBlock } from "@/components/ttd/DateBlock";
import { whenParts } from "@/lib/format";
import { FinishStage } from "@/components/ttd/FinishStage";
import { useDrivingRoute, useEta, type JobView } from "@/components/ttd/LiveJob";

const DETAILING = ["arrived", "check_in", "in_progress", "qc", "handover"];

/**
 * The same paint surface as the account home, now measuring this one job. Before
 * the detailing starts the paint is hazy: this is the car we are about to
 * finish. Each stage the detailer ticks takes a quarter of it to mirror, and when
 * the job completes the finish arrives with a single pass of light. The level is
 * always the detailer's real ticks, never an estimate.
 */
export function JobHero({
  bookingId,
  view,
  startIso,
  where,
  visitNumber,
  required,
  timeOnSiteMinutes,
  justFinished,
}: {
  bookingId: string;
  view: JobView;
  /** When the visit is booked for. */
  startIso: string;
  where: string;
  /** The completed visit this job counts as, once it is done. */
  visitNumber: number | null;
  required: number;
  timeOnSiteMinutes: number | null;
  /** The job finished while this page was open. */
  justFinished: boolean;
}) {
  const detailing = DETAILING.includes(view.status);
  const done = view.status === "completed";
  const checklist = view.stages
    .map((s) => ({ key: s.stage_key as string, done: Boolean(s.completed_at) }))
    .sort((a, b) => STAGE_DISPLAY_ORDER.indexOf(a.key) - STAGE_DISPLAY_ORDER.indexOf(b.key));
  const progress = checklistProgress(checklist);
  const level = done ? 1 : detailing && progress.total > 0 ? progress.percent / 100 : 0;
  const finish = estimatedFinish({
    status: view.status,
    arrived_at: view.arrivedAt,
    in_progress_at: view.inProgressAt,
    estimated_duration_minutes: view.durationMinutes,
  });
  const eta = useEta(view);
  const route = useDrivingRoute(view.position, view.destination, view.status === "en_route");
  const focus =
    detailing && progress.total > 0 && progress.done < progress.total
      ? (progress.done + 0.5) / progress.total
      : null;

  return (
    <FinishStage surface={`job:${bookingId}`} level={level} pass={justFinished} focus={focus}>
      <section
        aria-label="Job progress"
        className="absolute inset-x-0 bottom-0 pt-24 text-ink-foreground"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_top,rgb(12_12_12/0.78)_0%,rgb(12_12_12/0.35)_38%,transparent_70%),linear-gradient(to_right,rgb(12_12_12/0.62)_0%,rgb(12_12_12/0.2)_42%,transparent_68%)]"
        />
        <div className="pointer-events-none relative mx-auto w-full max-w-6xl px-5 pb-4 sm:px-8">
          {done ? (
            <div role="status" className="pop-in">
              <p className="text-[15px] font-semibold text-ink-foreground">
                {timeOnSiteMinutes ? `${formatDuration(timeOnSiteMinutes * 60)} on site. ` : null}
                {visitNumber && visitNumber <= required
                  ? `That is visit ${visitNumber} of ${required}.`
                  : "Thank you for booking with us."}
              </p>
              {visitNumber && visitNumber <= required ? (
                <Link
                  to="/account"
                  className="press pointer-events-auto mt-1 inline-flex min-h-11 items-center gap-2 text-[12px] font-bold uppercase tracking-[0.12em] text-signal"
                >
                  See your finish <ArrowRight className="h-4 w-4" strokeWidth={2.6} />
                </Link>
              ) : null}
            </div>
          ) : view.status === "en_route" && eta ? (
            <div role="status" aria-live="polite">
              {eta.hasEta && eta.arrival ? (
                <>
                  <p
                    key={formatDuration(eta.remaining)}
                    className="fade-in font-display text-[52px] leading-none sm:text-[68px]"
                  >
                    {formatDuration(eta.remaining).toUpperCase()}
                    <span className="ml-2 text-[22px] text-ink-foreground/55">AWAY</span>
                  </p>
                  <p className="mt-2 text-[14px] text-ink-foreground/75">
                    Arriving around {format(eta.arrival, "h:mm a", { in: UK_TIME })}
                    {eta.lateMs > 10 * 60 * 1000
                      ? ` (a little after your ${format(eta.slot, "h:mm a", { in: UK_TIME })} slot)`
                      : null}
                    {route?.meters != null ? ` · ${formatMiles(route.meters)} by road` : null}
                  </p>
                </>
              ) : (
                <p className="max-w-md text-[17px] font-semibold leading-snug">
                  {view.detailerFirstName ?? "Your detailer"} is on the way. Your arrival time
                  appears here as soon as their phone shares it.
                </p>
              )}
            </div>
          ) : detailing ? (
            <div role="status" aria-live="polite">
              {finish ? (
                <p className="font-display text-[44px] leading-none sm:text-[60px]">
                  {`DONE BY ${format(finish, "h:mm a", { in: UK_TIME }).toUpperCase()}`}
                </p>
              ) : null}
              {progress.total > 0 ? (
                <p className={cn("text-[14px] text-ink-foreground/80", finish && "mt-2")}>
                  {progress.current
                    ? `Now: ${progress.current}. ${progress.done} of ${progress.total} steps done.`
                    : "Every step is done. Just the final tidy up."}
                </p>
              ) : (
                <p className="text-[14px] text-ink-foreground/80">Detailing is under way.</p>
              )}
            </div>
          ) : (
            <div>
              <p className="flex flex-wrap items-baseline gap-x-4 gap-y-1 font-display leading-none">
                <DateBlock iso={startIso} tone="onDark" className="text-[52px] sm:text-[68px]" />
                <span className="text-[28px] text-ink-foreground/80 sm:text-[36px]">
                  {whenParts(startIso).timeLabel.toUpperCase()}
                </span>
              </p>
              <p className="mt-2 text-[14px] text-ink-foreground/75">{where}</p>
            </div>
          )}
        </div>

        {detailing && progress.total > 0 ? (
          <ol
            aria-label="Detailing steps"
            className="relative mt-2 grid"
            style={{ gridTemplateColumns: `repeat(${progress.total}, minmax(0, 1fr))` }}
          >
            {checklist.map((c, i) => {
              const now = !c.done && i === progress.done;
              return (
                <li key={c.key} className="min-w-0 px-1.5 pb-3 text-center">
                  <span
                    className={cn(
                      "mx-auto grid h-7 w-7 place-items-center rounded-full border-2 transition-colors",
                      c.done && "border-signal bg-signal text-signal-foreground",
                      now && "glow-next border-signal text-signal",
                      !c.done && !now && "border-ink-foreground/30 text-transparent",
                    )}
                    aria-current={now ? "step" : undefined}
                  >
                    {c.done ? (
                      <Check className="h-3.5 w-3.5" strokeWidth={3.2} />
                    ) : (
                      <span className="font-mono text-[11px] text-ink-foreground/70">{i + 1}</span>
                    )}
                  </span>
                  <span
                    className={cn(
                      "mt-1.5 block text-[11px] leading-tight sm:text-[12px]",
                      c.done || now
                        ? "font-semibold text-ink-foreground"
                        : "text-ink-foreground/55",
                    )}
                  >
                    {DETAIL_STAGE_LABELS[c.key] ?? c.key}
                  </span>
                </li>
              );
            })}
          </ol>
        ) : (
          <div className="h-3" />
        )}
      </section>
    </FinishStage>
  );
}
