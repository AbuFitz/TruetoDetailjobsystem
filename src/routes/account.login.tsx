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
import { signIn } from "@/lib/auth";
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
    if (session) navigate({ to: next || "/account", replace: true });
  }, [session, next, navigate]);

  async function onSubmit(values: FormValues) {
    setError(null);
    setSubmitting(true);
    try {
      await signIn(values.email, values.password);
      navigate({ to: next || "/account", replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center bg-background px-5 py-12">
      <ThemeToggle className="absolute right-5 top-5" />
      <div className="w-full max-w-sm">
        <div className="text-center">
          <TtdLogo size="xl" />
        </div>

        <div className="mt-8 rounded-2xl border border-hairline bg-surface p-6">
          <p className="eyebrow mb-5 text-center text-muted-foreground">Sign in to your account</p>

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
        </div>

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
    </main>
  );
}
