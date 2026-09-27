import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarClock, MapPin, ShieldCheck, Sparkles } from "lucide-react";
import { TtdLogo } from "@/components/ttd/Header";
import { PrimaryActionButton } from "@/components/ttd/PrimaryActionButton";
import { ttdSiteLinks } from "@/lib/constants";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "True To Detail — Book your mobile detail" },
      {
        name: "description",
        content:
          "Book a mobile car detail, track your detailer live, and manage everything from your True To Detail account.",
      },
    ],
  }),
  component: Landing,
});

const NAV_LINKS = [
  { label: "Services", href: ttdSiteLinks.services },
  { label: "Areas", href: ttdSiteLinks.areas },
];

function Landing() {
  return (
    <main className="min-h-screen bg-background">
      {/* Same dark bar / wordmark / uppercase-links / orange-CTA language as the
          truetodetail.co.uk marketing nav (components/Navbar.tsx there) — this
          app's "front door" page borrows it directly rather than the lighter
          in-app header used once you're signed into your account. */}
      <header className="sticky top-0 z-30 bg-ink">
        <div className="mx-auto flex h-20 w-full max-w-5xl items-center gap-4 px-5 sm:px-6">
          <a href={ttdSiteLinks.website} className="press shrink-0">
            <TtdLogo size="lg" tone="light" />
          </a>
          <nav className="ml-auto hidden items-center gap-1 md:flex">
            {NAV_LINKS.map((l) => (
              <a
                key={l.label}
                href={l.href}
                className="press rounded-md px-3.5 py-2 text-[13px] font-medium uppercase tracking-[0.04em] text-white/55 hover:text-white"
              >
                {l.label}
              </a>
            ))}
            <Link
              to="/account/login"
              className="press rounded-md px-3.5 py-2 text-[13px] font-medium uppercase tracking-[0.04em] text-white/55 hover:text-white"
            >
              My account
            </Link>
          </nav>
          <span className="hidden h-5 w-px bg-white/10 md:ml-2 md:block" />
          <Link to="/book" className="ml-auto shrink-0 md:ml-0">
            <span className="press inline-flex min-h-11 items-center bg-signal px-6 font-display text-[13px] font-bold uppercase tracking-[0.1em] text-signal-foreground hover:bg-signal-deep">
              Book now
            </span>
          </Link>
        </div>
      </header>

      <section className="mx-auto w-full max-w-3xl px-5 py-14 sm:px-6 sm:py-20">
        <span className="eyebrow text-signal-deep">Mobile detailing, done properly</span>
        <h1 className="mt-3 font-display text-[44px] leading-[0.95] sm:text-[64px]">
          We come to you. Track it live.
        </h1>
        <p className="mt-5 max-w-xl text-[17px] leading-relaxed text-muted-foreground">
          Book your detail, save your address and vehicle, and watch your detailer travel to you on
          the day — from arrival, through check-in, to the final quality check.
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link to="/book" className="sm:w-auto">
            <PrimaryActionButton className="sm:w-auto sm:px-8">
              Book a mobile detail
            </PrimaryActionButton>
          </Link>
          <Link to="/account/login" className="sm:w-auto">
            <PrimaryActionButton variant="outline" className="sm:w-auto sm:px-8">
              My account
            </PrimaryActionButton>
          </Link>
        </div>

        <div className="mt-14 grid gap-4 sm:grid-cols-3">
          <Feature
            icon={MapPin}
            title="Fully mobile"
            description="Home, work, or another address — we bring the water, power and equipment."
          />
          <Feature
            icon={CalendarClock}
            title="Live tracking"
            description="See your detailer's ETA and watch them arrive, right from your account."
          />
          <Feature
            icon={Sparkles}
            title="Every stage, visible"
            description="Wheels, wash, interior, protection, final QC — you always know where things stand."
          />
        </div>

        <p className="mt-14 flex items-center gap-2 text-[13px] text-muted-foreground">
          <ShieldCheck className="h-4 w-4 shrink-0" strokeWidth={2.2} />
          Staff sign-in is at{" "}
          <Link to="/admin/login" className="underline underline-offset-2">
            /admin/login
          </Link>
          .
        </p>
      </section>
    </main>
  );
}

function Feature({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-hairline bg-surface p-5">
      <span className="grid h-10 w-10 place-items-center rounded-xl bg-surface-2 text-signal-deep">
        <Icon className="h-5 w-5" strokeWidth={2} />
      </span>
      <p className="mt-3 font-display text-lg">{title}</p>
      <p className="mt-1 text-[14px] leading-relaxed text-muted-foreground">{description}</p>
    </div>
  );
}
