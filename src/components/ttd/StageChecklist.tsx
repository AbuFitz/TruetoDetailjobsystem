import { useEffect, useRef, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DETAIL_STAGE_KEYS,
  DETAIL_STAGE_LABELS,
  STAGE_DISPLAY_ORDER,
  type DetailStageKey,
} from "@/lib/constants";
import type { StageProgress } from "@/lib/detailers";

/**
 * The lightweight "Detailing" sub-status: four ticks, done, current, to do.
 *
 * Read-only (customer dashboard) or interactive (detailer job screen) —
 * same visual language either way, toggling stages just adds tap targets
 * and a pending spinner state.
 */
export function StageChecklist({
  stages,
  interactive = false,
  pendingStage,
  onToggle,
  className,
}: {
  stages: StageProgress[];
  interactive?: boolean;
  pendingStage?: DetailStageKey | null;
  onToggle?: (stageKey: DetailStageKey, completed: boolean) => void;
  className?: string;
}) {
  const byKey = new Map<string, StageProgress>(stages.map((s) => [s.stage_key, s]));
  const orderedKeys: string[] = stages.length
    ? STAGE_DISPLAY_ORDER.filter((k) => byKey.has(k as DetailStageKey))
    : [...DETAIL_STAGE_KEYS];
  const firstIncompleteIdx = orderedKeys.findIndex((k) => !byKey.get(k)?.completed_at);
  const doneCount = orderedKeys.filter((k) => byKey.get(k)?.completed_at).length;
  // Ticks that were already done when the list appeared stay still; only a stage
  // that turns done while this is on screen pops.
  const doneKeys = orderedKeys.filter((k) => byKey.get(k)?.completed_at).join("|");
  const seenDone = useRef<Set<string> | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  useEffect(() => {
    const now = new Set(doneKeys ? doneKeys.split("|") : []);
    if (seenDone.current) {
      const added = [...now].filter((k) => !seenDone.current!.has(k));
      if (added.length) setFresh(new Set(added));
    }
    seenDone.current = now;
  }, [doneKeys]);

  return (
    <div className={className}>
      {interactive ? (
        <div className="mb-2 flex items-center gap-3 px-1.5">
          <div
            role="progressbar"
            aria-label="Detail stages done"
            aria-valuemin={0}
            aria-valuemax={orderedKeys.length}
            aria-valuenow={doneCount}
            className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2"
          >
            <div
              className="h-full origin-left rounded-full bg-success"
              style={{
                transform: `scaleX(${orderedKeys.length ? doneCount / orderedKeys.length : 0})`,
                transition: "transform 500ms var(--ease-out)",
              }}
            />
          </div>
          <span className="text-[12px] font-semibold tabular-nums text-muted-foreground">
            {doneCount} of {orderedKeys.length}
          </span>
        </div>
      ) : null}
      <ul className="flex flex-col gap-1">
        {orderedKeys.map((key, i) => {
          const done = Boolean(byKey.get(key)?.completed_at);
          const active = !done && i === firstIncompleteIdx;
          const pending = (pendingStage as string | null | undefined) === key;
          const label = DETAIL_STAGE_LABELS[key] ?? key;

          const row = (
            <>
              <span
                className={cn(
                  "grid h-5 w-5 shrink-0 place-items-center rounded-full border text-[10px] font-bold transition-colors",
                  done && "border-success bg-success text-success-foreground",
                  active && !done && "border-signal-deep/40 bg-signal text-signal-foreground",
                  !done && !active && "border-hairline bg-surface-2 text-transparent",
                )}
                aria-hidden
              >
                {pending ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : done ? (
                  <Check className={cn("h-3 w-3", fresh.has(key) && "pop-in")} strokeWidth={3} />
                ) : active ? (
                  <span className="h-1.5 w-1.5 rounded-full bg-signal-foreground" />
                ) : (
                  <span className="h-1.5 w-1.5 rounded-full bg-border" />
                )}
              </span>
              <span
                className={cn(
                  "text-[14px] leading-tight",
                  done
                    ? "text-foreground"
                    : active
                      ? "font-semibold text-foreground"
                      : "text-muted-foreground",
                )}
              >
                {label}
              </span>
            </>
          );

          if (interactive && onToggle) {
            return (
              <li key={key}>
                <button
                  type="button"
                  disabled={Boolean(pendingStage)}
                  onClick={() => onToggle(key as DetailStageKey, !done)}
                  className="press flex w-full items-center gap-2.5 px-1.5 py-1.5 text-left hover:bg-surface-2 disabled:opacity-60"
                >
                  {row}
                </button>
              </li>
            );
          }

          return (
            <li key={key} className="flex items-center gap-2.5 px-1.5 py-1.5">
              {row}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
