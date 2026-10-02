import { useState } from "react";
import { Check, Eye, EyeOff } from "lucide-react";
import { AuthField } from "@/components/ttd/PublicShell";
import { cn } from "@/lib/utils";

export const MIN_PASSWORD = 8;

/** The one show/hide control for a password box. The browser's own reveal icon is switched off in the stylesheet. */
export function RevealButton({
  show,
  onToggle,
  className,
}: {
  show: boolean;
  onToggle: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={show ? "Hide password" : "Show password"}
      aria-pressed={show}
      className={cn(
        "press absolute right-1 grid h-11 w-11 place-items-center text-muted-foreground hover:text-foreground",
        className,
      )}
    >
      {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
    </button>
  );
}

export function passwordProblems(pw: string): string[] {
  const out: string[] = [];
  if (pw.length < MIN_PASSWORD) out.push(`At least ${MIN_PASSWORD} characters`);
  if (!/[a-zA-Z]/.test(pw) || !/[0-9]/.test(pw)) out.push("A mix of letters and numbers");
  return out;
}

/** New password + confirm, with a live checklist and a show/hide toggle. */
export function NewPasswordFields({
  password,
  confirm,
  onPassword,
  onConfirm,
  label = "New password",
}: {
  password: string;
  confirm: string;
  onPassword: (v: string) => void;
  onConfirm: (v: string) => void;
  label?: string;
}) {
  const [show, setShow] = useState(false);
  const rules = [
    { ok: password.length >= MIN_PASSWORD, text: `At least ${MIN_PASSWORD} characters` },
    {
      ok: /[a-zA-Z]/.test(password) && /[0-9]/.test(password),
      text: "A mix of letters and numbers",
    },
    { ok: password.length > 0 && password === confirm, text: "Both boxes match" },
  ];
  return (
    <>
      <div className="relative">
        <AuthField
          id="new-password"
          label={label}
          type={show ? "text" : "password"}
          autoComplete="new-password"
          value={password}
          onChange={(e) => onPassword(e.target.value)}
          required
        />
        <RevealButton show={show} onToggle={() => setShow((v) => !v)} className="top-[27px]" />
      </div>
      <AuthField
        id="confirm-password"
        label="Type it again"
        type={show ? "text" : "password"}
        autoComplete="new-password"
        value={confirm}
        onChange={(e) => onConfirm(e.target.value)}
        required
      />
      <ul className="flex flex-col gap-1.5" aria-label="Password rules">
        {rules.map((r) => (
          <li
            key={r.text}
            className={cn(
              "flex items-center gap-2 text-[13px]",
              r.ok ? "text-success" : "text-muted-foreground",
            )}
          >
            <span
              className={cn(
                "grid h-4 w-4 place-items-center rounded-full border",
                r.ok ? "border-success bg-success text-success-foreground" : "border-hairline",
              )}
            >
              {r.ok ? <Check className="h-2.5 w-2.5" strokeWidth={3.5} /> : null}
            </span>
            {r.text}
          </li>
        ))}
      </ul>
    </>
  );
}
