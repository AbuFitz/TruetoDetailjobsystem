import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
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
      <label
        htmlFor={id}
        className="block text-[10px] font-semibold uppercase tracking-[0.2em] text-foreground/60"
      >
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

const searchSchema = z.object({
  next: z.string().optional(),
  email: z.string().optional(),
  mode: z.enum(["signin", "register"]).optional(),
});

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
  const search = useSearch({ from: "/account/login" });
  const next = safeNext(search.next);
  const { session } = useSession();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bookingOpen, setBookingOpen] = useState(false);
  const [mode, setMode] = useState<"signin" | "register">(search.mode ?? "signin");
  // Starts false to match the server-rendered/first-paint state (localStorage
  // doesn't exist during SSR), then flips true right after hydration for a
  // browser that really has signed in before — avoids a hydration mismatch
  // between the server's guess and the client's actual history.
  const [returning, setReturning] = useState(false);
  useEffect(() => {
    setReturning(hasSignedInBefore());
  }, []);
  const { register, handleSubmit } = useForm<FormValues>({
    defaultValues: { email: search.email ?? "", password: "" },
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
        <a
          href={ttdSiteLinks.website}
          aria-label="True To Detail, home"
          className="press inline-block"
        >
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
          <div
            role="tablist"
            aria-label="Sign in or register"
            className="relative mb-6 grid grid-cols-2 rounded-full border border-black/12 bg-surface-2 p-1"
          >
            {/* The thumb slides to the chosen side, so the switch feels physical. */}
            <span
              aria-hidden
              className="absolute inset-y-1 left-1 w-[calc(50%-4px)] rounded-full bg-ink ring-1 ring-white/10 transition-transform duration-300 ease-out"
              style={{ transform: mode === "register" ? "translateX(100%)" : "translateX(0)" }}
            />
            {(
              [
                ["signin", "Sign in"],
                ["register", "Register"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                id={`tab-${key}`}
                aria-selected={mode === key}
                aria-controls={`panel-${key}`}
                onClick={() => setMode(key)}
                className={`press relative z-10 min-h-11 rounded-full text-[12px] font-bold uppercase tracking-[0.14em] transition-colors ${
                  mode === key
                    ? "text-ink-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {mode === "register" ? (
            <div id="panel-register" role="tabpanel" aria-labelledby="tab-register">
              <h2 className="font-display text-[32px] leading-[0.95]">
                BOOK A DETAIL, AND YOUR ACCOUNT IS READY
              </h2>
              <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
                The easiest way in is to make a booking. We set up your account with it, email you
                the details, and you can follow your detailer live and rebook in two taps.
              </p>
              <PrimaryActionButton className="mt-5" onClick={() => setBookingOpen(true)}>
                Book a detail
              </PrimaryActionButton>
              <p className="mt-6 text-center text-[13px] text-muted-foreground">
                Only want an account for now?{" "}
                <Link
                  to="/account/create"
                  className="press font-semibold text-foreground underline underline-offset-2"
                >
                  Create one
                </Link>
                .
              </p>
            </div>
          ) : (
            <form
              id="panel-signin"
              role="tabpanel"
              aria-labelledby="tab-signin"
              onSubmit={handleSubmit(onSubmit)}
              className="flex flex-col gap-4"
            >
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

              <p className="-mt-1 text-right text-[13px]">
                <Link
                  to="/account/forgot"
                  className="press text-muted-foreground underline underline-offset-2"
                >
                  Forgot your password?
                </Link>
              </p>

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
          )}

          <LegalLinks className="mt-8" />
        </div>
      </div>

      <QuickBookingModal open={bookingOpen} onClose={() => setBookingOpen(false)} />
    </main>
  );
}
