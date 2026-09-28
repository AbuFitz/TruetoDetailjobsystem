import { cn } from "@/lib/utils";
import { ttdSiteLinks } from "@/lib/constants";

/** Terms / Privacy / Cookies, all pointing back at the marketing site, which owns the actual legal pages. */
export function LegalLinks({ className }: { className?: string }) {
  return (
    <p
      className={cn(
        "flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground",
        className,
      )}
    >
      <a href={ttdSiteLinks.terms} className="hover:text-foreground">
        Terms
      </a>
      <span aria-hidden>·</span>
      <a href={ttdSiteLinks.privacy} className="hover:text-foreground">
        Privacy
      </a>
      <span aria-hidden>·</span>
      <a href={ttdSiteLinks.cookies} className="hover:text-foreground">
        Cookies
      </a>
    </p>
  );
}
