import { useEffect, useState } from "react";
import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { TriangleAlert } from "lucide-react";
import { z } from "zod";
import { TtdLogo } from "@/components/ttd/Header";
import { Field } from "@/components/ttd/FormField";
import { PrimaryActionButton } from "@/components/ttd/PrimaryActionButton";
import { useForm } from "react-hook-form";
import { signIn, signUpCustomer } from "@/lib/auth";
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
  firstName: string;
  email: string;
  password: string;
}

function AccountLogin() {
  const navigate = useNavigate();
  const { next } = useSearch({ from: "/account/login" });
  const { session } = useSession();
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit } = useForm<FormValues>({
    defaultValues: { firstName: "", email: "", password: "" },
  });

  useEffect(() => {
    if (session) navigate({ to: next || "/account", replace: true });
  }, [session, next, navigate]);

  async function onSubmit(values: FormValues) {
    setError(null);
    setSubmitting(true);
    try {
      if (mode === "sign-up") {
        await signUpCustomer({
          email: values.email,
          password: values.password,
          firstName: values.firstName,
        });
      } else {
        await signIn(values.email, values.password);
      }
      navigate({ to: next || "/account", replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background px-5 py-12">
      <div className="w-full max-w-sm">
        <div className="text-center">
          <TtdLogo size="xl" />
        </div>

        <div className="mt-8 border border-hairline bg-surface p-6 ">
          <div className="mb-5 grid grid-cols-2 gap-1 bg-surface-2 p-1">
            <button
              type="button"
              onClick={() => setMode("sign-in")}
              className={`min-h-9 text-sm font-semibold transition-colors ${mode === "sign-in" ? "bg-surface " : "text-muted-foreground"}`}
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => setMode("sign-up")}
              className={`min-h-9 text-sm font-semibold transition-colors ${mode === "sign-up" ? "bg-surface " : "text-muted-foreground"}`}
            >
              Create account
            </button>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
            {mode === "sign-up" ? (
              <Field
                id="firstName"
                label="First name"
                inputProps={register("firstName", { required: true })}
              />
            ) : null}
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
              <p className="flex items-start gap-2 border border-destructive/25 bg-destructive/8 px-3.5 py-3 text-[13px] leading-relaxed text-destructive">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.2} />
                {error}
              </p>
            ) : null}

            <PrimaryActionButton type="submit" loading={submitting}>
              {mode === "sign-up" ? "Create account" : "Sign in"}
            </PrimaryActionButton>
          </form>
        </div>

        <p className="mt-6 text-center text-[13px] text-muted-foreground">
          <a href={ttdSiteLinks.website} className="underline underline-offset-2">
            Back to True To Detail
          </a>
        </p>
      </div>
    </main>
  );
}
