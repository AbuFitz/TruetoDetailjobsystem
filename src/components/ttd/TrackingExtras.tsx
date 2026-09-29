import { useEffect, useRef, useState } from "react";
import {
  Bell,
  BellOff,
  CalendarPlus,
  Check,
  Download,
  Flag,
  KeyRound,
  Link2,
  PawPrint,
  ShieldAlert,
  Timer,
  WifiOff,
} from "lucide-react";
import { format } from "date-fns";
import { UK_TIME } from "@/lib/uk-time";
import { cn } from "@/lib/utils";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { useNow } from "@/hooks/use-now";
import {
  alertPermission,
  type AlertPermission,
  alertsEnabled,
  disableAlerts,
  enableAlerts,
  showAlert,
  statusAlert,
} from "@/lib/alerts";
import { buildIcs, googleCalendarUrl, type CalendarEvent } from "@/lib/calendar";
import { checklistProgress, type JourneyEvent } from "@/lib/journey";
import type { BookingStatus } from "@/lib/bookings";

/** Says so, plainly, when the page is showing old information. */
export function ConnectionBanner({
  dataUpdatedAt,
  live,
  locationUpdatedAt,
}: {
  dataUpdatedAt: number;
  /** True while the detailer is sharing their location (on the way). */
  live: boolean;
  locationUpdatedAt: string | null;
}) {
  const online = useOnlineStatus();
  const now = useNow(15_000);
  const staleData = dataUpdatedAt > 0 && now - dataUpdatedAt > 45_000;
  const staleLocation =
    live && locationUpdatedAt ? now - new Date(locationUpdatedAt).getTime() > 3 * 60_000 : false;

  let message: string | null = null;
  if (!online) {
    message = `You are offline. Showing the last update from ${format(dataUpdatedAt || now, "h:mm a", { in: UK_TIME })}.`;
  } else if (staleData) {
    message = "We are having trouble refreshing. Showing the last update we have.";
  } else if (staleLocation) {
    message = "Their location has not updated for a few minutes. Their phone may have lost signal.";
  }
  if (!message) return null;

  return (
    <p
      role="status"
      className="flex items-start gap-2.5 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-[13px] leading-snug"
    >
      <WifiOff className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.2} />
      {message}
    </p>
  );
}

const fmtTime = (iso: string) => format(new Date(iso), "h:mm a", { in: UK_TIME });
const fmtDay = (iso: string) => format(new Date(iso), "EEE d MMM", { in: UK_TIME });

