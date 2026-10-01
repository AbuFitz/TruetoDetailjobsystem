/**
 * Guides a customer to the next part of a form after they make a choice: the
 * next section scrolls into view inside whatever scrolls (a popup body or
 * the page) and gets a brief outline so the eye lands on it. It stops a
 * little below the top, so the choice they just made stays visible above it.
 * Sections already comfortably on screen are left alone, so nothing jumps in
 * a tall desktop window where the whole step fits.
 */

function scrollParent(el: HTMLElement): HTMLElement | null {
  let node: HTMLElement | null = el.parentElement;
  while (node) {
    const overflowY = getComputedStyle(node).overflowY;
    if ((overflowY === "auto" || overflowY === "scroll") && node.scrollHeight > node.clientHeight)
      return node;
    node = node.parentElement;
  }
  return null;
}

/** Gap kept above the target: about a fifth of the visible area, between 72 and 170px. */
function topGap(viewHeight: number): number {
  return Math.max(72, Math.min(170, Math.round(viewHeight * 0.22)));
}

function comfortablyVisible(el: HTMLElement, parent: HTMLElement | null): boolean {
  const rect = el.getBoundingClientRect();
  const box = parent ? parent.getBoundingClientRect() : { top: 0, bottom: window.innerHeight };
  const height = box.bottom - box.top;
  return rect.top >= box.top + 4 && rect.top <= box.bottom - Math.min(220, height * 0.45);
}

export function guideTo(
  el: HTMLElement | null | undefined,
  opts: { highlight?: boolean } = {},
): void {
  if (!el || typeof window === "undefined") return;
  // Let the choice render first (prices, disabled slots) so positions are final.
  window.setTimeout(() => {
    const parent = scrollParent(el);
    const reduced =
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ||
      document.documentElement.classList.contains("ttd-still");
    if (!comfortablyVisible(el, parent)) {
      const box = parent ? parent.getBoundingClientRect() : { top: 0, bottom: window.innerHeight };
      const delta = el.getBoundingClientRect().top - box.top - topGap(box.bottom - box.top);
      const behavior = reduced ? "auto" : "smooth";
      if (parent) parent.scrollBy({ top: delta, behavior });
      else window.scrollBy({ top: delta, behavior });
    }
    if (opts.highlight !== false && !reduced) {
      const prevShadow = el.style.boxShadow;
      const prevTransition = el.style.transition;
      el.style.transition = "box-shadow 0.35s ease";
      el.style.boxShadow = "0 0 0 6px rgba(232,74,12,0.14)";
      window.setTimeout(() => {
        el.style.boxShadow = prevShadow;
        window.setTimeout(() => {
          el.style.transition = prevTransition;
        }, 400);
      }, 900);
    }
  }, 90);
}
