import { RefreshCw, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { PrimaryActionButton } from "./PrimaryActionButton";

export function ErrorState({
  title = "Something went wrong",
  description,
  onRetry,
  className,
}: {
  title?: string;
  description?: string | undefined;
  onRetry?: (() => void) | undefined;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center rounded-xl border border-destructive/25 bg-destructive/5 px-6 py-10 text-center",
        className,
      )}
    >
      <span className="grid h-11 w-11 place-items-center rounded-full bg-destructive/10 text-destructive">
        <TriangleAlert className="h-5 w-5" strokeWidth={2} />
      </span>
      <p className="mt-3 font-display text-lg font-semibold">{title}</p>
      {description ? (
        <p className="mt-1 max-w-xs text-sm text-muted-foreground">{description}</p>
      ) : null}
      {onRetry ? (
        <PrimaryActionButton
          size="md"
          variant="outline"
          className="mt-4 w-auto px-5"
          onClick={onRetry}
        >
          <RefreshCw className="h-4 w-4" strokeWidth={2.2} />
          Try again
        </PrimaryActionButton>
      ) : null}
    </div>
  );
}
