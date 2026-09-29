import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ShieldCheck, TriangleAlert } from "lucide-react";
import { PublicShell } from "@/components/ttd/PublicShell";
import { NewPasswordFields, passwordProblems } from "@/components/ttd/PasswordFields";
import { PrimaryActionButton } from "@/components/ttd/PrimaryActionButton";
import { BrandedLoading } from "@/components/ttd/BrandedLoading";
import { useSession } from "@/hooks/use-session";
import { updateMyPassword, signOut } from "@/lib/auth";
import { confirmPasswordChanged, mustChangePassword } from "@/lib/accounts";
import { getMyProfile } from "@/lib/customers";

export const Route = createFileRoute("/account/welcome")({
  head: () => ({
    meta: [
      { title: "Choose your password | True To Detail" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Welcome,
});

/**
 * The first-sign-in step for an account staff created: the temporary password
 * only gets a customer this far, and nothing else opens until they choose
 * their own.
 */
function Welcome() {
  const navigate = useNavigate();
  const { session, loading } = useSession();
  const [name, setName] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!session) {
      navigate({ to: "/account/login", replace: true });
      return;
    }
    let live = true;
    Promise.all([mustChangePassword(), getMyProfile().catch(() => null)]).then(
      ([must, profile]) => {
        if (!live) return;
        if (!must) navigate({ to: "/account", replace: true });
        setName(profile?.first_name ?? null);
        setChecked(true);
      },
    );
    return () => {
      live = false;
    };
  }, [loading, session, navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const problems = passwordProblems(password);
    if (problems.length)
      return setError(`Your password needs: ${problems.join(", ").toLowerCase()}.`);
    if (password !== confirm) return setError("The two passwords do not match.");
    setBusy(true);
    try {
      await updateMyPassword(password);
      await confirmPasswordChanged();
      navigate({ to: "/account", replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      setBusy(false);
    }
  }

  if (!checked) {
    return (
      <PublicShell eyebrow="Welcome" title="ONE MOMENT">
        <BrandedLoading label="Getting your account ready" />
      </PublicShell>
    );
  }

  return (
    <PublicShell
      eyebrow="One last step"
      title={
        <>
          {name ? `WELCOME, ${name.toUpperCase()}` : "WELCOME"}
          <span className="text-signal">.</span>
        </>
      }
      subtitle="You signed in with a temporary password. Choose your own to keep your account private."
    >
      <div className="mb-5 flex items-start gap-3 rounded-2xl border border-hairline bg-surface p-4 text-[14px] leading-relaxed text-muted-foreground">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-signal" strokeWidth={2.2} />
        The temporary password stops working as soon as you save a new one.
      </div>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <NewPasswordFields
          password={password}
          confirm={confirm}
          onPassword={setPassword}
          onConfirm={setConfirm}
        />
        {error ? (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-xl border border-destructive/25 bg-destructive/8 px-3.5 py-3 text-[13px] leading-relaxed text-destructive"
          >
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.2} />
            {error}
          </p>
        ) : null}
        <PrimaryActionButton type="submit" loading={busy}>
          Save and continue
        </PrimaryActionButton>
      </form>
      <button
        type="button"
        onClick={() => signOut()}
        className="press mt-6 block w-full text-center text-[13px] text-muted-foreground underline underline-offset-2"
      >
        Sign out
      </button>
    </PublicShell>
  );
}
