import { format, formatDistanceToNowStrict, isToday, isTomorrow } from "date-fns";
import { UK_TIME } from "@/lib/uk-time";

/** "Today"/"Tomorrow"/"Mon 12 Aug" + "6:30 PM", derived from a real timestamp. */
export function formatAppointment(iso: string): { dayLabel: string; timeLabel: string } {
  const date = new Date(iso);
  const dayLabel = isToday(date, { in: UK_TIME })
    ? "Today"
    : isTomorrow(date, { in: UK_TIME })
      ? "Tomorrow"
      : format(date, "EEE d MMM", { in: UK_TIME });
  return { dayLabel, timeLabel: format(date, "h:mm a", { in: UK_TIME }) };
}

/**
 * "Arriving around 6:24 PM (about 12 min away)" from a real routing
 * duration (see getTrackingEta() / AGENTS.md "No fabricated ETAs" — this
 * is the one place an ETA is allowed, because it comes from an actual
 * routing engine, not a distance/speed guess).
 */
export function formatEtaArrival(durationSeconds: number, now: number = Date.now()): string {
  const arrival = new Date(now + durationSeconds * 1000);
  const minutes = Math.max(1, Math.round(durationSeconds / 60));
  const minutesLabel = minutes === 1 ? "1 min" : `${minutes} min`;
  return `Arriving around ${format(arrival, "h:mm a", { in: UK_TIME })} (about ${minutesLabel} away)`;
}

export interface EtaStatus {
  tone: "on-track" | "behind";
  label: string;
}

// Slightly tighter than SCHEDULE_GRACE_MS below: a routing ETA is already a
// live, moving estimate of the actual drive, not a "have they even left yet"
// guess, so it doesn't need as much slack before it's fair to call it late.
const ETA_GRACE_MS = 5 * 60 * 1000;
const ETA_SIGNIFICANT_DELAY_MS = 30 * 60 * 1000;

/**
 * Once a real routing ETA is available, it's a strictly better "on track?"
 * signal than getScheduleStatus's now-vs-appointment guess below — it's
 * comparing the *actual* projected arrival time (now + a real routing
 * duration) against the appointment, instead of just checking whether the
 * clock has ticked past it yet. Still only ever compares two real
 * timestamps (see AGENTS.md "No fabricated ETAs"): the routing engine's
 * duration is real, added to the real current time, compared against the
 * real appointment time — never a distance/speed guess of its own.
 */
export function getEtaStatus(
  durationSeconds: number,
  appointmentAtIso: string,
  now: number = Date.now(),
): EtaStatus {
  const arrivalMs = now + durationSeconds * 1000;
  const lateBy = arrivalMs - new Date(appointmentAtIso).getTime();
  const arrivalLabel = formatEtaArrival(durationSeconds, now);

  if (lateBy <= ETA_GRACE_MS) {
    return { tone: "on-track", label: arrivalLabel };
  }
  const appointmentTimeLabel = format(new Date(appointmentAtIso), "h:mm a", { in: UK_TIME });
  if (lateBy <= ETA_SIGNIFICANT_DELAY_MS) {
    return {
      tone: "behind",
      label: `${arrivalLabel}, a little later than your ${appointmentTimeLabel} slot`,
    };
  }
  return {
    tone: "behind",
    label: `${arrivalLabel}, well behind your ${appointmentTimeLabel} appointment`,
  };
}

/** 1 -> "1st", 2 -> "2nd", 3 -> "3rd", 4 -> "4th", 11-13 -> "11th"/"12th"/"13th", etc. */
export function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

/** "just now" / "42 seconds ago" / "3 minutes ago", for live-location freshness. */
export function formatRelativeUpdate(iso: string | null | undefined): string {
  if (!iso) return "";
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 20) return "just now";
  return `${formatDistanceToNowStrict(new Date(iso))} ago`;
}

export interface ScheduleStatus {
  tone: "on-track" | "behind";
  label: string;
}

/**
 * How the journey compares to the scheduled appointment time when there's
 * no real routing ETA to go on yet (get-eta not deployed, unreachable, or
 * no live position) — just an honest comparison of two real clocks: now vs.
 * when the customer was told to expect the technician. Once a routing ETA
 * is available, getEtaStatus above is the better signal (it knows the
 * actual projected arrival time, not just whether the clock has passed the
 * appointment) and callers should prefer it. A short grace window absorbs
 * normal "just setting off" slack without reading as "late" the moment the
 * clock ticks past the appointment time. Past a longer threshold the
 * wording escalates — still derived only from those same two real clocks,
 * never a guessed travel time — so a customer waiting an hour isn't still
 * reading "a little behind".
 */
const SCHEDULE_GRACE_MS = 10 * 60 * 1000;
const SCHEDULE_SIGNIFICANT_DELAY_MS = 45 * 60 * 1000;

export function getScheduleStatus(
  appointmentAtIso: string,
  timeLabel: string,
  now: number = Date.now(),
): ScheduleStatus {
  const lateBy = now - new Date(appointmentAtIso).getTime();
  if (lateBy <= SCHEDULE_GRACE_MS) {
    return { tone: "on-track", label: `On track for your ${timeLabel} appointment` };
  }
  if (lateBy <= SCHEDULE_SIGNIFICANT_DELAY_MS) {
    return { tone: "behind", label: "Running a little behind schedule" };
  }
  return { tone: "behind", label: "Running well behind schedule. Thanks for your patience." };
}

/**
 * "in 42 minutes" / "started 12 minutes ago" — a plain countdown to a real
 * scheduled time, for the engineer's own queue. Same honesty rule as
 * getScheduleStatus: only ever compares two real clocks, never estimates
 * travel time.
 */
export function formatCountdownToAppointment(
  appointmentAtIso: string,
  now: number = Date.now(),
): string {
  const diffMs = new Date(appointmentAtIso).getTime() - now;
  if (diffMs <= 0) {
    return `started ${formatDistanceToNowStrict(new Date(appointmentAtIso))} ago`;
  }
  return `in ${formatDistanceToNowStrict(new Date(appointmentAtIso))}`;
}
