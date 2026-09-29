import { useCallback, useEffect, useState } from "react";

export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "ttd-theme";

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
}

/**
 * Reads/writes the dark-mode preference. The inline script in __root.tsx's
 * <head> applies the stored (or system) theme before first paint so there's
 * no flash of the wrong theme — this hook just picks up that state and lets
 * the user flip it.
 */
export function useTheme() {
  // Always start as "light", which is what the server rendered; reading the
  // class here made the first client render disagree with the server HTML
  // for anyone who'd chosen dark mode (React hydration error #418). The
  // effect below picks up the real theme straight after mount.
  const [theme, setThemeState] = useState<Theme>("light");

  useEffect(() => {
    setThemeState(document.documentElement.classList.contains("dark") ? "dark" : "light");
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => {
      const next: Theme = prev === "dark" ? "light" : "dark";
      applyTheme(next);
      try {
        localStorage.setItem(THEME_STORAGE_KEY, next);
      } catch {
        // Private browsing / storage disabled — theme still applies for this load.
      }
      return next;
    });
  }, []);

  return { theme, toggleTheme };
}
