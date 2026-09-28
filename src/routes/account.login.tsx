import { useEffect, useState } from "react";
import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { TriangleAlert } from "lucide-react";
import { z } from "zod";
import { TtdLogo } from "@/components/ttd/Header";
import { Field } from "@/components/ttd/FormField";
import { PrimaryActionButton } from "@/components/ttd/PrimaryActionButton";
import { LegalLinks } from "@/components/ttd/LegalLinks";
import { ThemeToggle } from "@/components/ttd/ThemeToggle";
import { useForm } from "react-hook-form";
import { signIn, isStaff } from "@/lib/auth";
import { useSession } from "@/hooks/use-session";
import { ttdSiteLinks } from "@/lib/constants";

const searchSchema = z.object({ next: z.string().optional() });

export const Route = createFileRoute("/account/login")({
  head: () => ({
    meta: [{ title: "Sign in | True To Detail" }, { name: "robots", content: "noindex" }],
  }),
  validateSearch: searchSchema,
  component: AccountLogin,
});

interface FormValues {
  email: string;
  password: string;
}

function AccountLogin() {
  const navigate = useNavigate();
  const { next } = useSearch({ from: "/account/login" });
  const { session } = useSession();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit } = useForm<FormValues>({
    defaultValues: { email: "", password: "" },
  });

  useEffect(() => {
    if (!session) return;
    isStaff().then((staff) => {
      navigate({ to: staff ? "/admin" : next || "/account", replace: true });
    });
  }, [session, next, navigate]);

  async function onSubmit(values: FormValues) {
    setError(null);
    setSubmitting(true);
    try {
      await signIn(values.email, values.password);
      // A staff account signing in here (or via the main site's popup, which
      // shares this same auth) belongs on the admin console, not the
      // customer dashboard — see useRequireCustomerSession for the same
      // check on direct navigation.
      const staff = await isStaff();
      navigate({ to: staff ? "/admin" : next || "/account", replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="relative flex min-h-screen flex-col bg-ink text-ink-foreground">
      <ThemeToggle className="absolute right-5 top-5 z-10 border-white/15 bg-white/5 text-ink-foreground/70 hover:text-ink-foreground" />

      {/*
        Dark hero collapsing into a light sheet — the same two-tone move
        BookingModal uses on the main site (dark header, white body), so the
        front door to this app actually feels like it belongs to the brand
        instead of a generic auth template dropped onto a blank page.
      */}
      <div className="px-6 pb-14 pt-14 sm:px-10 sm:pt-16">
        <a href={ttdSiteLinks.website} className="press inline-block">
          <TtdLogo size="lg" tone="light" />
        </a>
        <p className="eyebrow mt-10 text-ink-foreground/30">Your account</p>
        <h1 className="mt-2 font-display text-[56px] leading-[0.88] sm:text-[72px]">
          WELCOME
          <br />
          <span className="text-ink-foreground/35">
            BACK<span className="text-signal">.</span>
          </span>
        </h1>
      </div>

      <div className="flex-1 rounded-t-3xl bg-background px-6 pb-10 pt-8 text-foreground sm:px-10">
        <div className="mx-auto w-full max-w-sm">
          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <Field
              id="email"
              label="Email"
              type="email"
              inputProps={register("email", { required: true })}
            />
            <Field
              id="password"
              label="Password"
              type="password"
              inputProps={register("password", { required: true })}
            />

            {error ? (
              <p className="flex items-start gap-2 rounded-xl border border-destructive/25 bg-destructive/8 px-3.5 py-3 text-[13px] leading-relaxed text-destructive">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.2} />
                {error}
              </p>
            ) : null}

            <PrimaryActionButton type="submit" loading={submitting}>
              Sign in
            </PrimaryActionButton>
          </form>

          {/*
            No self-service "create account" here on purpose — accounts are
            created as part of booking on the main site, not by typing a
            name/email/password in on this app directly. Anyone without an
            account yet gets sent to book there instead.
          */}
          <p className="mt-6 text-center text-[13px] text-muted-foreground">
            Don&rsquo;t have an account yet?{" "}
            <a href={ttdSiteLinks.website} className="underline underline-offset-2">
              Book a detail
            </a>{" "}
            to get set up.
          </p>
          <LegalLinks className="mt-3" />
        </div>
      </div>
    </main>
  );
}
