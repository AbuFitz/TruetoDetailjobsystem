import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { TriangleAlert } from "lucide-react";
import { TtdLogo } from "@/components/ttd/Header";
import { Field } from "@/components/ttd/FormField";
import { PrimaryActionButton } from "@/components/ttd/PrimaryActionButton";
import { LegalLinks } from "@/components/ttd/LegalLinks";
import { ThemeToggle } from "@/components/ttd/ThemeToggle";
import { isStaff, signIn, signOut } from "@/lib/auth";
import { useSession } from "@/hooks/use-session";
import { ttdSiteLinks } from "@/lib/constants";

export const Route = createFileRoute("/admin/login")({
  head: () => ({
    meta: [{ title: "Staff sign in | True To Detail" }, { name: "robots", content: "noindex" }],
  }),
  component: AdminLogin,
});

interface FormValues {
  email: string;
  password: string;
}

function AdminLogin() {
  const navigate = useNavigate();
  const { session, loading } = useSession();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit } = useForm<FormValues>({
    defaultValues: { email: "", password: "" },
  });

  useEffect(() => {
    if (loading || !session) return;
    isStaff().then((staff) => {
      if (staff) navigate({ to: "/admin", replace: true });
    });
  }, [loading, session, navigate]);

  async function onSubmit(values: FormValues) {
    setError(null);
    setSubmitting(true);
    try {
      await signIn(values.email, values.password);
      const staff = await isStaff();
      if (!staff) {
        await signOut();
        throw new Error("This account isn't a True To Detail staff account.");
      }
      navigate({ to: "/admin", replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="relative flex min-h-screen flex-col bg-ink text-ink-foreground">
      <ThemeToggle className="absolute right-5 top-5 z-10 border-white/15 bg-white/5 text-ink-foreground/70 hover:text-ink-foreground" />

      <div className="px-6 pb-14 pt-14 sm:px-10 sm:pt-16">
        <a
          href={ttdSiteLinks.website}
          aria-label="True To Detail, home"
          className="press inline-block"
        >
          <TtdLogo size="lg" tone="light" />
        </a>
        <p className="eyebrow mt-10 text-ink-foreground/55">Internal</p>
        <h1 className="mt-2 font-display text-[56px] leading-[0.88] sm:text-[72px]">
          STAFF
          <br />
          <span className="text-ink-foreground/35">
            CONSOLE<span className="text-signal">.</span>
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
          <LegalLinks className="mt-6" />
        </div>
      </div>
    </main>
  );
}
