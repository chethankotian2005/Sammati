/**
 * StatCard — one of the four header numbers on the console Overview and
 * Auditor scorecard (ui.md §3, §4).
 *
 * Deliberately NOT a generic grey-shadow card grid.  Uses a left accent bar
 * in the company/status colour to give each number character.
 */

import type { ReactNode } from "react";

interface StatCardProps {
  label: string;
  value: string | number;
  /** Optional sublabel or change hint (e.g. "+3 in last hour"). */
  sub?: string;
  /**
   * Left-border accent colour (CSS colour string or a Tailwind class suffix).
   * Accepts a hex string for inline style.
   */
  accentColor?: string;
  /** Optional icon (emoji or small SVG string) placed above the number. */
  icon?: ReactNode;
  id?: string;
}

export function StatCard({
  label,
  value,
  sub,
  accentColor,
  icon,
  id,
}: StatCardProps): ReactNode {
  return (
    <article
      id={id}
      aria-label={`${label}: ${value}`}
      className="flex flex-col gap-1 rounded-pass border border-line bg-surface px-5 py-4"
      style={
        accentColor
          ? { borderLeft: `4px solid ${accentColor}` }
          : { borderLeft: "4px solid #E3E5F0" }
      }
    >
      {icon && (
        <span aria-hidden="true" className="text-xl leading-none">
          {icon}
        </span>
      )}
      <p className="text-sm font-medium text-mute">{label}</p>
      <p className="text-[28px] font-extrabold leading-none text-ink">
        {value}
      </p>
      {sub && <p className="text-xs text-mute">{sub}</p>}
    </article>
  );
}
