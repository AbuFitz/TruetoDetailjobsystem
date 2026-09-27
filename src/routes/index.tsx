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

function Landing() {
  return (
    <main className="min-h-screen bg-background">
      <header className="border-b border-hairline px-5 py-5 sm:px-6">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between">
          <TtdLogo size="lg" />
          <a
            href={ttdSiteLinks.website}
            className="press text-[13px] font-semibold text-muted-foreground hover:text-foreground"
          >
            truetodetail.co.uk
          </a>
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
