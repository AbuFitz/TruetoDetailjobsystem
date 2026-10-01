import { cn } from "@/lib/utils";
import { whenParts } from "@/lib/format";

/**
 * The main date treatment for a visit. On the day itself it says TODAY, and that
 * is all it says: no separate badge. On any other day it is the real date.
 */
export function DateBlock({
  iso,
  className,
  tone = "default",
}: {
  iso: string;
  className?: string;
  tone?: "default" | "onDark";
}) {
  const w = whenParts(iso);
  return (
    <span
      className={cn(
        "font-display leading-none",
        w.today && (tone === "onDark" ? "text-signal" : "text-signal-deep"),
        className,
      )}
      data-today={w.today ? "true" : undefined}
    >
      <span className="sr-only">{w.spoken}</span>
      <span aria-hidden>{w.headline}</span>
    </span>
  );
}
