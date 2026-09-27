import { Car } from "lucide-react";
import { cn } from "@/lib/utils";

export interface VehicleTagVehicle {
  description?: string | null;
  registration: string;
}

/** UK number plate treatment + vehicle line. */
export function VehicleCard({
  vehicle,
  className,
  compact = false,
}: {
  vehicle: VehicleTagVehicle;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3",
        !compact && "rounded-xl border border-hairline bg-surface p-3.5",
        className,
      )}
    >
      {!compact ? (
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-surface-2 text-foreground">
          <Car className="h-5 w-5" strokeWidth={2} />
        </span>
      ) : null}
      <div className="min-w-0">
        {vehicle.description ? (
          <p className="truncate text-[15px] font-semibold leading-tight">{vehicle.description}</p>
        ) : null}
        <p className={vehicle.description ? "mt-1" : undefined}>
          <PlateTag registration={vehicle.registration} />
        </p>
      </div>
    </div>
  );
}

export function PlateTag({
  registration,
  className,
}: {
  registration: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-[5px] border border-ink/15 bg-[#f4d000]/90 px-2 py-0.5",
        className,
      )}
    >
      <span className="h-3.5 w-[7px] rounded-[2px] bg-[#0b3ea8]" aria-hidden />
      <span className="font-display text-sm font-bold uppercase tracking-[0.08em] text-ink">
        {registration}
      </span>
    </span>
  );
}
