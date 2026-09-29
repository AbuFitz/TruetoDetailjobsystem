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
        <span className="grid h-10 w-10 shrink-0 place-items-center bg-surface-2 text-foreground">
          <Car className="h-5 w-5" strokeWidth={2} />
        </span>
      ) : null}
      <div className="min-w-0">
        {vehicle.description ? (
          <p className="truncate text-[15px] font-medium leading-tight">{vehicle.description}</p>
        ) : null}
        <p className={vehicle.description ? "mt-1" : undefined}>
          <PlateTag registration={vehicle.registration} />
        </p>
      </div>
    </div>
  );
}

/**
 * A UK number plate: yellow rear plate, the blue GB band, and the display
 * font with a little tracking so it reads like the real thing and like the
 * rest of the website's type.
 */
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
        "inline-flex items-stretch overflow-hidden rounded-[5px] border border-ink/25 bg-[#F5CF00] align-middle shadow-[0_1px_0_rgba(12,12,12,0.12)]",
        className,
      )}
    >
      <span
        className="grid w-[15px] place-items-center bg-[#0B3EA8] text-[6px] font-semibold leading-none tracking-wide text-white"
        aria-hidden
      >
        GB
      </span>
      <span className="px-2 py-[3px] font-display text-[19px] uppercase leading-[1.05] tracking-[0.1em] text-ink">
        {registration}
      </span>
    </span>
  );
}
