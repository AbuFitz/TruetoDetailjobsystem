import { useCallback, useEffect, useRef, useState } from "react";

/** Copy-to-clipboard with a short-lived "copied" confirmation flag. */
export function useCopyToClipboard(resetMs = 2000) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const copy = useCallback(
    async (value: string) => {
      setError(null);
      try {
        if (!navigator.clipboard?.writeText) throw new Error("Clipboard API unavailable");
        await navigator.clipboard.writeText(value);
      } catch {
        try {
          const el = document.createElement("textarea");
          el.value = value;
          el.style.position = "fixed";
          el.style.opacity = "0";
          document.body.appendChild(el);
          el.select();
          const ok = document.execCommand("copy");
          el.remove();
          if (!ok) throw new Error("execCommand copy failed");
        } catch {
          setError("Couldn't copy automatically — select and copy the link manually.");
          return;
        }
      }
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), resetMs);
    },
    [resetMs],
  );

  return { copied, copy, error };
}
