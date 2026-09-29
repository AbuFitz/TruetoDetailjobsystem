import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, KeyRound, ShieldCheck, UserPlus } from "lucide-react";
import { PrimaryActionButton } from "@/components/ttd/PrimaryActionButton";
import { createCustomerAccount, resetCustomerPassword, type TempCredentials } from "@/lib/accounts";
import { ttdSiteLinks } from "@/lib/constants";

interface Props {
  customer: {
    id: string;
    first_name: string;
    email: string | null;
    auth_user_id: string | null;
    must_change_password?: boolean | undefined;
  };
}

/**
 * Staff tools for a customer's sign-in: create the account after booking
 * them in, hand over a temporary password, or reset it. Like a managed work
 * account, the temporary password only gets the customer to a "choose your
 * own password" screen, and it stops working the moment they do.
 */
export function PortalAccessCard({ customer }: Props) {
  const queryClient = useQueryClient();
  const [creds, setCreds] = useState<(TempCredentials & { wasReset: boolean }) | null>(null);
  const [custom, setCustom] = useState("");
  const [showCustom, setShowCustom] = useState(false);
  const [copied, setCopied] = useState<"pw" | "msg" | null>(null);
  const hasAccount = Boolean(customer.auth_user_id);

  const mutation = useMutation({
    mutationFn: () => {
      const pw = custom.trim() || undefined;
      return hasAccount
        ? resetCustomerPassword(customer.id, pw)
        : createCustomerAccount(customer.id, pw);
    },
    onSuccess: (data) => {
      setCreds({ ...data, wasReset: hasAccount });
      setCustom("");
      void queryClient.invalidateQueries({ queryKey: ["admin-customer", customer.id] });
      void queryClient.invalidateQueries({ queryKey: ["customer", customer.id] });
    },
  });

  const message = creds
    ? `Hi ${customer.first_name}, ${creds.wasReset ? "your True To Detail password has been reset" : "your True To Detail account is ready"}.\n\nSign in: ${ttdSiteLinks.website}/account\nEmail: ${creds.email}\nTemporary password: ${creds.temp_password}\n\nYou will be asked to choose your own password when you first sign in.`
    : "";

  async function copy(text: string, which: "pw" | "msg") {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      setTimeout(() => setCopied(null), 2500);
    } catch {
      window.prompt("Copy this", text);
    }
  }

  return (
    <section className="rounded-xl border border-hairline bg-surface p-4">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-signal/10 text-signal">
          {hasAccount ? (
            <ShieldCheck className="h-5 w-5" strokeWidth={2.2} />
          ) : (
            <UserPlus className="h-5 w-5" strokeWidth={2.2} />
          )}
        </span>
        <div className="min-w-0">
          <p className="eyebrow text-muted-foreground">Portal sign-in</p>
          <p className="mt-1 text-[15px] font-semibold">
            {hasAccount
              ? customer.must_change_password
                ? "Account created, waiting for their first sign-in"
                : "Has an account"
              : "No account yet"}
          </p>
          <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
            {hasAccount
              ? "If they forget their password, reset it here and give them the new temporary one. They choose their own next time they sign in."
              : "Booked them in and they would like an account? Create one here and give them the temporary password. Their bookings and vehicles are already attached."}
          </p>
        </div>
      </div>

      {!creds ? (
        <div className="mt-4">
          {!hasAccount && !customer.email ? (
            <p className="rounded-xl bg-surface-2 px-3.5 py-3 text-[13px] text-muted-foreground">
              Add an email address first (Edit above). It becomes their sign-in.
            </p>
          ) : (
            <>
              {showCustom ? (
                <div className="mb-3">
                  <label htmlFor="temp-pw" className="eyebrow block text-muted-foreground">
                    Temporary password (10+ characters)
                  </label>
                  <input
                    id="temp-pw"
                    value={custom}
                    onChange={(e) => setCustom(e.target.value)}
                    autoComplete="off"
                    className="mt-2 min-h-11 w-full rounded-xl border border-input bg-surface-2 px-3.5 font-mono text-sm outline-none focus:border-signal"
                  />
                </div>
              ) : null}
              <div className="flex flex-wrap items-center gap-3">
                <PrimaryActionButton
                  size="md"
                  className="w-auto px-5"
                  loading={mutation.isPending}
                  disabled={showCustom && custom.trim().length > 0 && custom.trim().length < 10}
                  onClick={() => {
                    if (
                      hasAccount &&
                      !window.confirm(
                        "Reset this customer's password? They will be signed out everywhere.",
                      )
                    )
                      return;
                    mutation.mutate();
                  }}
                >
                  {hasAccount ? (
                    <KeyRound className="h-4 w-4" strokeWidth={2.4} />
                  ) : (
                    <UserPlus className="h-4 w-4" strokeWidth={2.4} />
                  )}
                  {hasAccount ? "Reset password" : "Create account"}
                </PrimaryActionButton>
                <button
                  type="button"
                  onClick={() => setShowCustom((v) => !v)}
                  className="press text-[12px] font-medium text-muted-foreground underline underline-offset-2"
                >
                  {showCustom ? "Generate one for me" : "Choose the password myself"}
                </button>
              </div>
            </>
          )}
          {mutation.isError ? (
            <p role="alert" className="mt-3 text-[13px] text-destructive">
              {mutation.error instanceof Error ? mutation.error.message : "Something went wrong."}
            </p>
          ) : null}
        </div>
      ) : (
        <div className="mt-4 rounded-xl border border-signal/30 bg-signal/8 p-4">
          <p className="text-[13px] font-semibold">
            {creds.wasReset ? "Password reset." : "Account created."} Give them these details. The
            password is shown only now.
          </p>
          <dl className="mt-3 grid gap-2 text-[14px]">
            <div>
              <dt className="eyebrow text-muted-foreground">Sign-in email</dt>
              <dd className="font-medium">{creds.email}</dd>
            </div>
            <div>
              <dt className="eyebrow text-muted-foreground">Temporary password</dt>
              <dd className="flex items-center gap-2">
                <code className="rounded-lg bg-background px-3 py-2 font-mono text-[16px] font-semibold tracking-wide">
                  {creds.temp_password}
                </code>
                <button
                  type="button"
                  onClick={() => copy(creds.temp_password, "pw")}
                  aria-label="Copy password"
                  className="press grid h-10 w-10 place-items-center rounded-lg border border-hairline bg-surface hover:bg-surface-2"
                >
                  {copied === "pw" ? (
                    <Check className="h-4 w-4 text-success" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </button>
              </dd>
            </div>
          </dl>
          <button
            type="button"
            onClick={() => copy(message, "msg")}
            className="press mt-3 inline-flex min-h-10 items-center gap-2 border border-hairline bg-surface px-4 text-[12px] font-bold uppercase tracking-[0.1em] hover:bg-surface-2"
          >
            {copied === "msg" ? (
              <Check className="h-4 w-4 text-success" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
            Copy a message to send them
          </button>
          <p className="mt-3 text-[12px] leading-relaxed text-muted-foreground">
            When they sign in they are asked to choose their own password before anything else
            opens. The temporary one stops working then.
          </p>
          <button
            type="button"
            onClick={() => setCreds(null)}
            className="press mt-2 text-[12px] font-medium underline underline-offset-2"
          >
            Done
          </button>
        </div>
      )}
    </section>
  );
}
