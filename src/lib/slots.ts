/**
 * Appointment slot rules, judged on UK wall-clock time whatever timezone the
 * browser runs in. Mirrors lib/slots.ts on the main site so both booking
 * flows grey out the same slots.
 */

export const TIME_SLOTS = ["8:00 AM", "10:00 AM", "12:00 PM", "2:00 PM", "4:00 PM", "6:00 PM"];

/** Minimum notice for a same-day slot, so a booking never lands after the slot has started. */
export const SAME_DAY_NOTICE_MINUTES = 60;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function ukParts(at: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
  };
}

/** Today's date (YYYY-MM-DD) and minutes past midnight, in UK time. */
export function ukNow(now: Date = new Date()): { date: string; minutes: number } {
  const p = ukParts(now);
  const pad = (n: number) => String(n).padStart(2, "0");
  return { date: `${p.year}-${pad(p.month)}-${pad(p.day)}`, minutes: p.hour * 60 + p.minute };
}

/** "2:00 PM" -> 840 (minutes past midnight). NaN if unparseable. */
export function slotMinutes(slot: string): number {
  const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(slot.trim());
  if (!m) return NaN;
  const hour = (Number(m[1]) % 12) + (m[3]!.toUpperCase() === "PM" ? 12 : 0);
  return hour * 60 + Number(m[2]);
}

export function isValidBookingDate(date: string, now: Date = new Date()): boolean {
  return DATE_RE.test(date) && !Number.isNaN(Date.parse(date)) && date >= ukNow(now).date;
}

/** True if this date and slot can still be booked right now. */
export function isSlotAvailable(date: string, slot: string, now: Date = new Date()): boolean {
  if (!isValidBookingDate(date, now)) return false;
  const today = ukNow(now);
  if (date > today.date) return true;
  return slotMinutes(slot) >= today.minutes + SAME_DAY_NOTICE_MINUTES;
}

/** First slot still bookable on this date, or null if the day is full. */
export function firstAvailableSlot(date: string, now: Date = new Date()): string | null {
  return TIME_SLOTS.find((t) => isSlotAvailable(date, t, now)) ?? null;
}

/**
 * The exact instant a UK wall-clock slot starts, as an ISO string.
 * "2026-10-10" + "2:00 PM" -> "2026-10-10T13:00:00.000Z" (BST).
 */
export function ukSlotToIso(date: string, slot: string): string {
  return ukMinutesToIso(date, slotMinutes(slot));
}

/** Same as ukSlotToIso for a 24-hour "HH:MM" time, as a time input gives. */
export function ukTimeToIso(date: string, time: string): string {
  const [h, m] = time.split(":").map(Number);
  return ukMinutesToIso(date, (h ?? 10) * 60 + (m ?? 0));
}

function ukMinutesToIso(date: string, mins: number): string {
  const [y, mo, d] = date.split("-").map(Number) as [number, number, number];
  const guess = Date.UTC(y, mo - 1, d, Math.floor(mins / 60), mins % 60);
  // How far UK time is ahead of UTC at that moment (0 in winter, 60 min in summer).
  const p = ukParts(new Date(guess));
  const offset = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - guess;
  return new Date(guess - offset).toISOString();
}

/** "2026-10-10" -> "Saturday 10 October 2026". */
export function formatBookingDate(date: string): string {
  if (!DATE_RE.test(date)) return date;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).formatToParts(new Date(`${date}T00:00:00Z`));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("weekday")} ${get("day")} ${get("month")} ${get("year")}`;
}

/** "2026-10-10" -> "Sat 10 Oct", for tight summary rows. */
export function formatShortDate(date: string): string {
  if (!DATE_RE.test(date)) return date;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    weekday: "short",
    day: "numeric",
    month: "short",
  }).formatToParts(new Date(`${date}T00:00:00Z`));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("weekday")} ${get("day")} ${get("month")}`;
}
