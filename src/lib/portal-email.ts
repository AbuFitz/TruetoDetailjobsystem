/**
 * Asks the website's email service to send a booking email. Who may send
 * which email is decided by the database (claim_booking_email), using the
 * caller's own sign-in or detailer link, and each email is recorded so it can
 * only go out once. Never throws: the job matters more than the email, and
 * staff can resend from the booking page.
 */
import { supabase } from "./supabase";
import { ttdSiteLinks } from "./constants";

export type BookingEmailKind =
  "received" | "staff_alert" | "booked_in" | "assigned" | "on_the_way" | "completed" | "cancelled";

export interface EmailResult {
  sent: boolean;
  reason?: string | undefined;
  /** True only when the team's own notice of a new portal booking really went out. */
  staffNotified?: boolean | undefined;
}

const ENDPOINT = `${(import.meta.env["VITE_MAIN_SITE_URL"] as string | undefined) ?? ttdSiteLinks.website}/api/portal-email`;

export async function sendBookingEmail(
  bookingId: string,
  kind: BookingEmailKind,
  options: { detailerToken?: string; force?: boolean } = {},
): Promise<EmailResult> {
  try {
    const { data } = await supabase.auth.getSession();
    const jwt = data.session?.access_token;
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
      },
      body: JSON.stringify({
        bookingId,
        kind,
        detailerToken: options.detailerToken,
        force: options.force,
      }),
    });
    const body = (await res.json().catch(() => ({}))) as {
      sent?: boolean;
      reason?: string;
      error?: string;
      staffNotified?: boolean;
    };
    if (!res.ok)
      return {
        sent: false,
        reason: body.error ?? `Email service returned ${res.status}`,
        staffNotified: body.staffNotified === true,
      };
    return {
      sent: Boolean(body.sent),
      reason: body.reason,
      staffNotified: body.staffNotified === true,
    };
  } catch {
    return { sent: false, reason: "The email service could not be reached." };
  }
}
