import { MessageCircle, Phone } from "lucide-react";
import { cn } from "@/lib/utils";

function digitsAndPlus(phone: string): string {
  return phone.replace(/[^\d+]/g, "");
}

/** Call + text buttons for a phone number — renders nothing when there isn't one. */
export function ContactActions({
  phone,
  label,
  className,
}: {
  phone: string | null | undefined;
  /** Who this number reaches, e.g. "your detailer" or "the customer" — used only for aria-labels. */
  label: string;
  className?: string;
}) {
  if (!phone) return null;
  const number = digitsAndPlus(phone);

  return (
    <div className={cn("flex gap-2", className)}>
      <a
        href={`tel:${number}`}
        aria-label={`Call ${label}`}
        className="press inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border border-hairline bg-surface-2 text-[13px] font-semibold hover:bg-surface"
      >
        <Phone className="h-3.5 w-3.5" strokeWidth={2.2} />
        Call
      </a>
      <a
        href={`sms:${number}`}
        aria-label={`Text ${label}`}
        className="press inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border border-hairline bg-surface-2 text-[13px] font-semibold hover:bg-surface"
      >
        <MessageCircle className="h-3.5 w-3.5" strokeWidth={2.2} />
        Text
      </a>
    </div>
  );
}
