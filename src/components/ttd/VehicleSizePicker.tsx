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
 * same UK examples as the website.
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
  return (
    <div className={className}>
      <div role="radiogroup" aria-label="Vehicle size" className="flex flex-col gap-1.5">
        {(Object.keys(VEHICLE_SIZE_LABELS) as VehicleSize[]).map((size) => {
          const selected = value === size;
          return (
            <button
              key={size}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(size)}
              className={cn(
                "press flex w-full flex-col gap-0.5 rounded-xl border px-3.5 py-3 text-left transition-colors",
                selected
                  ? tone === "ink"
                    ? "border-ink bg-ink text-ink-foreground"
                    : "border-signal bg-signal text-signal-foreground"
                  : "border-input bg-surface-2 hover:bg-surface",
              )}
            >
              <span className="text-[13px] font-semibold">
                {VEHICLE_SIZE_LABELS[size]}{" "}
                <span
                  className={cn("font-normal", selected ? "opacity-80" : "text-muted-foreground")}
                >
                  · {VEHICLE_SIZE_GUIDE[size].body}
                </span>
              </span>
              <span
                className={cn("text-[12px]", selected ? "opacity-75" : "text-muted-foreground")}
              >
                e.g. {VEHICLE_SIZE_GUIDE[size].examples}
              </span>
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">{VEHICLE_SIZE_NOTE}</p>
    </div>
  );
}
