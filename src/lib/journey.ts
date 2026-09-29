/**
 * What the customer's tracking page can say about how the visit has gone so
 * far: a timestamped journey log, a finish estimate while the detailing is
 * under way, and how far through the checklist the detailer is. Everything
 * here comes from real timestamps and ticks, never a guess.
 */
import type { TrackedBooking } from "./tracking";
import { DETAIL_STAGE_LABELS, STAGE_DISPLAY_ORDER } from "./constants";

export interface JourneyEvent {
  key: "booked" | "on_the_way" | "arrived" | "detailing" | "done" | "cancelled";
  label: string;
  /** ISO timestamp, or null while it has not happened yet. */
  at: string | null;
}

type JourneyInput = Pick<
  TrackedBooking,
  | "status"
  | "created_at"
  | "en_route_at"
  | "arrived_at"
  | "in_progress_at"
  | "completed_at"
  | "cancelled_at"
>;

/** The visit in order. Steps that have not happened yet come back with `at: null`. */
export function journeyEvents(t: JourneyInput, detailerFirstName?: string | null): JourneyEvent[] {
  const who = detailerFirstName || "Your detailer";
  if (t.status === "cancelled") {
    return [
      { key: "booked", label: "Booking made", at: t.created_at },
      { key: "cancelled", label: "Cancelled", at: t.cancelled_at },
    ];
  }
  return [
    { key: "booked", label: "Booking made", at: t.created_at },
    { key: "on_the_way", label: `${who} set off`, at: t.en_route_at },
    { key: "arrived", label: `${who} arrived`, at: t.arrived_at },
    { key: "detailing", label: "Detailing started", at: t.in_progress_at ?? null },
    { key: "done", label: "Finished", at: t.completed_at },
  ];
}

/** When the detailing should wrap up, from when it began plus the booked duration. */
export function estimatedFinish(
  t: Pick<
    TrackedBooking,
    "status" | "arrived_at" | "in_progress_at" | "estimated_duration_minutes"
  >,
): Date | null {
  if (!["arrived", "check_in", "in_progress", "qc", "handover"].includes(t.status)) return null;
  const began = t.in_progress_at ?? t.arrived_at;
  if (!began || !(t.estimated_duration_minutes > 0)) return null;
  return new Date(new Date(began).getTime() + t.estimated_duration_minutes * 60_000);
}

export interface ChecklistProgress {
  done: number;
  total: number;
  /** 0-100 */
  percent: number;
  /** Label of the first stage still to do, or null once every stage is ticked. */
  current: string | null;
}

export function checklistProgress(stages: { key: string; done: boolean }[]): ChecklistProgress {
  const ordered = [...stages].sort(
    (a, b) => STAGE_DISPLAY_ORDER.indexOf(a.key) - STAGE_DISPLAY_ORDER.indexOf(b.key),
  );
  const done = ordered.filter((s) => s.done).length;
  const next = ordered.find((s) => !s.done);
  return {
    done,
    total: ordered.length,
    percent: ordered.length ? Math.round((done / ordered.length) * 100) : 0,
    current: next ? (DETAIL_STAGE_LABELS[next.key] ?? null) : null,
  };
}

/** Minutes on site, once the visit is finished. */
export function timeOnSiteMinutes(
  t: Pick<TrackedBooking, "arrived_at" | "completed_at">,
): number | null {
  if (!t.arrived_at || !t.completed_at) return null;
  const mins = Math.round(
    (new Date(t.completed_at).getTime() - new Date(t.arrived_at).getTime()) / 60_000,
  );
  return mins > 0 ? mins : null;
}
