import { Link, useRouterState } from "@tanstack/react-router";
import {
  CalendarPlus,
  Car,
  ChevronLeft,
  ClipboardList,
  HardHat,
  LogOut,
  Plus,
  Settings,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";
import { TtdLogo } from "@/components/ttd/Header";
import { LegalLinks } from "@/components/ttd/LegalLinks";
import { ThemeToggle } from "@/components/ttd/ThemeToggle";
import { signOut } from "@/lib/auth";
import { ttdSiteLinks } from "@/lib/constants";
import { cn } from "@/lib/utils";

/**
 * One page frame for the whole signed-in portal, built the same way as the
 * main website: a solid ink bar with the wordmark and text links, a big
 * display-font hero that flows into a light sheet, a full-width content area
 * (max 1152px like the site) and a slim footer. On phones the links move to
 * a bottom tab bar so everything is one thumb away.
 *
 * The wordmark always goes to the portal home for that area, on every page
 * and every step, and appears exactly once per page.
 */
export type ShellArea = "customer" | "admin";

interface NavItem {
  to: string;
  label: string;
  short?: string;
  icon: LucideIcon;
  /** Path prefixes that light this item up. */
  match: string[];
  exact?: boolean;
}

const CUSTOMER_NAV: NavItem[] = [
  {
    to: "/account",
    label: "My Account",
    short: "Account",
    icon: UserRound,
    match: ["/account"],
    exact: true,
  },
  { to: "/book", label: "Book a detail", short: "Book", icon: CalendarPlus, match: ["/book"] },
  { to: "/account/vehicles", label: "Garage", icon: Car, match: ["/account/vehicles"] },
];

const CUSTOMER_SETTINGS: NavItem = {
  to: "/account/settings",
  label: "Settings",
  icon: Settings,
  match: ["/account/settings", "/account/details", "/account/addresses"],
};

const ADMIN_NAV: NavItem[] = [
  { to: "/admin", label: "Today", icon: ClipboardList, match: ["/admin"], exact: true },
  { to: "/admin/customers", label: "Customers", icon: Users, match: ["/admin/customers"] },
  { to: "/admin/detailers", label: "Detailers", icon: HardHat, match: ["/admin/detailers"] },
];

const ADMIN_SETTINGS: NavItem = {
  to: "/admin/settings",
  label: "Settings",
  icon: Settings,
  match: ["/admin/settings"],
};

const HOME: Record<ShellArea, string> = { customer: "/account", admin: "/admin" };

function isActive(path: string, item: NavItem): boolean {
  if (item.exact) return path === item.to || path === `${item.to}/`;
  return item.match.some((m) => path === m || path.startsWith(`${m}/`));
}

interface AppShellProps {
  area: ShellArea;
  eyebrow?: string;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Buttons that sit to the right of the title on desktop and under it on phones. */
  actions?: React.ReactNode;
  back?: { to: string; label: string; params?: Record<string, string> };
  /** "narrow" for forms and single records, "wide" (default) for dashboards and lists. */
  width?: "narrow" | "medium" | "wide";
  /**
   * A living surface behind the hero (the customer portal's paint). It fills the
   * hero, which then keeps a fixed height so the page does not jump when it loads.
   */
  stage?: React.ReactNode;
  children: React.ReactNode;
}

export function AppShell({
  area,
  eyebrow,
  title,
  subtitle,
  actions,
  back,
  width = "wide",
  stage,
  children,
}: AppShellProps) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const nav = area === "admin" ? ADMIN_NAV : CUSTOMER_NAV;
  const home = HOME[area];

  const settings = area === "admin" ? ADMIN_SETTINGS : CUSTOMER_SETTINGS;
  const tabs: NavItem[] =
    area === "admin"
      ? [
          ...ADMIN_NAV,
          { to: "/admin/bookings/new", label: "New", icon: Plus, match: ["/admin/bookings/new"] },
          settings,
        ]
      : [...CUSTOMER_NAV, settings];

  return (
    <div className="flex min-h-screen flex-col bg-ink">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-ink text-ink-foreground">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-6 px-5 py-3.5 sm:px-8">
          <Link to={home} aria-label="True To Detail, home" className="press shrink-0">
            <TtdLogo tone="light" size="md" />
          </Link>

          <nav aria-label="Main" className="hidden flex-1 items-center gap-1 lg:flex">
            {nav.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "px-3 py-2 text-[12px] font-semibold uppercase tracking-[0.14em] transition-colors",
                  isActive(path, item)
                    ? "text-white"
                    : "text-ink-foreground/55 hover:text-ink-foreground",
                )}
                aria-current={isActive(path, item) ? "page" : undefined}
              >
                {item.label}
                {isActive(path, item) ? (
                  <span className="mt-1 block h-[2px] bg-signal" aria-hidden />
                ) : (
                  <span className="mt-1 block h-[2px]" aria-hidden />
                )}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            {area === "admin" ? (
              <Link
                to="/admin/bookings/new"
                className="press hidden min-h-9 items-center gap-1.5 bg-signal px-4 text-[11px] font-bold uppercase tracking-[0.12em] text-signal-foreground hover:bg-signal-deep lg:inline-flex"
              >
                <Plus className="h-3.5 w-3.5" strokeWidth={2.6} />
                New booking
              </Link>
            ) : (
              <Link
                to="/book"
                className="press hidden min-h-9 items-center bg-signal px-4 text-[11px] font-bold uppercase tracking-[0.12em] text-signal-foreground hover:bg-signal-deep lg:inline-flex"
              >
                Book now
              </Link>
            )}
            <ThemeToggle className="border-white/15 bg-white/5 text-ink-foreground/70 hover:text-ink-foreground" />
            <Link
              to={settings.to}
              aria-label="Settings"
              className={cn(
                "press grid h-9 w-9 shrink-0 place-items-center rounded-full border border-white/15 bg-white/5 hover:text-ink-foreground",
                isActive(path, settings) ? "text-signal" : "text-ink-foreground/70",
              )}
            >
              <Settings className="h-4 w-4" strokeWidth={2.2} />
            </Link>
            <button
              type="button"
              onClick={() => void signOut()}
              aria-label="Sign out"
              className="press inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-2.5 text-[11px] font-bold uppercase tracking-[0.12em] text-ink-foreground/70 hover:text-ink-foreground sm:px-3.5"
            >
              <LogOut className="h-4 w-4" strokeWidth={2.2} />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </div>
      </header>

      <div
        className={cn(
          "relative text-ink-foreground",
          stage !== undefined && "min-h-[404px] sm:min-h-[384px]",
        )}
      >
        {stage}
        <div
          className={cn(
            "relative mx-auto w-full max-w-6xl px-5 pb-12 pt-7 sm:px-8 sm:pb-14 sm:pt-10",
            // Over a stage the words must not block the surface's own controls or torch.
            stage !== undefined &&
              "pointer-events-none pb-4 sm:pb-4 [&_a]:pointer-events-auto [&_button]:pointer-events-auto",
          )}
        >
          {back ? (
            <Link
              to={back.to}
              params={back.params as never}
              className="press mb-4 inline-flex items-center gap-1 text-[12px] font-semibold uppercase tracking-[0.14em] text-ink-foreground/55 hover:text-ink-foreground"
            >
              <ChevronLeft className="h-4 w-4" strokeWidth={2.4} />
              {back.label}
            </Link>
          ) : null}
          <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <div className="min-w-0">
              {eyebrow ? <p className="eyebrow text-ink-foreground/45">{eyebrow}</p> : null}
              <h1 className="mt-2 font-display text-[44px] leading-[0.92] sm:text-[60px] lg:text-[72px]">
                {title}
              </h1>
              {subtitle ? (
                <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-ink-foreground/60">
                  {subtitle}
                </p>
              ) : null}
            </div>
            {actions ? (
              <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
            ) : null}
          </div>
        </div>
      </div>

      <main className="flex-1 rounded-t-[28px] bg-background pb-28 text-foreground lg:pb-16">
        <div
          className={cn(
            "page-in mx-auto w-full px-5 pt-7 sm:px-8 sm:pt-9",
            width === "narrow" ? "max-w-3xl" : width === "medium" ? "max-w-5xl" : "max-w-6xl",
          )}
        >
          {children}
        </div>
      </main>

      <footer className="hidden bg-ink py-6 text-ink-foreground/50 lg:block">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-6 px-8 text-[12px]">
          <a href={ttdSiteLinks.website} className="hover:text-ink-foreground">
            truetodetail.co.uk
          </a>
          <LegalLinks className="justify-end text-ink-foreground/50" />
        </div>
      </footer>

      <nav
        aria-label="Quick links"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-hairline bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        <ul
          className={cn("mx-auto grid max-w-lg", area === "admin" ? "grid-cols-5" : "grid-cols-4")}
        >
          {tabs.map((item) => {
            const active = isActive(path, item);
            const Icon = item.icon;
            return (
              <li key={item.to}>
                <Link
                  to={item.to}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "press flex min-h-[60px] flex-col items-center justify-center gap-1 text-[11px] font-semibold",
                    active ? "text-signal-deep" : "text-muted-foreground",
                  )}
                >
                  <Icon className="h-5 w-5" strokeWidth={active ? 2.6 : 2.1} />
                  {item.short ?? item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
