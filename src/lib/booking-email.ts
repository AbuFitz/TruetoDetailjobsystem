/**
 * What the booking request screen says about the emails, decided from what
 * actually happened. It only ever claims what is true: the customer is told the
 * confirmation of their request was emailed only if it was, and is told the
 * team knows about it only if the team's own notice really went out.
 */
export interface EmailOutcome {
  sent: boolean;
  staffNotified?: boolean | undefined;
}

export interface ConfirmationNotice {
  tone: "ok" | "warn";
  text: string;
}

export function confirmationNotice(
  outcome: EmailOutcome | null,
  customerEmail: string | null | undefined,
): ConfirmationNotice | null {
  if (!outcome) return null;
  if (outcome.sent) {
    return {
      tone: "ok",
      text: customerEmail
        ? `Confirmation emailed to ${customerEmail}`
        : "Confirmation emailed to you",
    };
  }
  return {
    tone: "warn",
    text:
      "We could not send your confirmation email just now. Your request is saved and is in your account." +
      (outcome.staffNotified
        ? " We have been told about it."
        : " If you do not hear from us, call or WhatsApp and we will pick it up."),
  };
}
