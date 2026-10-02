import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Check, ChevronRight, LogOut, Mail, MessageCircle, Phone } from "lucide-react";
import { NewPasswordFields, passwordProblems } from "@/components/ttd/PasswordFields";
import { PrimaryActionButton } from "@/components/ttd/PrimaryActionButton";
import { changeMyPassword, signOut } from "@/lib/auth";
import { confirmPasswordChanged } from "@/lib/accounts";
import { AuthField } from "@/components/ttd/PublicShell";
import { supportContact, ttdSiteLinks } from "@/lib/constants";
import { cn } from "@/lib/utils";

export function SettingsCard({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-2xl border border-hairline bg-surface p-5", className)}>
      <p className="eyebrow text-muted-foreground">{title}</p>
      {description ? (
        <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{description}</p>
      ) : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** A tappable row that opens another settings page. */
export function SettingsLink({
  to,
  title,
  hint,
  icon: Icon,
}: {
  to: string;
  title: string;
  hint: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
}) {
  return (
    <Link
      to={to}
      className="press flex items-center gap-3.5 rounded-xl border border-hairline bg-surface-2 p-3.5 hover:bg-surface"
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-signal/10 text-signal">
        <Icon className="h-5 w-5" strokeWidth={2.1} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-medium leading-tight">{title}</span>
        <span className="mt-0.5 block text-[13px] text-muted-foreground">{hint}</span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={2.4} />
    </Link>
  );
}

export function PasswordSection({ customer = false }: { customer?: boolean }) {
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    const problems = passwordProblems(password);
    if (problems.length)
      return setError(`Your password needs: ${problems.join(", ").toLowerCase()}.`);
    if (password !== confirm) return setError("The two passwords do not match.");
    setBusy(true);
    try {
      await changeMyPassword(current, password);
      // A customer's "choose a new password" flag is cleared whenever they set their own.
      if (customer) await confirmPasswordChanged().catch(() => undefined);
      setCurrent("");
      setPassword("");
      setConfirm("");
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't change your password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SettingsCard title="Password" description="Choose a new password for signing in.">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <AuthField
          id="current-password"
          label="Current password"
          type="password"
          revealable
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          required
        />
        <NewPasswordFields
          password={password}
          confirm={confirm}
          onPassword={setPassword}
          onConfirm={setConfirm}
        />
        {error ? (
          <p role="alert" className="text-[13px] text-destructive">
            {error}
          </p>
        ) : null}
        {saved ? (
          <p className="flex items-center gap-1.5 text-[13px] font-medium text-success">
            <Check className="h-4 w-4" strokeWidth={2.6} /> Password updated
          </p>
        ) : null}
        <PrimaryActionButton type="submit" variant="ink" loading={busy}>
          Update password
        </PrimaryActionButton>
      </form>
    </SettingsCard>
  );
}

/** Contact details live here rather than in every footer. */
export function HelpSection() {
  const tel = supportContact.phone.replace(/\s/g, "");
  const wa = `https://wa.me/44${tel.slice(1)}`;
  return (
    <SettingsCard
      title="Help and contact"
      description={`We are on the phone Monday to Saturday, 8am to 7pm.`}
    >
      <div className="grid gap-2 sm:grid-cols-3">
        {[
          { href: `tel:${tel}`, label: "Call", icon: Phone },
          { href: wa, label: "WhatsApp", icon: MessageCircle },
          { href: `mailto:${supportContact.email}`, label: "Email", icon: Mail },
        ].map(({ href, label, icon: Icon }) => (
          <a
            key={label}
            href={href}
            className="press inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-hairline bg-surface-2 text-[13px] font-semibold hover:bg-surface"
          >
            <Icon className="h-4 w-4" strokeWidth={2.2} />
            {label}
          </a>
        ))}
      </div>
      <p className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted-foreground">
        <a className="underline underline-offset-2" href={ttdSiteLinks.terms}>
          Terms
        </a>
        <a className="underline underline-offset-2" href={ttdSiteLinks.privacy}>
          Privacy
        </a>
        <a className="underline underline-offset-2" href={ttdSiteLinks.cookies}>
          Cookies
        </a>
        <a className="underline underline-offset-2" href={ttdSiteLinks.faq}>
          FAQ
        </a>
      </p>
    </SettingsCard>
  );
}

export function SignOutSection({ email }: { email?: string | null | undefined }) {
  return (
    <SettingsCard title="Session">
      {email ? (
        <p className="mb-3 text-[14px] text-muted-foreground">Signed in as {email}</p>
      ) : null}
      <PrimaryActionButton variant="outline" onClick={() => signOut()}>
        <LogOut className="h-4 w-4" strokeWidth={2.2} />
        Sign out
      </PrimaryActionButton>
    </SettingsCard>
  );
}