/** Timestamped record of the visit so far, with what is still to come greyed out. */
export function JourneyLog({ events, className }: { events: JourneyEvent[]; className?: string }) {
  return (
    <section className={cn("rounded-2xl border border-hairline bg-surface p-5", className)}>
      <p className="eyebrow text-muted-foreground">Your visit so far</p>
      <ol className="mt-3 flex flex-col">
        {events.map((e, i) => {
          const happened = e.at != null;
          const last = i === events.length - 1;
          return (
            <li key={e.key} className="relative flex gap-3 pb-4 last:pb-0">
              {!last ? (
                <span
                  className={cn(
                    "absolute left-[9px] top-5 h-[calc(100%-12px)] w-[2px]",
                    happened && events[i + 1]?.at ? "bg-signal" : "bg-hairline",
                  )}
                  aria-hidden
                />
              ) : null}
              <span
                className={cn(
                  "relative z-10 mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border-2",
                  happened
                    ? "border-signal bg-signal text-signal-foreground"
                    : "border-hairline bg-surface",
                )}
                aria-hidden
              >
                {happened ? <Check className="h-3 w-3" strokeWidth={3.4} /> : null}
              </span>
              <div className="flex min-w-0 flex-1 items-baseline justify-between gap-3">
                <span
                  className={cn(
                    "text-[14px] leading-tight",
                    happened ? "font-semibold text-foreground" : "text-muted-foreground",
                  )}
                >
                  {e.label}
                </span>
                <span className="shrink-0 text-[12px] tabular-nums text-muted-foreground">
                  {e.at ? (i === 0 ? fmtDay(e.at) : fmtTime(e.at)) : "Not yet"}
                </span>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** While the car is being detailed: how far through, what is happening now, and when it should finish. */
export function FinishPanel({
  stages,
  finish,
}: {
  stages: { key: string; done: boolean }[];
  finish: Date | null;
}) {
  const progress = checklistProgress(stages);
  const now = useNow(30_000);
  const late = finish ? now - finish.getTime() > 15 * 60_000 : false;
  return (
    <section className="rounded-2xl bg-ink p-5 text-ink-foreground shadow-card" aria-live="polite">
      <p className="eyebrow flex items-center gap-2 text-ink-foreground/55">
        <Timer className="h-3.5 w-3.5" strokeWidth={2.4} />
        Detailing
      </p>
      {finish ? (
        <p className="mt-3 font-display text-[44px] leading-none">
          {late ? "Nearly there" : `Done by ${format(finish, "h:mm a", { in: UK_TIME })}`}
        </p>
      ) : (
        <p className="mt-3 font-display text-[40px] leading-none">In progress</p>
      )}
      {progress.total > 0 ? (
        <>
          <div
            className="mt-4 h-2 overflow-hidden rounded-full bg-white/15"
            role="progressbar"
            aria-valuenow={progress.percent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Detailing progress"
          >
            <div
              className="h-full rounded-full bg-signal transition-[width] duration-700"
              style={{ width: `${Math.max(6, progress.percent)}%` }}
            />
          </div>
          <p className="mt-2.5 text-[14px] text-ink-foreground/75">
            {progress.current
              ? `Now: ${progress.current}. ${progress.done} of ${progress.total} steps done.`
              : "Every step is done. Just the final tidy up."}
          </p>
        </>
      ) : null}
    </section>
  );
}

/** Turn on browser alerts for the big moments. Says what it can and cannot do. */
export function AlertsToggle({ className }: { className?: string }) {
  // Read the browser only after mounting, so the server and first client render agree.
  const [permission, setPermission] = useState<AlertPermission | null>(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    setPermission(alertPermission());
    setOn(alertsEnabled());
  }, []);
  if (permission === null || permission === "unsupported") return null;

  const denied = permission === "denied";
  return (
    <div className={cn("rounded-2xl border border-hairline bg-surface p-4", className)}>
      <button
        type="button"
        disabled={denied}
        onClick={async () => {
          if (on) {
            disableAlerts();
            setOn(false);
            return;
          }
          const result = await enableAlerts();
          setPermission(result);
          setOn(result === "granted");
          if (result === "granted")
            showAlert("Alerts are on", "We will tell you when your detailer sets off and arrives.");
        }}
        className="press flex w-full items-center gap-3 text-left disabled:opacity-60"
        aria-pressed={on}
      >
        <span
          className={cn(
            "grid h-10 w-10 shrink-0 place-items-center rounded-full",
            on ? "bg-signal text-signal-foreground" : "bg-surface-2 text-foreground",
          )}
        >
          {on ? (
            <Bell className="h-4 w-4" strokeWidth={2.4} />
          ) : (
            <BellOff className="h-4 w-4" strokeWidth={2.4} />
          )}
        </span>
        <span className="min-w-0">
          <span className="block text-[14px] font-semibold">
            {on ? "Alerts are on" : "Get an alert when they set off"}
          </span>
          <span className="block text-[12px] leading-snug text-muted-foreground">
            {denied
              ? "Notifications are blocked in your browser settings."
              : "Works while this page is open, even in the background."}
          </span>
        </span>
      </button>
    </div>
  );
}

/** Fires an alert the moment the status moves on, and a "nearly there" one at five minutes out. */
export function useTrackingAlerts(
  status: BookingStatus | undefined,
  detailerFirstName: string | null,
  etaMinutes: number | null,
) {
  const previous = useRef<BookingStatus | undefined>(undefined);
  const nudged = useRef(false);
  useEffect(() => {
    if (!status) return;
    if (previous.current && previous.current !== status) {
      const a = statusAlert(status, detailerFirstName);
      if (a) showAlert(a.title, a.body);
    }
    previous.current = status;
  }, [status, detailerFirstName]);
  useEffect(() => {
    if (status === "en_route" && etaMinutes != null && etaMinutes <= 5 && !nudged.current) {
      nudged.current = true;
      showAlert(
        `${detailerFirstName ?? "Your detailer"} is nearly there`,
        "About five minutes away.",
      );
    }
  }, [status, etaMinutes, detailerFirstName]);
}

/** Puts the countdown in the browser tab, so it shows even when the page is in the background. */
export function useLiveTitle(text: string | null) {
  useEffect(() => {
    if (!text) return;
    const original = document.title;
    document.title = `${text} | True To Detail`;
    return () => {
      document.title = original;
    };
  }, [text]);
}

export function CalendarButtons({
  event,
  className,
}: {
  event: CalendarEvent;
  className?: string;
}) {
  const download = () => {
    const blob = new Blob([buildIcs(event)], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "true-to-detail-visit.ics";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <div className={cn("grid grid-cols-2 gap-2", className)}>
      <a
        href={googleCalendarUrl(event)}
        target="_blank"
        rel="noreferrer"
        className="press inline-flex min-h-11 items-center justify-center gap-2 border border-hairline text-[13px] font-semibold hover:bg-surface-2"
      >
        <CalendarPlus className="h-4 w-4" /> Google
      </a>
      <button
        type="button"
        onClick={download}
        className="press inline-flex min-h-11 items-center justify-center gap-2 border border-hairline text-[13px] font-semibold hover:bg-surface-2"
      >
        <Download className="h-4 w-4" /> Apple / Outlook
      </button>
    </div>
  );
}

/** Copy this page's link so someone at the address can follow along. */
export function ShareLink({ className }: { className?: string }) {
  const { copied, copy } = useCopyToClipboard();
  return (
    <button
      type="button"
      onClick={() => copy(window.location.href)}
      className={cn(
        "press inline-flex min-h-11 w-full items-center justify-center gap-2 border border-hairline text-[13px] font-semibold hover:bg-surface-2",
        className,
      )}
    >
      {copied ? <Check className="h-4 w-4 text-success" /> : <Link2 className="h-4 w-4" />}
      {copied ? "Copied" : "Share this page with someone at home"}
    </button>
  );
}

/** Quick things that help the visit run smoothly. We bring our own water and power. */
export function PrepList({ className }: { className?: string }) {
  const items = [
    { icon: Flag, text: "Somewhere we can park next to the car" },
    { icon: KeyRound, text: "Keys or access to the car, and any gate codes" },
    { icon: ShieldAlert, text: "Valuables and loose items taken out" },
    { icon: PawPrint, text: "Pets kept indoors while we work" },
  ];
  return (
    <section className={cn("rounded-2xl border border-hairline bg-surface p-5", className)}>
      <p className="eyebrow text-muted-foreground">Before we arrive</p>
      <p className="mt-1.5 text-[13px] text-muted-foreground">
        We bring our own water and power. Just:
      </p>
      <ul className="mt-3 flex flex-col gap-2.5">
        {items.map(({ icon: Icon, text }) => (
          <li key={text} className="flex items-start gap-3 text-[14px]">
            <Icon className="mt-0.5 h-4 w-4 shrink-0 text-signal-deep" strokeWidth={2.2} />
            {text}
          </li>
        ))}
      </ul>
    </section>
  );
}
