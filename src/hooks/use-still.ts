import { useEffect } from "react";

/**
 * Makes the page completely still: the stylesheet switches off every animation
 * and transition under `html.ttd-still`. Used by the customer portal and its
 * sign-in pages. Staff and detailer screens keep their short feedback motion.
 */
export function useStillPage(on = true) {
  useEffect(() => {
    if (!on) return;
    const el = document.documentElement;
    el.classList.add("ttd-still");
    return () => el.classList.remove("ttd-still");
  }, [on]);
}

/** True while the current page is one of the still ones (read at call time, not reactive). */
export function isStillPage(): boolean {
  return (
    typeof document !== "undefined" && document.documentElement.classList.contains("ttd-still")
  );
}
