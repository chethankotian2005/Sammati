/**
 * SANDBOX badge (prd.md R-03, ui.md §3): a company in the test sandbox can only reach the regulator's test
 * customers. Icon and word together, never colour alone; `marigold` outline on `paper`, from the existing tokens.
 */
import type { ReactNode } from "react";

export function SandboxBadge({ size = "md" }: { size?: "sm" | "md" }): ReactNode {
  const sizing = size === "sm" ? "px-1.5 py-0 text-[10px]" : "px-2 py-0.5 text-xs";
  return (
    <span
      title="Test sandbox: only test customers can be asked"
      className={`inline-flex items-center gap-1 rounded-pill border border-marigold bg-paper font-extrabold tracking-wide text-ink ${sizing}`}
    >
      <span aria-hidden="true">⚗</span>
      SANDBOX
    </span>
  );
}
