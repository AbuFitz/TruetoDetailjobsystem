/**
 * In-browser alerts for the tracking page. While the page is open (even in
 * another tab or behind another app) the customer gets a notification when
 * their detailer sets off, is nearly there, arrives and finishes. These are
 * local to the browser: nothing is sent from a server, so a fully closed page
 * cannot alert.
 */
import type { BookingStatus } from "./bookings";

const KEY = "ttd_track_alerts";

export type AlertPermission = "unsupported" | "default" | "denied" | "granted";

export function alertPermission(): AlertPermission {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission;
}

export function alertsEnabled(): boolean {
  try {
    return alertPermission() === "granted" && localStorage.getItem(KEY) !== "off";
  } catch {
    return alertPermission() === "granted";
  }
}

export async function enableAlerts(): Promise<AlertPermission> {
  if (alertPermission() === "unsupported") return "unsupported";
  const result = await Notification.requestPermission();
  try {
    localStorage.setItem(KEY, result === "granted" ? "on" : "off");
  } catch {
    /* storage may be blocked; the permission itself still applies */
  }
  return result;
}

export function disableAlerts(): void {
  try {
    localStorage.setItem(KEY, "off");
  } catch {
    /* ignore */
  }
}

/** What to say when the status changes, or null when the change is not worth a buzz. */
export function statusAlert(
  next: BookingStatus,
  detailerFirstName?: string | null,
): { title: string; body: string } | null {
  const who = detailerFirstName || "Your detailer";
  switch (next) {
    case "en_route":
      return { title: `${who} is on the way`, body: "Open this page to follow them live." };
    case "arrived":
      return { title: `${who} has arrived`, body: "Your detail is about to start." };
    case "completed":
      return { title: "All done", body: "Your visit is finished. Enjoy the finish." };
    case "cancelled":
      return { title: "Your booking was cancelled", body: "Open this page for details." };
    default:
      return null;
  }
}

export function showAlert(title: string, body: string): void {
  if (!alertsEnabled()) return;
  try {
    const n = new Notification(title, { body, icon: "/icons/icon-192.png", tag: "ttd-tracking" });
    n.onclick = () => {
      window.focus();
      n.close();
    };
    if ("vibrate" in navigator) navigator.vibrate?.(120);
  } catch {
    // Some mobile browsers only allow notifications through a service worker.
  }
}
