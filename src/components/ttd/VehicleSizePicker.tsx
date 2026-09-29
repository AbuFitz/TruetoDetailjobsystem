import { cn } from "@/lib/utils";
import {
  VEHICLE_SIZE_GUIDE,
  VEHICLE_SIZE_LABELS,
  VEHICLE_SIZE_NOTE,
  type VehicleSize,
} from "@/lib/constants";

/**
 * The one vehicle size control, used by the booking popup, /book and the admin
 * booking form, so every form asks the same question the same way, with the
 * same UK wording as the website. Three compact tiles side by side; the example
 * cars for the chosen size sit underneath so the form stays short.
 */
export function VehicleSizePicker({
  value,
  onChange,
  tone = "signal",
  className,
}: {
  value: VehicleSize | "" | null;
  onChange: (size: VehicleSize) => void;
  tone?: "signal" | "ink";
  className?: string;
}) {
  const sizes = Object.keys(VEHICLE_SIZE_LABELS) as VehicleSize[];
  return (
    <div className={className}>
      <div role="radiogroup" aria-label="Vehicle size" className="grid grid-cols-3 gap-1.5">
        {sizes.map((size) => {
          const selected = value === size;
          return (
            <button
              key={size}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(size)}
              className={cn(
                "press flex min-h-[72px] flex-col items-start justify-between gap-1 rounded-xl border px-2.5 py-2.5 text-left transition-colors",
                selected
                  ? tone === "ink"
                    ? "border-ink bg-ink text-ink-foreground"
                    : "border-signal bg-signal text-signal-foreground"
                  : "border-input bg-surface-2 hover:bg-surface",
              )}
            >
              <span className="text-[12px] font-semibold leading-tight">
                {VEHICLE_SIZE_LABELS[size]}
              </span>
              <span
                className={cn(
                  "text-[10.5px] leading-tight",
                  selected ? "opacity-85" : "text-muted-foreground",
                )}
              >
                {VEHICLE_SIZE_GUIDE[size].body}
              </span>
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
        {value && value in VEHICLE_SIZE_GUIDE
          ? `e.g. ${VEHICLE_SIZE_GUIDE[value as VehicleSize].examples}. ${VEHICLE_SIZE_NOTE}`
          : VEHICLE_SIZE_NOTE}
      </p>
    </div>
  );
}
