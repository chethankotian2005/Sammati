/**
 * HashLabel — displays a shortened hash (0x4f2a…9be1) and copies the full
 * value to clipboard on click/tap.  Uses IBM Plex Mono (font-mono).
 *
 * Per ui.md §1.2: "Hashes display shortened (0x4f2a…9be1) and copy in full
 * on tap."
 */

import { useState, type ReactNode } from "react";

interface HashLabelProps {
  /** Full 0x-prefixed hex string. */
  value: string;
  /** How many chars to keep at start and end of the short form. Default 6. */
  prefixLen?: number;
  suffixLen?: number;
  className?: string;
}

function shorten(value: string, prefix: number, suffix: number): string {
  if (value.length <= prefix + suffix + 1) return value;
  return `${value.slice(0, prefix)}…${value.slice(-suffix)}`;
}

export function HashLabel({
  value,
  prefixLen = 6,
  suffixLen = 4,
  className = "",
}: HashLabelProps): ReactNode {
  const [copied, setCopied] = useState(false);

  async function handleCopy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard not available in insecure contexts; silently ignore
    }
  }

  const short = shorten(value, prefixLen, suffixLen);

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={copied ? "Copied!" : `Copy full hash: ${value}`}
      aria-label={copied ? "Copied to clipboard" : `Copy hash ${value}`}
      className={`group inline-flex items-center gap-1.5 rounded font-mono ${/text-(xs|sm|base|lg|xl|2xl|3xl)/.test(className) ? "" : "text-xs"} text-mute transition-colors hover:text-ink focus-visible:ring-0 ${className}`}
    >
      <span className="select-all">{short}</span>
      <span
        aria-hidden="true"
        className="opacity-0 transition-opacity group-hover:opacity-60 group-focus-visible:opacity-60"
      >
        {copied ? "✓" : "⎘"}
      </span>
    </button>
  );
}
