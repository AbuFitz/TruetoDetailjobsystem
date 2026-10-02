import { Check, Copy, ExternalLink } from "lucide-react";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";

/**
 * A detailer's personal job link: the link itself opens it (in a new tab), with
 * buttons to open and to copy it, so it can be tried straight from the admin
 * pages and not only pasted somewhere else.
 */
export function DetailerLinkRow({ link, className }: { link: string; className?: string }) {
  const { copied, copy } = useCopyToClipboard();
  const button =
    "press grid h-11 w-11 shrink-0 place-items-center rounded-full border border-hairline hover:bg-surface-2";
  return (
    <div
      className={`flex items-center gap-1.5 rounded-xl border border-hairline bg-surface p-1.5 pl-3.5 ${className ?? ""}`}
    >
      <a
        href={link}
        target="_blank"
        rel="noopener noreferrer"
        className="min-w-0 flex-1 truncate text-[13px] underline-offset-2 hover:underline"
      >
        {link}
      </a>
      <a
        href={link}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Open detailer link"
        className={button}
      >
        <ExternalLink className="h-4 w-4" />
      </a>
      <button
        type="button"
        onClick={() => copy(link)}
        aria-label={copied ? "Link copied" : "Copy detailer link"}
        className={button}
      >
        {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
      </button>
    </div>
  );
}
