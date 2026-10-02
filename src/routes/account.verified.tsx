import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { BadgeCheck, TriangleAlert } from "lucide-react";
import { PublicShell, AuthField } from "@/components/ttd/PublicShell";
import { PrimaryActionButton } from "@/components/ttd/PrimaryActionButton";
import { useSession } from "@/hooks/use-session";
import { isStaff, signIn } from "@/lib/auth";
import { resendConfirmation } from "@/lib/accounts";

export const Route = createFileRoute("/account/verified")({
  head: () => ({
    meta: [{ title: "Email verified | True To Detail" }, { name: "robots", content: "noindex" }],
  }),
  component: Verified,
});

/** Read a link problem Supabase puts in the address (hash or query), if any. */
function linkProblem(): string | null {
  if (typeof window === "undefined") return null;
  const saved = (window as unknown as { __ttdLinkProblem?: string | null }).__ttdLinkProblem;
  if (saved) return saved;
  const params = new URLSearchParams(
    window.location.hash.replace(/^#/, "") + "&" + window.location.search.replace(/^\?/, ""),
  );
  return params.get("error_code") ?? params.get("error");
}

/**
 * Where the confirmation email lands. It says the email is verified, then asks
 * the person to sign in. If the link also signed them in (same browser), they
 * can simply continue; on another device (say they opened it on their phone)
 * they sign in right here.
 */
function Verified() {
  const navigate = useNavigate();
  const { session, loading } = useSession();
  const [problem, setProblem] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resent, setResent] = useState(false);

  useEffect(() => {
    // The reason comes from a copy the page keeps before the auth library clears the address.
    const now = linkProblem();
    if (now) setProblem(now);
  }, []);

  async function go() {
    const staff = await isStaff().catch(() => false);
    navigate({ to: staff ? "/admin" : "/account", replace: true });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await signIn(email.trim(), password);
      await go();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setBusy(false);
    }
  }

  if (problem) {
    return (
      <PublicShell
        eyebrow="Email link"
        title={
          <>
            THAT LINK HAS EXPIRED<span className="text-signal">.</span>
          </>
        }
      >
        <p className="text-[15px] leading-relaxed text-muted-foreground">
          Confirmation links work once. If you already confirmed, just sign in. If not, we can send
          you a fresh one.
        </p>
        <Link
          to="/account/login"
          className="press rounded-full mt-5 inline-flex min-h-12 w-full items-center justify-center bg-signal px-4 text-[13px] font-bold uppercase tracking-[0.1em] text-signal-foreground hover:bg-signal-deep"
        >
          Sign in
        </Link>
        <form
          className="mt-6 flex flex-col gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await resendConfirmation(email.trim());
              setResent(true);
            } catch (err) {
              setError(err instanceof Error ? err.message : "Couldn't send that.");
            }
          }}
        >
          <AuthField
            id="resend-email"
            label="Send a new link to"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <PrimaryActionButton type="submit" variant="outline">
            Send a new link
          </PrimaryActionButton>
          {resent ? <p className="text-[13px] text-success">Sent. Check your inbox.</p> : null}
          {error ? (
            <p role="alert" className="text-[13px] text-destructive">
              {error}
            </p>
          ) : null}
        </form>
      </PublicShell>
    );
  }

  return (
    <PublicShell
      eyebrow="All set"
      title={
        <>
          EMAIL VERIFIED<span className="text-signal">.</span>
        </>
      }
      subtitle="Thanks for confirming. Your account is ready."
    >
      <div className="mb-6 flex items-start gap-3 rounded-2xl border border-success/30 bg-success/10 p-4 text-[14px] leading-relaxed">
        <BadgeCheck className="mt-0.5 h-5 w-5 shrink-0 text-success" strokeWidth={2.2} />
        <span>
          Your email address is confirmed. Any booking you made with it is now on your account.
        </span>
      </div>

      {!loading && session ? (
        <PrimaryActionButton onClick={go}>Continue to my account</PrimaryActionButton>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-4">
          <p className="text-[15px] font-semibold">Sign in to continue</p>
          <AuthField
            id="email"
            label="Email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <AuthField
            id="password"
            label="Password"
            type="password"
            revealable
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
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
            Sign in
          </PrimaryActionButton>
          <p className="text-center text-[13px]">
            <Link
              to="/account/forgot"
              className="press text-muted-foreground underline underline-offset-2"
            >
              Forgot your password?
            </Link>
          </p>
        </form>
      )}
    </PublicShell>
  );
}
