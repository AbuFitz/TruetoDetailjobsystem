import type { UseFormRegisterReturn } from "react-hook-form";

/** Shared text-input treatment for booking/admin/detailer forms. */
export function Field({
  id,
  label,
  type = "text",
  mono,
  upper,
  placeholder,
  error,
  className,
  inputProps,
}: {
  id: string;
  label: string;
  type?: string;
  mono?: boolean;
  upper?: boolean;
  placeholder?: string;
  error?: string | undefined;
  className?: string;
  inputProps: UseFormRegisterReturn;
}) {
  return (
    <div className={className}>
      <label htmlFor={id} className="eyebrow block text-muted-foreground">
        {label}
      </label>
      <input
        id={id}
        type={type}
        placeholder={placeholder}
        aria-invalid={Boolean(error)}
        className={`mt-2 min-h-12 w-full rounded-2xl border bg-surface-2 px-3.5 text-base font-medium outline-none transition-colors placeholder:font-normal placeholder:text-muted-foreground/60 focus:border-signal focus:bg-surface focus:ring-2 focus:ring-signal/30 ${
          error ? "border-destructive/50" : "border-input"
        } ${mono ? "font-mono" : ""} ${upper ? "uppercase tracking-wide" : ""}`}
        {...inputProps}
      />
      {error ? <p className="mt-1.5 text-[12px] text-destructive">{error}</p> : null}
    </div>
  );
}

/** Same treatment as Field, for multi-line input. */
export function TextareaField({
  id,
  label,
  placeholder,
  error,
  rows = 3,
  className,
  inputProps,
}: {
  id: string;
  label: string;
  placeholder?: string;
  error?: string | undefined;
  rows?: number;
  className?: string;
  inputProps: UseFormRegisterReturn;
}) {
  return (
    <div className={className}>
      <label htmlFor={id} className="eyebrow block text-muted-foreground">
        {label}
      </label>
      <textarea
        id={id}
        rows={rows}
        placeholder={placeholder}
        aria-invalid={Boolean(error)}
        className={`mt-2 w-full resize-none rounded-xl border bg-surface-2 px-3.5 py-3 text-base font-medium outline-none transition-colors placeholder:font-normal placeholder:text-muted-foreground/60 focus:border-signal focus:bg-surface focus:ring-2 focus:ring-signal/30 ${
          error ? "border-destructive/50" : "border-input"
        }`}
        {...inputProps}
      />
      {error ? <p className="mt-1.5 text-[12px] text-destructive">{error}</p> : null}
    </div>
  );
}

/** A labelled Yes/No/Unset toggle — used for water/electric availability. */
export function YesNoField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean | null;
  onChange: (value: boolean | null) => void;
}) {
  return (
    <div>
      <span className="eyebrow block text-muted-foreground">{label}</span>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => onChange(value === true ? null : true)}
          className={`press min-h-11 rounded-xl border text-sm font-semibold transition-colors ${
            value === true
              ? "border-success/40 bg-success/12 text-success"
              : "border-input bg-surface-2 text-muted-foreground hover:bg-surface"
          }`}
        >
          Yes
        </button>
        <button
          type="button"
          onClick={() => onChange(value === false ? null : false)}
          className={`press min-h-11 rounded-xl border text-sm font-semibold transition-colors ${
            value === false
              ? "border-destructive/40 bg-destructive/10 text-destructive"
              : "border-input bg-surface-2 text-muted-foreground hover:bg-surface"
          }`}
        >
          No
        </button>
      </div>
    </div>
  );
}
