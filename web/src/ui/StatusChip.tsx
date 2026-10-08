/**
 * StatusChip — displays ALLOWED/BLOCKED/Active/Withdrawn/Expired with an icon
 * and the text label.  Never relies on colour alone: the icon + text always
 * convey the meaning (ui.md §7 accessibility).
 *
 * Variants map to ui.md tokens:
 *   allowed   → allow  (#12805C)
 *   blocked   → block  (#C8283B)
 *   active    → allow  (same green)
 *   withdrawn → block  (same red)
 *   expired   → mute   (#6B6F8C)
 *   pending   → mute
 */

import type { ReactNode } from "react";

export type ChipVariant =
  | "allowed"
  | "blocked"
  | "active"
  | "withdrawn"
  | "expired"
  | "pending"
  | "tampered"
  | "verified"
  | "unverified";

interface StatusChipProps {
  variant: ChipVariant;
  label?: string; // defaults to the variant name (sentence-cased)
  size?: "sm" | "md";
}

const CONFIGS: Record<
  ChipVariant,
  { icon: string; bg: string; text: string; border: string }
> = {
  allowed:    { icon: "✓", bg: "bg-allow/10",   text: "text-allow",   border: "border-allow/30" },
  active:     { icon: "●", bg: "bg-allow/10",   text: "text-allow",   border: "border-allow/30" },
  verified:   { icon: "✓", bg: "bg-allow/10",   text: "text-allow",   border: "border-allow/30" },
  blocked:    { icon: "✕", bg: "bg-block/10",   text: "text-block",   border: "border-block/30" },
  withdrawn:  { icon: "○", bg: "bg-block/10",   text: "text-block",   border: "border-block/30" },
  tampered:   { icon: "!", bg: "bg-block/10",   text: "text-block",   border: "border-block/30" },
  expired:    { icon: "⏱", bg: "bg-mute/10",    text: "text-mute",    border: "border-mute/30"  },
  pending:    { icon: "…", bg: "bg-mute/10",    text: "text-mute",    border: "border-mute/30"  },
  unverified: { icon: "?", bg: "bg-mute/10",    text: "text-mute",    border: "border-mute/30"  },
};

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function StatusChip({ variant, label, size = "md" }: StatusChipProps): ReactNode {
  const cfg = CONFIGS[variant];
  const text = label ?? capitalize(variant);
  const sizeClass = size === "sm" ? "px-2 py-0.5 text-xs gap-1" : "px-3 py-1 text-sm gap-1.5";

  return (
    <span
      className={`inline-flex items-center rounded-pill border font-medium ${sizeClass} ${cfg.bg} ${cfg.text} ${cfg.border}`}
      aria-label={text}
    >
      <span aria-hidden="true" className="leading-none">
        {cfg.icon}
      </span>
      {text}
    </span>
  );
}
