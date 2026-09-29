import { useState } from "react";
import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { MailCheck, TriangleAlert } from "lucide-react";
import { z } from "zod";
import { PublicShell, AuthField } from "@/components/ttd/PublicShell";
import { NewPasswordFields, passwordProblems } from "@/components/ttd/PasswordFields";
import { PrimaryActionButton } from "@/components/ttd/PrimaryActionButton";
import { signUpWithEmail } from "@/lib/accounts";
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
  const [done, setDone] = useState<null | { needsConfirmation: boolean }>(null);

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
        <Link
          to="/account/login"
          className="mt-6 inline-block text-[13px] font-semibold text-signal-deep underline underline-offset-2"
        >
          Back to sign in
        </Link>
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
