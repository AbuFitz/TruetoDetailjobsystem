import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { TriangleAlert } from "lucide-react";
import { TtdLogo } from "@/components/ttd/Header";
import { Field } from "@/components/ttd/FormField";
import { PrimaryActionButton } from "@/components/ttd/PrimaryActionButton";
import { LegalLinks } from "@/components/ttd/LegalLinks";
import { isStaff, signIn, signOut } from "@/lib/auth";
import { useSession } from "@/hooks/use-session";

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
    <main className="flex min-h-screen flex-col items-center justify-center bg-ink px-5 py-12 text-ink-foreground">
      <div className="w-full max-w-sm">
        <div className="text-center">
          <TtdLogo size="xl" tone="light" />
          <p className="eyebrow mt-2 text-ink-foreground/60">Staff console</p>
        </div>

        <form
          onSubmit={handleSubmit(onSubmit)}
          className="mt-8 flex flex-col gap-4 border border-white/10 bg-surface p-6 text-foreground"
        >
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
          <PrimaryActionButton type="submit" variant="ink" loading={submitting}>
            Sign in
          </PrimaryActionButton>
        </form>
      </div>
    </main>
  );
}
