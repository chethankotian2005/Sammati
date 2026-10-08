/**
 * ConsoleLayout — the shared chrome for all Company console pages.
 *
 * Structure per ui.md §3:
 *   - Left rail (dark, w-56): logo, nav items (Overview → Evidence), Auditor link.
 *   - Top bar: company switcher pill + CoreChip + WS indicator.
 *   - Main area: receives children.
 *
 * Company switcher lists every approved company from Core (R-04): pills for up
 * to five (faster, and never hides a state), a dropdown beyond that. A company
 * in the sandbox carries a SANDBOX badge.
 *
 * Rail items are not router-aware yet; the active section is passed as a prop.
 * When pages move to sub-routes (e.g. /company/:id/purposes) this becomes a
 * NavLink. For now it is a controlled prop so the gallery can render any state.
 */

import { Link, useNavigate, useParams } from "react-router-dom";
import type { ReactNode } from "react";
import { CoreChip } from "../components";
import { useDirectory } from "../directory";
import { SandboxBadge } from "./SandboxBadge";
import { WsIndicator } from "./WsIndicator";

export type RailSection =
  | "overview"
  | "new-request"
  | "purposes"
  | "consents"
  | "live-requests"
  | "processors"
  | "evidence";

const RAIL_ITEMS: { id: RailSection; label: string; icon: string }[] = [
  { id: "overview",      label: "Overview",       icon: "⊞" },
  { id: "new-request",   label: "New request",    icon: "⌖" },
  { id: "purposes",      label: "Purposes",        icon: "◎" },
  { id: "consents",      label: "Consents",        icon: "✓" },
  { id: "live-requests", label: "Live requests",   icon: "⚡" },
  { id: "processors",    label: "Processors",      icon: "⟳" },
  { id: "evidence",      label: "Evidence",        icon: "🗂" },
];

interface ConsoleLayoutProps {
  children: ReactNode;
  /** Which rail item is active. */
  activeSection?: RailSection;
  /** Called when user clicks a rail item. */
  onSectionChange?: (id: RailSection) => void;
}

export function ConsoleLayout({
  children,
  activeSection = "overview",
  onSectionChange,
}: ConsoleLayoutProps): ReactNode {
  const { id: companyId } = useParams<{ id: string }>();

  return (
    <div className="flex min-h-screen bg-paper">
      {/* ── Left rail ─────────────────────────────────────────── */}
      <nav
        aria-label="Console navigation"
        className="flex w-56 shrink-0 flex-col bg-ink text-paper"
      >
        {/* Logo */}
        <div className="flex h-16 items-center px-5">
          <span className="text-xl font-extrabold tracking-tight">Sammati</span>
        </div>

        {/* Nav items */}
        <ul className="flex-1 space-y-0.5 px-3 py-2" role="list">
          {RAIL_ITEMS.map((item) => {
            const isActive = item.id === activeSection;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  id={`rail-${item.id}`}
                  aria-current={isActive ? "page" : undefined}
                  onClick={() => onSectionChange?.(item.id)}
                  className={`flex w-full items-center gap-3 rounded-row px-3 py-2.5 text-sm font-medium transition-colors
                    ${
                      isActive
                        ? "bg-marigold/20 text-marigold"
                        : "text-paper/70 hover:bg-white/10 hover:text-paper"
                    }`}
                >
                  <span aria-hidden="true" className="text-base leading-none">
                    {item.icon}
                  </span>
                  {item.label}
                </button>
              </li>
            );
          })}
        </ul>

        {/* Bottom: Auditor link */}
        <div className="border-t border-white/10 p-3">
          <Link
            to="/auditor"
            className="flex items-center gap-3 rounded-row px-3 py-2.5 text-sm font-medium text-paper/70 transition-colors hover:bg-white/10 hover:text-paper"
          >
            <span aria-hidden="true" className="text-base leading-none">⚖</span>
            Auditor
          </Link>
          <Link
            to="/stage"
            className="mt-0.5 flex items-center gap-3 rounded-row px-3 py-2.5 text-sm font-medium text-paper/70 transition-colors hover:bg-white/10 hover:text-paper"
          >
            <span aria-hidden="true" className="text-base leading-none">▶</span>
            Stage view
          </Link>
        </div>
      </nav>

      {/* ── Content area ──────────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="flex h-16 items-center justify-between border-b border-line bg-surface px-6">
          {/* Company switcher pill */}
          <CompanySwitcher currentId={companyId} />

          {/* Right: WS + Core status */}
          <div className="flex items-center gap-3">
            <WsIndicator />
            <CoreChip />
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CompanySwitcher
// ---------------------------------------------------------------------------

const MAX_PILLS = 5;

function CompanySwitcher({ currentId }: { currentId: string | undefined }): ReactNode {
  const { fiduciaries, status } = useDirectory();
  const navigate = useNavigate();
  if (status !== "ready") {
    return <span className="text-sm text-mute">{status === "loading" ? "Loading companies…" : "Cannot load the companies"}</span>;
  }
  if (fiduciaries.length > MAX_PILLS) {
    return (
      <label className="flex items-center gap-2 text-sm font-medium text-ink">
        <span className="text-mute">Company</span>
        <select
          aria-label="Switch company"
          value={currentId}
          onChange={(e) => navigate(`/company/${e.target.value}`)}
          className="rounded-pill border border-line bg-paper px-3 py-1.5 text-sm font-medium"
        >
          {fiduciaries.map((f) => (
            <option key={f.slug} value={f.slug}>
              {f.name}
              {f.sandbox ? " (sandbox)" : ""}
            </option>
          ))}
        </select>
      </label>
    );
  }
  return (
    <div
      role="navigation"
      aria-label="Switch company"
      className="flex gap-1 rounded-pill border border-line bg-paper p-1"
    >
      {fiduciaries.map((f) => {
        const isActive = f.slug === currentId;
        return (
          <Link
            key={f.slug}
            to={`/company/${f.slug}`}
            id={`switcher-${f.slug}`}
            aria-current={isActive ? "page" : undefined}
            className={`flex items-center gap-2 rounded-pill px-3 py-1.5 text-sm font-medium transition-colors
              ${isActive ? "bg-ink text-paper shadow-sm" : "text-mute hover:text-ink"}`}
          >
            {/* Company colour dot */}
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: f.color }}
              aria-hidden="true"
            />
            {f.name}
            {f.sandbox && <SandboxBadge size="sm" />}
          </Link>
        );
      })}
    </div>
  );
}
