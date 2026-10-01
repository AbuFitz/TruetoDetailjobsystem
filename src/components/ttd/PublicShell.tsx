import { TtdLogo } from "@/components/ttd/Header";
import { ThemeToggle } from "@/components/ttd/ThemeToggle";
import { useStillPage } from "@/hooks/use-still";
import { LegalLinks } from "@/components/ttd/LegalLinks";
import { ttdSiteLinks } from "@/lib/constants";
import { cn } from "@/lib/utils";

/**
 * Front-door frame for pages people reach without signing in: the sign-in
 * look (dark hero flowing into a light sheet), used by tracking, account
 * creation and password pages. The wordmark goes to the main website, and
 * appears once.
 */
export function PublicShell({
  eyebrow,
  title,
  subtitle,
  children,
  width = "narrow",
}: {
  eyebrow?: string;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  width?: "narrow" | "wide";
}) {
  useStillPage();
  return (
    <main className="relative flex min-h-screen flex-col bg-ink text-ink-foreground">
      <ThemeToggle className="absolute right-5 top-5 z-10 border-white/15 bg-white/5 text-ink-foreground/70 hover:text-ink-foreground" />
      <div className="mx-auto w-full max-w-6xl px-6 pb-12 pt-14 sm:px-10 sm:pt-16">
        <a
          href={ttdSiteLinks.website}
          aria-label="True To Detail, home"
          className="press inline-block"
        >
          <TtdLogo size="lg" tone="light" />
        </a>
        {eyebrow ? <p className="eyebrow mt-9 text-ink-foreground/55">{eyebrow}</p> : null}
        <h1 className="mt-2 font-display text-[48px] leading-[0.9] sm:text-[64px] lg:text-[72px]">
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-ink-foreground/60">
            {subtitle}
          </p>
        ) : null}
      </div>
      <div className="flex-1 rounded-t-3xl bg-background px-6 pb-12 pt-8 text-foreground sm:px-10">
        <div className={cn("mx-auto w-full", width === "narrow" ? "max-w-md" : "max-w-6xl")}>
          {children}
          <LegalLinks className="mt-8" />
        </div>
      </div>
    </main>
  );
}

/** Same field look as the sign-in page (the main site's booking form). */
export function AuthField({
  id,
  label,
  hint,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { id: string; label: string; hint?: string }) {
  return (
    <div>
      <label
        htmlFor={id}
        className="block text-[10px] font-semibold uppercase tracking-[0.2em] text-foreground/60"
      >
        {label}
      </label>
      <input
        id={id}
        className="mt-2.5 w-full border border-black/12 bg-white px-4 py-3.5 text-base text-ink outline-none transition-colors focus:border-signal"
        {...props}
      />
      {hint ? <p className="mt-1.5 text-[12px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
