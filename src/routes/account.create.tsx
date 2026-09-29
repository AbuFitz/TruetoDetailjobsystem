import { useEffect, useState } from "react";
import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { MailCheck, TriangleAlert } from "lucide-react";
import { z } from "zod";
import { PublicShell, AuthField } from "@/components/ttd/PublicShell";
import { NewPasswordFields, passwordProblems } from "@/components/ttd/PasswordFields";
import { PrimaryActionButton } from "@/components/ttd/PrimaryActionButton";
import { resendConfirmation, signUpWithEmail } from "@/lib/accounts";
import { supportContact } from "@/lib/constants";

export const Route = createFileRoute("/account/create")({
  head: () => ({
    meta: [
      { title: "Create your account | True To Detail" },
      { name: "robots", content: "noindex" },
    ],
  }),
  validateSearch: z.object({ email: z.string().optional(), from: z.string().optional() }),
  component: CreateAccount,
});

function CreateAccount() {
  const search = useSearch({ from: "/account/create" });
  const [firstName, setFirstName] = useState("");
  const [email, setEmail] = useState(search.email ?? "");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<null | {
    needsConfirmation: boolean;
    alreadyRegistered: boolean;
  }>(null);
  const [cooldown, setCooldown] = useState(0);
  const [resendNote, setResendNote] = useState<string | null>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function resend() {
    setResendNote(null);
    try {
      await resendConfirmation(email.trim());
      setResendNote("Sent again. Check your inbox and junk folder.");
      setCooldown(60);
    } catch (err) {
      setResendNote(
        err instanceof Error ? err.message : "Couldn't send that. Try again in a minute.",
      );
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const problems = passwordProblems(password);
    if (problems.length)
      return setError(`Your password needs: ${problems.join(", ").toLowerCase()}.`);
    if (password !== confirm) return setError("The two passwords do not match.");
    setBusy(true);
    try {
      setDone(
        await signUpWithEmail({
          email: email.trim(),
          password,
          firstName: firstName.trim(),
          phone: phone.trim() || undefined,
        }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (done?.alreadyRegistered) {
    return (
      <PublicShell
        eyebrow="Good news"
        title={
          <>
            YOU ALREADY HAVE AN ACCOUNT<span className="text-signal">.</span>
          </>
        }
      >
        <p className="text-[15px] leading-relaxed text-muted-foreground">
          <strong className="text-foreground">{email}</strong> is already registered, so there is
          nothing to set up. Sign in with it, or reset your password if you have forgotten it.
        </p>
        <Link
          to="/account/login"
          search={{ email: email.trim() }}
          className="press mt-6 inline-flex min-h-12 w-full items-center justify-center bg-signal px-4 text-[13px] font-bold uppercase tracking-[0.1em] text-signal-foreground hover:bg-signal-deep"
        >
          Sign in
        </Link>
        <Link
          to="/account/forgot"
          search={{ email: email.trim() }}
          className="press mt-3 inline-flex min-h-12 w-full items-center justify-center border border-hairline bg-surface px-4 text-[13px] font-bold uppercase tracking-[0.1em] hover:bg-surface-2"
        >
          I forgot my password
        </Link>
        <button
          type="button"
          onClick={() => setDone(null)}
          className="press mt-5 block w-full text-center text-[13px] text-muted-foreground underline underline-offset-2"
        >
          Use a different email
        </button>
      </PublicShell>
    );
  }

  if (done) {
    return (
      <PublicShell
        eyebrow="Almost there"
        title={
          <>
            CHECK YOUR EMAIL<span className="text-signal">.</span>
          </>
        }
      >
        <div className="rounded-2xl border border-hairline bg-surface p-5">
          <MailCheck className="h-6 w-6 text-signal" strokeWidth={2.2} />
          <p className="mt-3 text-[15px] leading-relaxed">
            We sent a confirmation link to <strong>{email}</strong>. Tap it and your account is
            ready.
          </p>
          <p className="mt-3 text-[14px] leading-relaxed text-muted-foreground">
            Any booking you have already made with this email joins your account automatically once
            it is confirmed. Nothing arrived? Check your junk folder, or call us on{" "}
            {supportContact.phone} and we will set you up.
          </p>
        </div>
        <button
          type="button"
          onClick={resend}
          disabled={cooldown > 0}
          className="press mt-5 inline-flex min-h-11 items-center justify-center border border-hairline bg-surface px-5 text-[12px] font-bold uppercase tracking-[0.1em] hover:bg-surface-2 disabled:opacity-50"
        >
          {cooldown > 0 ? `Send again in ${cooldown}s` : "Send the email again"}
        </button>
        {resendNote ? <p className="mt-3 text-[13px] text-muted-foreground">{resendNote}</p> : null}
        <div className="mt-6 flex gap-5 text-[13px] font-semibold text-signal-deep">
          <button
            type="button"
            onClick={() => setDone(null)}
            className="press underline underline-offset-2"
          >
            Wrong email?
          </button>
          <Link to="/account/login" className="underline underline-offset-2">
            Back to sign in
          </Link>
        </div>
      </PublicShell>
    );
  }

  return (
    <PublicShell
      eyebrow="Free account"
      title={
        <>
          CREATE YOUR ACCOUNT<span className="text-signal">.</span>
        </>
      }
      subtitle="Keep your cars and addresses, rebook in two taps and follow every visit."
    >
      <form onSubmit={submit} className="flex flex-col gap-4">
        <AuthField
          id="first-name"
          label="First name"
          autoComplete="given-name"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          required
        />
        <AuthField
          id="email"
          label="Email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          hint="Use the email you booked with and your booking joins your account."
        />
        <AuthField
          id="phone"
          label="Mobile (optional)"
          type="tel"
          autoComplete="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
        <NewPasswordFields
          label="Password"
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
          Create account
        </PrimaryActionButton>
      </form>
      <p className="mt-6 text-center text-[13px] text-muted-foreground">
        Already have an account?{" "}
        <Link to="/account/login" className="press underline underline-offset-2">
          Sign in
        </Link>
      </p>
    </PublicShell>
  );
}
