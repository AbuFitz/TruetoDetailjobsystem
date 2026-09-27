/**
 * UK-only phone URL helpers — this app only ever deals with UK numbers (see
 * README), so a generic international formatter would be overkill.
 */

/** "07354 915941" -> "447354915941": wa.me needs international format, no leading 0, no '+', no spaces. */
export function ukWhatsAppNumber(localPhone: string): string {
  const digits = localPhone.replace(/\D/g, "");
  return digits.startsWith("0") ? `44${digits.slice(1)}` : digits;
}

export function whatsAppUrl(localPhone: string, message: string): string {
  return `https://wa.me/${ukWhatsAppNumber(localPhone)}?text=${encodeURIComponent(message)}`;
}

export function smsUrl(localPhone: string, message: string): string {
  const digits = localPhone.replace(/[^\d+]/g, "");
  return `sms:${digits}?body=${encodeURIComponent(message)}`;
}
