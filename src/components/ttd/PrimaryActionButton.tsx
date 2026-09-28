import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

// Matches the real truetodetail.co.uk CTA buttons exactly (Navbar's "Book
// Now", Hero's "Book Your Detail"): body font (DM Sans) bold, small
// uppercase tracked label, square corners, flat (no shadow), background-
// color-only hover — not the display font, and not rounded.
const actionVariants = cva(
  "press inline-flex w-full items-center justify-center gap-2.5 font-sans font-bold uppercase tracking-[0.1em] outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        signal: "bg-signal text-signal-foreground hover:bg-signal-deep",
        ink: "bg-ink text-ink-foreground hover:bg-ink-soft",
        outline: "border border-hairline bg-surface text-foreground hover:bg-surface-2",
        ghostDestructive:
          "border border-destructive/25 bg-transparent text-destructive hover:bg-destructive/8",
        success: "bg-success text-success-foreground hover:opacity-92",
      },
      size: {
        lg: "min-h-14 px-6 text-[13px]",
        md: "min-h-11 px-4 text-[12px]",
        sm: "min-h-9 px-3 text-[11px]",
      },
    },
    defaultVariants: { variant: "signal", size: "lg" },
  },
);

export interface PrimaryActionButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof actionVariants> {
  loading?: boolean;
}

export function PrimaryActionButton({
  className,
  variant,
  size,
  loading,
  children,
  disabled,
  ...props
}: PrimaryActionButtonProps) {
  return (
    <button
      className={cn(actionVariants({ variant, size }), className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      {children}
    </button>
  );
}
