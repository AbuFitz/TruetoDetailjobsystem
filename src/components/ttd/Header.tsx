import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

interface TtdLogoProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

/** Wordmark lockup: True / To / Detail, "To" in signal orange — matches truetodetail.co.uk. */
export function TtdLogo({ size = "md", className }: TtdLogoProps) {
  return (
    <span
      className={cn(
        "font-display font-normal uppercase leading-none tracking-wide",
        size === "sm" && "text-lg",
        size === "md" && "text-xl lg:text-2xl",
        size === "lg" && "text-[26px] sm:text-3xl",
        className,
      )}
    >
      <span className="text-foreground">True</span>
      <span className="text-signal"> To </span>
      <span className="text-foreground">Detail</span>
    </span>
  );
}

interface TtdHeaderProps {
  /** Small uppercase label under the wordmark, e.g. "LIVE JOB" */
  eyebrow?: string;
  right?: React.ReactNode;
  homeTo?: string;
  containerClassName?: string;
  className?: string;
}

export function TtdHeader({
  eyebrow,
  right,
  homeTo,
  containerClassName = "max-w-2xl",
  className,
}: TtdHeaderProps) {
  const inner = (
    <div className="flex min-w-0 flex-col gap-1">
      <TtdLogo />
      {eyebrow ? <span className="eyebrow pl-0 text-muted-foreground">{eyebrow}</span> : null}
    </div>
  );

  return (
    <header
      className={cn(
        "sticky top-0 z-30 border-b border-hairline bg-background/85 backdrop-blur-xl",
        className,
      )}
    >
      <div
        className={cn(
          "mx-auto grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-5 py-4 sm:px-6",
          containerClassName,
        )}
      >
        {homeTo ? (
          <Link to={homeTo} className="press min-w-0">
            {inner}
          </Link>
        ) : (
          inner
        )}
        {right ? <div className="shrink-0">{right}</div> : <span />}
      </div>
    </header>
  );
}
