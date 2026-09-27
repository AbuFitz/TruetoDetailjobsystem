import { cn } from "@/lib/utils";

/** Shared branded loading state — used anywhere we're waiting on Supabase. */
export function BrandedLoading({
  label = "Loading",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex min-h-[50vh] flex-col items-center justify-center gap-3 px-5 text-center",
        className,
      )}
    >
      <span
        className="h-8 w-8 animate-spin rounded-full border-2 border-hairline border-t-signal"
        aria-hidden
      />
      <p className="eyebrow text-muted-foreground">{label}</p>
    </div>
  );
}
