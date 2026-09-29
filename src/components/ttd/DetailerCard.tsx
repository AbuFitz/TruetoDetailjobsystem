import { BadgeCheck, Car } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar } from "./Avatar";
import { ContactActions } from "./ContactActions";

export interface DetailerCardPerson {
  name: string;
  /** e.g. "Senior Detailer" — optional, never shown when unset. */
  role?: string | null;
}

export function DetailerCard({
  detailer,
  subtitle,
  photoUrl,
  vehicleDescription,
  phone,
  className,
}: {
  detailer: DetailerCardPerson;
  subtitle?: string;
  photoUrl?: string | null;
  vehicleDescription?: string | null;
  phone?: string | null;
  className?: string;
}) {
  const subtitleLine = [detailer.role, subtitle].filter(Boolean).join(" · ");

  return (
    <div
      className={cn(
        "flex flex-col gap-3.5 rounded-2xl border border-hairline bg-surface p-3.5",
        className,
      )}
    >
      <div className="flex items-start gap-3.5">
        <div className="relative shrink-0">
          <Avatar name={detailer.name} photoUrl={photoUrl} />
          <span className="absolute -bottom-0.5 -right-0.5 grid h-5 w-5 place-items-center rounded-full border-2 border-surface bg-signal">
            <BadgeCheck className="h-3 w-3 text-signal-foreground" strokeWidth={2.6} />
          </span>
        </div>
        <div className="min-w-0 pt-0.5">
          <p className="truncate font-display text-lg font-semibold leading-tight">
            {detailer.name}
          </p>
          {subtitleLine ? (
            <p className="truncate text-[13px] text-muted-foreground">{subtitleLine}</p>
          ) : null}
          {vehicleDescription ? (
            <p className="mt-1.5 flex items-center gap-1.5 text-[13px] text-muted-foreground">
              <Car className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
              <span className="truncate">{vehicleDescription}</span>
            </p>
          ) : null}
        </div>
      </div>
      <ContactActions phone={phone} label="your detailer" />
    </div>
  );
}
