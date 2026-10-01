import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { TriangleAlert } from "lucide-react";
import { PublicShell } from "@/components/ttd/PublicShell";
import { NewPasswordFields, passwordProblems } from "@/components/ttd/PasswordFields";
import { PrimaryActionButton } from "@/components/ttd/PrimaryActionButton";
import { BrandedLoading } from "@/components/ttd/BrandedLoading";
import { useSession } from "@/hooks/use-session";
import { supabase } from "@/lib/supabase";
import { updateMyPassword } from "@/lib/auth";
import { confirmPasswordChanged } from "@/lib/accounts";

export const Route = createFileRoute("/account/reset")({
  head: () => ({
    meta: [
      { title: "Choose a new password | True To Detail" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Reset,
});

function Reset() {
  const navigate = useNavigate();
  const { session, loading } = useSession();
  const [waited, setWaited] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [reason, setReason] = useState<"expired" | "other-browser" | "unknown">("unknown");

  // A link carrying its own token works from any browser or device, and an email
  // scanner that merely opens it cannot use it up, because it is redeemed here.
  useEffect(() => {
    const w = window as unknown as {
      __ttdLinkProblem?: string | null;
      __ttdLinkToken?: { hash: string; type: string | null } | null;
      __ttdLinkCode?: string | null;
    };
    if (w.__ttdLinkToken?.hash) {
      setVerifying(true);
      void supabase.auth
        .verifyOtp({ token_hash: w.__ttdLinkToken.hash, type: "recovery" })
        .then(({ error: err }) => {
          if (err) setReason(/expired|invalid/i.test(err.message) ? "expired" : "unknown");
          setVerifying(false);
        });
    } else if (w.__ttdLinkProblem) {
      setReason(/expired/i.test(w.__ttdLinkProblem) ? "expired" : "unknown");
    } else if (w.__ttdLinkCode) {
      // The older link style only works in the browser that asked for it.
      setReason("other-browser");
    }
  }, []);

  // The reset link signs the person in for this one step; give the sign-in a moment to land.
  useEffect(() => {
    const t = setTimeout(() => setWaited(true), 4000);
    return () => clearTimeout(t);
  }, []);

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
      await confirmPasswordChanged().catch(() => undefined);
      navigate({ to: "/account", replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      setBusy(false);
    }
  }

  if (loading || verifying || (!session && !waited)) {
    return (
      <PublicShell eyebrow="Your account" title="ONE MOMENT">
        <BrandedLoading label="Checking your link" />
      </PublicShell>
    );
  }

  if (!session) {
    return (
      <PublicShell
        eyebrow="Your account"
        title={
          <>
            {reason === "expired" ? "THAT LINK HAS EXPIRED" : "THAT LINK DID NOT WORK"}
            <span className="text-signal">.</span>
          </>
        }
      >
        <p className="text-[15px] leading-relaxed text-muted-foreground">
          {reason === "expired"
            ? "Reset links work once, for an hour. Request a fresh one and we will send it straight away."
            : reason === "other-browser"
              ? "This link only works in the browser you asked for it from. Open it there, or request a fresh link from this device."
              : "We could not sign you in from that link. It may already have been used, or opened by an email scanner. Request a fresh one and open it straight away."}
        </p>
        <Link
          to="/account/forgot"
          className="press rounded-full mt-5 inline-flex min-h-12 w-full items-center justify-center bg-signal px-4 text-[13px] font-bold uppercase tracking-[0.1em] text-signal-foreground hover:bg-signal-deep"
        >
          Send a new link
        </Link>
      </PublicShell>
    );
  }

  return (
    <PublicShell
      eyebrow="Your account"
      title={
        <>
          NEW PASSWORD<span className="text-signal">.</span>
        </>
      }
      subtitle="Choose something only you would know."
    >
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
          Save password
        </PrimaryActionButton>
      </form>
    </PublicShell>
  );
}
