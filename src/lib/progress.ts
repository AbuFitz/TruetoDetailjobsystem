/**
 * The customer sees five steps, whatever the detailer's own checklist looks
 * like. Legacy statuses (check-in, QC, handover) fold into "Detailing".
 */
import type { BookingStatus } from "./bookings";

export const CUSTOMER_STEPS = [
  { key: "booked", label: "Booked" },
  { key: "detailer", label: "Detailer set" },
  { key: "on_the_way", label: "On the way" },
  { key: "detailing", label: "Detailing" },
  { key: "done", label: "Done" },
] as const;

export type CustomerStepKey = (typeof CUSTOMER_STEPS)[number]["key"];

/** Index of the step the booking is on now, or -1 for a cancelled one. */
export function customerStepIndex(status: BookingStatus): number {
  switch (status) {
    case "requested":
      return -0.5;
    case "confirmed":
      return 0;
    case "assigned":
      return 1;
    case "en_route":
      return 2;
    case "arrived":
    case "check_in":
    case "in_progress":
    case "qc":
    case "handover":
      return 3;
    case "completed":
      return 4;
    case "cancelled":
      return -1;
  }
}

/** One sentence for what is happening right now, in the customer's voice. */
export function customerHeadline(status: BookingStatus, detailerFirstName?: string | null): string {
  const who = detailerFirstName || "Your detailer";
  switch (status) {
    case "requested":
      return "We are checking your slot";
    case "confirmed":
      return "You are booked in";
    case "assigned":
      return `${who} is lined up for you`;
    case "en_route":
      return `${who} is on the way`;
    case "arrived":
      return `${who} has arrived`;
    case "check_in":
    case "in_progress":
    case "qc":
    case "handover":
      return `${who} is detailing your car`;
    case "completed":
      return "All done. Enjoy the finish";
    case "cancelled":
      return "This booking was cancelled";
  }
}

/** "12 min", "1 hr 5 min" from a number of seconds. */
export function formatDuration(seconds: number): string {
  const mins = Math.max(1, Math.round(seconds / 60));
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} hr ${m} min` : `${h} hr`;
}
