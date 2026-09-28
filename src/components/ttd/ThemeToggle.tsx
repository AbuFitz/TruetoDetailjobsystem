import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/hooks/use-theme";
import { cn } from "@/lib/utils";

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggleTheme } = useTheme();
  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      className={cn(
        "press grid h-9 w-9 shrink-0 place-items-center rounded-full border border-hairline bg-surface-2 text-muted-foreground hover:text-foreground",
        className,
      )}
    >
      {theme === "dark" ? (
        <Sun className="h-4 w-4" strokeWidth={2.2} />
      ) : (
        <Moon className="h-4 w-4" strokeWidth={2.2} />
      )}
    </button>
  );
}
