/**
 * Gallery — component showcase route (/gallery).
 * Shows every shared UI component with realistic demo data so the team can
 * verify tokens, spacing, animations, and accessibility without running Core.
 *
 * Not a production route — for dev review only.
 */

import { useState, type ReactNode } from "react";
import {
  StatusChip,
  HashLabel,
  Feed,
  StatCard,
  Drawer,
  DataTable,
  ConsoleLayout,
} from "../ui";
import type { FeedRowData, Column } from "../ui";
import { CoreChip } from "../components";
import { SEED_FIDUCIARIES } from "@sammati/shared";

// ---------------------------------------------------------------------------
// Demo data
// ---------------------------------------------------------------------------

const HASH_A = "0x4f2a7e8c9d1b3f0a2e5d7c8b9f1a3e2d4c6b8a0f9e1d2c3b4a5f6e7d8c9b0a";
const HASH_B = "0x9be1a2b3c4d5e6f70819a0b1c2d3e4f506172839a0b1c2d3e4f50a1b2c3d4e5";

const FEED_ROWS: FeedRowData[] = [
  {
    id: "f1",
    companyColor: "#2F5BEA",
    companyName: "QuickLoan",
    purposeCode: "credit_check",
    decision: "ALLOWED",
    reason: "OK",
    endpoint: "GET /customers/:id/credit-profile",
    at: Math.floor(Date.now() / 1000) - 8,
    latencyMs: 12,
    txHash: HASH_A,
  },
  {
    id: "f2",
    companyColor: "#2F5BEA",
    companyName: "QuickLoan",
    purposeCode: "marketing",
    decision: "BLOCKED",
    reason: "CONSENT_WITHDRAWN",
    endpoint: "POST /customers/:id/sms",
    at: Math.floor(Date.now() / 1000) - 45,
    latencyMs: 9,
    txHash: HASH_B,
  },
  {
    id: "f3",
    companyColor: "#0E9AA7",
    companyName: "MediCare+",
    purposeCode: "treatment",
    decision: "ALLOWED",
    reason: "OK",
    endpoint: "GET /patients/:id/records",
    at: Math.floor(Date.now() / 1000) - 120,
    latencyMs: 18,
  },
  {
    id: "f4",
    companyColor: "#E4572E",
    companyName: "FoodRush",
    purposeCode: "ad_targeting",
    decision: "BLOCKED",
    reason: "CONSENT_EXPIRED",
    endpoint: "GET /users/:id/profile",
    at: Math.floor(Date.now() / 1000) - 300,
    latencyMs: 7,
  },
];

interface TableRow {
  id: string;
  company: string;
  purpose: string;
  principal: string;
  status: string;
  grantedAt: string;
}

const TABLE_ROWS: TableRow[] = SEED_FIDUCIARIES.flatMap((f) =>
  f.purposes.map((p, i) => ({
    id: `${f.slug}-${p.code}`,
    company: f.name,
    purpose: p.title.en,
    principal: "0xf39F…2266",
    status: i === 1 ? "Withdrawn" : "Active",
    grantedAt: "2026-10-01",
  })),
);

const TABLE_COLS: Column<TableRow>[] = [
  { key: "company",   header: "Company",   sortValue: (r) => r.company },
  { key: "purpose",   header: "Purpose",   sortValue: (r) => r.purpose },
  { key: "principal", header: "Principal" },
  {
    key: "status",
    header: "Status",
    sortValue: (r) => r.status,
    render: (r) => (
      <StatusChip
        variant={r.status === "Active" ? "active" : "withdrawn"}
        size="sm"
      />
    ),
  },
  { key: "grantedAt", header: "Granted",   sortValue: (r) => r.grantedAt, align: "right" },
];

// ---------------------------------------------------------------------------
// Section wrapper
// ---------------------------------------------------------------------------

