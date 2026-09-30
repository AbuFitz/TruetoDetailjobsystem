import { useEffect, useRef, useState } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

/** True when the device asks for less motion. False on the server and until mounted. */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(QUERY);
    setReduced(mq.matches);
    const on = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduced;
}

/**
 * Counts from a starting value up to a target, once, so a figure that has
 * just loaded feels like it arrived rather than appeared. Shows the target
 * straight away under reduced motion, and on the server.
 */
export function useCountUp(target: number, opts: { from?: number; durationMs?: number } = {}) {
  const { from = 0, durationMs = 700 } = opts;
  const reduced = usePrefersReducedMotion();
  const [value, setValue] = useState(target);
  const first = useRef(true);
  useEffect(() => {
    if (reduced || (first.current && target === from)) {
      setValue(target);
      first.current = false;
      return;
    }
    const start = first.current ? from : value;
    first.current = false;
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / durationMs);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(Math.round(start + (target - start) * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // `value` is read only to continue smoothly from where the count is now.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, from, durationMs, reduced]);
  return value;
}

/** True once the element has scrolled into view (and stays true), for reveal-on-scroll. */
export function useInView<T extends Element>(rootMargin = "0px 0px -8% 0px") {
  const ref = useRef<T | null>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    if (typeof IntersectionObserver === "undefined") {
      setSeen(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSeen(true);
          io.disconnect();
        }
      },
      { rootMargin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [seen, rootMargin]);
  return { ref, seen };
}
