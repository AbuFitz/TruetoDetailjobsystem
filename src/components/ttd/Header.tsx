import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

interface TtdLogoProps {
  size?: "sm" | "md" | "lg" | "xl";
  /** "auto" (default) follows the surrounding text colour; "light" forces white text for dark surfaces. */
  tone?: "auto" | "light";
  className?: string;
}

/**
 * The real truetodetail.co.uk wordmark: "TRUE TO" + a small orange pill/dot
 * + "DETAIL", set in the display font (Bebas Neue) with slight letter
 * spacing, reproduced from components/Navbar.tsx on the marketing site, not
 * a "True / To / Detail" text split. Keep this in sync if the marketing
 * site's Navbar ever changes its logo markup. "xl" matches that Navbar's own
 * unscrolled size (clamp(26px, 4vw, 46px)) for pages like /account/login and
 * /admin/login that should feel like the real site's front door.
 */
export function TtdLogo({ size = "md", tone = "auto", className }: TtdLogoProps) {
  const textColor = tone === "light" ? "text-white" : "text-foreground";
  return (
    <span
      className={cn(
        "inline-flex items-baseline font-display font-normal leading-none",
        size === "sm" && "text-lg gap-[6px]",
        size === "md" && "text-xl gap-[7px] lg:text-2xl",
        size === "lg" && "text-[26px] gap-2 sm:text-3xl",
        size === "xl" && "text-[32px] gap-2.5 sm:text-[46px]",
        className,
      )}
    >
      <span className={cn("uppercase tracking-[0.06em]", textColor)}>True to</span>
      <span
        aria-hidden
        className="mb-[1px] inline-block h-[0.42em] w-[0.22em] shrink-0 rounded-[50%/55%] bg-signal"
      />
      <span className={cn("uppercase tracking-[0.06em]", textColor)}>Detail</span>
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