function Section({
  title,
  id,
  children,
}: {
  title: string;
  id: string;
  children: ReactNode;
}): ReactNode {
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className="flex flex-col gap-4">
      <h2
        id={`${id}-heading`}
        className="border-b border-line pb-2 text-lg font-bold text-ink"
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Gallery page
// ---------------------------------------------------------------------------

export function Gallery(): ReactNode {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [newIds] = useState(() => new Set(["f1", "f2"]));
  const [activeSection, setActiveSection] =
    useState<import("../ui").RailSection>("overview");

  return (
    <ConsoleLayout
      activeSection={activeSection}
      onSectionChange={setActiveSection}
    >
      <div className="mx-auto max-w-5xl space-y-12 py-4">
        <header>
          <h1 className="text-[28px] font-extrabold">Component gallery</h1>
          <p className="mt-1 text-sm text-mute">
            Every shared UI primitive rendered with demo data. Tokens, radii,
            and motion are from <code className="font-mono">docs/ui.md</code>.
          </p>
        </header>

        {/* ── StatusChip ────────────────────────────────────── */}
        <Section title="StatusChip" id="status-chip">
          <p className="text-sm text-mute">
            All variants at both sizes. Icon + text, never colour-only.
          </p>
          <div className="flex flex-wrap gap-3">
            {(
              [
                "allowed",
                "blocked",
                "active",
                "withdrawn",
                "expired",
                "pending",
                "verified",
                "unverified",
                "tampered",
              ] as const
            ).map((v) => (
              <div key={v} className="flex flex-col items-start gap-1">
                <StatusChip variant={v} />
                <StatusChip variant={v} size="sm" />
              </div>
            ))}
          </div>
        </Section>

        {/* ── HashLabel ─────────────────────────────────────── */}
        <Section title="HashLabel" id="hash-label">
          <p className="text-sm text-mute">
            Shows shortened form; click to copy the full hash. Uses IBM Plex
            Mono.
          </p>
          <div className="flex flex-col gap-3 rounded-pass border border-line bg-surface p-5">
            <div className="flex items-center gap-4">
              <span className="w-28 text-sm text-mute">Default (6+4):</span>
              <HashLabel value={HASH_A} />
            </div>
            <div className="flex items-center gap-4">
              <span className="w-28 text-sm text-mute">Longer (8+6):</span>
              <HashLabel value={HASH_B} prefixLen={8} suffixLen={6} />
            </div>
            <div className="flex items-center gap-4">
              <span className="w-28 text-sm text-mute">Short address:</span>
              <HashLabel value="0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" />
            </div>
          </div>
        </Section>

        {/* ── StatCard ──────────────────────────────────────── */}
        <Section title="StatCard" id="stat-card">
          <p className="text-sm text-mute">
            Four numbers per company overview. Left accent bar differentiates,
            not generic shadows.
          </p>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <StatCard
              id="stat-active"
              label="Active consents"
              value={142}
              sub="+3 this hour"
              accentColor="#2F5BEA"
              icon="✓"
            />
            <StatCard
              id="stat-allowed"
              label="Allowed today"
              value={891}
              accentColor="#12805C"
              icon="⚡"
            />
            <StatCard
              id="stat-blocked"
              label="Blocked today"
              value={37}
              sub="4.0% block rate"
              accentColor="#C8283B"
              icon="✕"
            />
            <StatCard
              id="stat-anchor"
              label="Last anchor"
              value="2 min ago"
              accentColor="#F4A300"
              icon="⚓"
            />
          </div>
        </Section>

        {/* ── FeedRow / Feed ────────────────────────────────── */}
        <Section title="Feed (FeedRow)" id="feed-row">
          <p className="text-sm text-mute">
            Rows slide in from top. BLOCKED rows have a red left border and
            reason code. First two rows get the colour-wash on mount.
          </p>
          <Feed rows={FEED_ROWS} newIds={newIds} />
        </Section>

        {/* ── DataTable ─────────────────────────────────────── */}
        <Section title="DataTable" id="data-table">
          <p className="text-sm text-mute">
            Filterable, sortable. Click a column header to sort; click again to
            flip direction.
          </p>
          <DataTable
            columns={TABLE_COLS}
            rows={TABLE_ROWS}
            rowKey={(r) => r.id}
            caption="Demo consent rows"
          />
        </Section>

        {/* ── Drawer ────────────────────────────────────────── */}
        <Section title="Drawer" id="drawer">
          <p className="text-sm text-mute">
            Slides in from the right. Focus trap, Escape to close, body scroll
            lock, reduced-motion safe.
          </p>
          <button
            id="open-drawer-btn"
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="rounded-row bg-ink px-4 py-2 text-sm font-medium text-paper transition-colors hover:bg-ink/80"
          >
            Open Drawer →
          </button>
          <Drawer
            open={drawerOpen}
            onClose={() => setDrawerOpen(false)}
            title="Add purpose"
          >
            <div className="flex flex-col gap-4">
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium">Purpose code</span>
                <input
                  type="text"
                  placeholder="e.g. credit_check"
                  className="rounded-row border border-line px-3 py-2 text-sm focus:outline-none focus-visible:border-marigold"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium">Description (English)</span>
                <textarea
                  rows={3}
                  placeholder="Plain language description…"
                  className="rounded-row border border-line px-3 py-2 text-sm focus:outline-none focus-visible:border-marigold"
                />
              </label>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  className="flex-1 rounded-row bg-ink px-4 py-2 text-sm font-medium text-paper hover:bg-ink/80"
                >
                  Register purpose
                </button>
                <button
                  type="button"
                  onClick={() => setDrawerOpen(false)}
                  className="rounded-row border border-line px-4 py-2 text-sm font-medium text-mute hover:text-ink"
                >
                  Cancel
                </button>
              </div>
            </div>
          </Drawer>
        </Section>

        {/* ── Typography ────────────────────────────────────── */}
        <Section title="Typography & tokens" id="typography">
          <div className="grid grid-cols-2 gap-6 md:grid-cols-3">
            <div className="flex flex-col gap-2 rounded-pass border border-line bg-surface p-5">
              <p className="text-sm text-mute">Type scale</p>
              <p className="text-[28px] font-extrabold leading-tight">28 — Title</p>
              <p className="text-xl font-bold">20 — Section</p>
              <p className="text-base font-medium">16 — Body</p>
              <p className="text-sm">14 — Small</p>
              <p className="text-xs text-mute">12 — Caption</p>
              <p className="font-mono text-sm">mono — hash</p>
            </div>
            <div className="flex flex-col gap-2 rounded-pass border border-line bg-surface p-5">
              <p className="text-sm text-mute">Colour tokens</p>
              {[
                ["ink",      "#16173F"],
                ["marigold", "#F4A300"],
                ["paper",    "#F6F7FB"],
                ["surface",  "#FFFFFF"],
                ["allow",    "#12805C"],
                ["block",    "#C8283B"],
                ["mute",     "#6B6F8C"],
                ["line",     "#E3E5F0"],
              ].map(([name, hex]) => (
                <div key={name} className="flex items-center gap-2">
                  <span
                    className="h-4 w-4 rounded border border-line"
                    style={{ backgroundColor: hex }}
                  />
                  <span className="font-mono text-xs">{name}</span>
                  <span className="text-xs text-mute">{hex}</span>
                </div>
              ))}
            </div>
            <div className="flex flex-col gap-2 rounded-pass border border-line bg-surface p-5">
              <p className="text-sm text-mute">Radius hierarchy</p>
              <div className="h-12 rounded-pass bg-marigold/20 text-center text-xs leading-[48px]">
                pass (20px)
              </div>
              <div className="h-10 rounded-row bg-ink/10 text-center text-xs leading-10">
                row (14px)
              </div>
              <div className="flex gap-2">
                <div className="flex h-8 flex-1 items-center justify-center rounded-pill bg-allow/20 text-xs">
                  pill (999px)
                </div>
                <CoreChip />
              </div>
            </div>
          </div>
        </Section>
      </div>
    </ConsoleLayout>
  );
}
