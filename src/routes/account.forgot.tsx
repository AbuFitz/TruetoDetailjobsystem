import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { MailCheck } from "lucide-react";
import { PublicShell, AuthField } from "@/components/ttd/PublicShell";
import { PrimaryActionButton } from "@/components/ttd/PrimaryActionButton";
import { requestPasswordReset } from "@/lib/accounts";
import { supportContact } from "@/lib/constants";

export const Route = createFileRoute("/account/forgot")({
  head: () => ({
    meta: [
      { title: "Reset your password | True To Detail" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Forgot,
});

function Forgot() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await requestPasswordReset(email.trim());
    } finally {
      // Same message whether or not the email has an account, so this page never reveals who does.
      setSent(true);
      setBusy(false);
    }
  }

  return (
    <PublicShell
      eyebrow="Password help"
      title={
        <>
          RESET YOUR PASSWORD<span className="text-signal">.</span>
        </>
      }
      subtitle="We will email you a link to choose a new one."
    >
      {sent ? (
        <div className="rounded-2xl border border-hairline bg-surface p-5">
          <MailCheck className="h-6 w-6 text-signal" strokeWidth={2.2} />
          <p className="mt-3 text-[15px] leading-relaxed">
            If <strong>{email}</strong> has an account, a reset link is on its way. It works for one
            hour.
          </p>
          <p className="mt-3 text-[14px] leading-relaxed text-muted-foreground">
            Nothing after a few minutes? Check junk, or call or WhatsApp us on{" "}
            {supportContact.phone} and we will give you a temporary password.
          </p>
        </div>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-4">
          <AuthField
            id="email"
            label="Email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <PrimaryActionButton type="submit" loading={busy}>
            Send reset link
          </PrimaryActionButton>
        </form>
      )}
      <p className="mt-6 text-center text-[13px]">
        <Link
          to="/account/login"
          className="press text-muted-foreground underline underline-offset-2"
        >
          Back to sign in
        </Link>
      </p>
    </PublicShell>
  );
}
