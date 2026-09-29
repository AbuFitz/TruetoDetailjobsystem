import { useEffect, type RefObject } from "react";

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  'input:not([disabled]):not([type="hidden"])',
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

/**
 * Keyboard and scroll behaviour every popup needs while it's open: focus
 * moves into it, Tab and Shift+Tab stay inside it, the page behind stops
 * scrolling, and focus returns to whatever opened it once it closes.
 * `initialFocus` picks where focus lands; by default the container itself,
 * so a screen reader announces the dialog before its first control.
 */
export function useDialogFocus(
  container: RefObject<HTMLElement | null>,
  open: boolean,
  initialFocus?: RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    if (!open) return;
    const el = container.current;
    if (!el) return;

    const opener = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const target = initialFocus?.current ?? el;
    if (target === el) {
      if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "-1");
      // Focus sits on the panel only so it's announced; no ring round the whole popup.
      el.style.setProperty("outline", "none");
    }
    target.focus({ preventScroll: true });

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const items = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (n) => n.offsetParent !== null || n === document.activeElement,
      );
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0]!;
      const last = items[items.length - 1]!;
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === el || !el.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !el.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      if (opener && document.contains(opener)) opener.focus({ preventScroll: true });
    };
  }, [open, container, initialFocus]);
}
