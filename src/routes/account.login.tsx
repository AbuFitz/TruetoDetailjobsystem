import { useEffect, useState } from "react";
import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { TriangleAlert } from "lucide-react";
import { z } from "zod";
import { TtdLogo } from "@/components/ttd/Header";
import { PrimaryActionButton } from "@/components/ttd/PrimaryActionButton";
import { LegalLinks } from "@/components/ttd/LegalLinks";
import { ThemeToggle } from "@/components/ttd/ThemeToggle";
import { QuickBookingModal } from "@/components/ttd/QuickBookingModal";
import { useForm, type UseFormRegisterReturn } from "react-hook-form";
import { signIn, isStaff, hasSignedInBefore } from "@/lib/auth";
import { useSession } from "@/hooks/use-session";
import { ttdSiteLinks } from "@/lib/constants";
import { safeNext } from "@/lib/safe-next";

// Matches the main site's own booking-form field treatment exactly (see
// BookingModal.tsx's fieldLabel/textInput) instead of this app's usual
// pill-shaped inputs — the front door should look like it was cut from the
// same sheet as the site the customer just came from.
function LoginField({
  id,
  label,
  type = "text",
  inputProps,
}: {
  id: string;
  label: string;
  type?: string;
  inputProps: UseFormRegisterReturn;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-[10px] font-semibold uppercase tracking-[0.2em] text-foreground/60">
        {label}
      </label>
      <input
        id={id}
        type={type}
        className="mt-2.5 w-full border border-black/12 bg-white px-4 py-3.5 text-base text-ink outline-none transition-colors focus:border-signal"
        {...inputProps}
      />
    </div>
  );
}

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
  const next = safeNext(useSearch({ from: "/account/login" }).next);
  const { session } = useSession();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bookingOpen, setBookingOpen] = useState(false);
  // Starts false to match the server-rendered/first-paint state (localStorage
  // doesn't exist during SSR), then flips true right after hydration for a
  // browser that really has signed in before — avoids a hydration mismatch
  // between the server's guess and the client's actual history.
  const [returning, setReturning] = useState(false);
  useEffect(() => {
    setReturning(hasSignedInBefore());
  }, []);
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
        <p className="eyebrow mt-10 text-ink-foreground/55">Your account</p>
        <h1 className="mt-2 font-display text-[56px] leading-[0.88] sm:text-[72px]">
          {returning ? (
            <>
              WELCOME
              <br />
              <span className="text-ink-foreground/35">
                BACK<span className="text-signal">.</span>
              </span>
            </>
          ) : (
            <>
              WELCOME<span className="text-signal">.</span>
            </>
          )}
        </h1>
      </div>

      <div className="flex-1 rounded-t-3xl bg-background px-6 pb-10 pt-8 text-foreground sm:px-10">
        <div className="mx-auto w-full max-w-sm">
          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <LoginField
              id="email"
              label="Email"
              type="email"
              inputProps={register("email", { required: true })}
            />
            <LoginField
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
            created as part of booking, either on the main site or via this
            popup, not by typing a name/email/password in cold. Anyone
            without an account yet gets a booking form right here, with the
            option to set one up straight after submitting.
          */}
          <p className="mt-6 text-center text-[13px] text-muted-foreground">
            Don&rsquo;t have an account yet?{" "}
            <button
              type="button"
              onClick={() => setBookingOpen(true)}
              className="press underline underline-offset-2"
            >
              Book a detail
            </button>{" "}
            to get set up.
          </p>
          <LegalLinks className="mt-3" />
        </div>
      </div>

      <QuickBookingModal open={bookingOpen} onClose={() => setBookingOpen(false)} />
    </main>
  );
}
