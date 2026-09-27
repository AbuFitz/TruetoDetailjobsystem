import { cn } from "@/lib/utils";

const SIZES = {
  sm: "h-9 w-9 text-sm",
  md: "h-12 w-12 text-lg",
  lg: "h-16 w-16 text-2xl",
} as const;

/** Photo when set, falling back to an initials circle — used for detailer avatars. */
export function Avatar({
  name,
  photoUrl,
  size = "md",
  className,
}: {
  name: string;
  photoUrl?: string | null | undefined;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt={name}
        className={cn(
          "shrink-0 rounded-full border border-hairline object-cover",
          SIZES[size],
          className,
        )}
      />
    );
  }
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center rounded-full bg-ink font-display font-bold text-signal",
        SIZES[size],
        className,
      )}
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}
