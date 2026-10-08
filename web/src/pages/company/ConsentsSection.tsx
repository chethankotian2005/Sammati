/**
 * ConsentsSection — C-07:
 * "Consents: table of customers by purpose with status, filterable."
 * Live table of customers and per-purpose status.
 */

import { useState, useMemo, type ReactNode } from "react";
import type { ConsentRow, NoticePurpose, SeedFiduciary } from "@sammati/shared";
import { DataTable, StatusChip, HashLabel, type Column } from "../../ui";

interface ConsentsSectionProps {
  company: SeedFiduciary;
  consents: ConsentRow[];
  purposes: NoticePurpose[];
  onRequestNew: () => void;
}

export function ConsentsSection({
  company,
  consents,
  purposes,
  onRequestNew,
}: ConsentsSectionProps): ReactNode {
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "withdrawn">("all");
  const [purposeFilter, setPurposeFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const filteredRows = useMemo(() => {
    return consents.filter((row) => {
      // Status filter
      if (statusFilter === "active" && row.status !== "Active") return false;
      if (statusFilter === "withdrawn" && row.status !== "Withdrawn") return false;

      // Purpose filter
      if (purposeFilter !== "all" && row.purposeCode !== purposeFilter) return false;

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const aliasMatch = row.customerAlias?.toLowerCase().includes(q) ?? false;
        const principalMatch = row.principal.toLowerCase().includes(q);
        const purposeMatch = row.purposeCode.toLowerCase().includes(q);
        if (!aliasMatch && !principalMatch && !purposeMatch) return false;
      }

      return true;
    });
  }, [consents, statusFilter, purposeFilter, searchQuery]);

  const columns: Column<ConsentRow>[] = [
    {
      key: "customer",
      header: "Customer",
      render: (row) => (
        <div className="space-y-0.5">
          <div className="font-bold text-ink">
            {row.customerAlias || "Citizen"}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-mute">
            <HashLabel value={row.principal} />
          </div>
        </div>
      ),
    },
    {
      key: "purpose",
      header: "Purpose",
      render: (row) => {
        const found = purposes.find((p) => p.code === row.purposeCode);
        return (
          <div className="space-y-0.5">
            <span className="font-bold text-ink">
              {found ? found.title.en : row.purposeCode}
            </span>
            <div className="font-mono text-[11px] text-mute">
              {row.purposeCode}
            </div>
          </div>
        );
      },
    },
    {
      key: "status",
      header: "Status",
      width: "w-32",
      render: (row) => (
        <StatusChip
          variant={row.status === "Active" ? "active" : "withdrawn"}
          label={row.status}
        />
      ),
    },
    {
      key: "grantedAt",
      header: "Granted at",
      render: (row) => (
        <span className="text-xs text-mute">
          {row.grantedAt
            ? new Date(row.grantedAt * 1000).toLocaleString([], {
                dateStyle: "short",
                timeStyle: "short",
              })
            : "—"}
        </span>
      ),
    },
    {
      key: "expiresAt",
      header: "Expires at",
      render: (row) => (
        <span className="text-xs text-mute">
          {row.expiresAt
            ? new Date(row.expiresAt * 1000).toLocaleDateString([], {
                dateStyle: "medium",
              })
            : "No expiry"}
        </span>
      ),
    },
    {
      key: "lastTx",
      header: "On-chain Tx",
      width: "w-36",
      render: (row) =>
        row.lastTx ? (
          <HashLabel value={row.lastTx} />
        ) : (
          <span className="text-xs text-mute">—</span>
        ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-ink">Customer Consents</h2>
          <p className="text-sm text-mute">
            Live verifiable consent status per customer and purpose (C-07).
          </p>
        </div>

        <button
          type="button"
          onClick={onRequestNew}
          className="flex items-center gap-2 rounded-row bg-ink px-4 py-2 text-sm font-bold text-paper transition-colors hover:bg-ink/90"
        >
          <span className="text-base text-marigold">+</span>
          New consent request
        </button>
      </div>

      {/* Filters bar */}
      <div className="flex flex-wrap items-center gap-4 rounded-pass border border-line bg-surface p-4 shadow-sm">
        {/* Search */}
        <div className="flex-1 min-w-[200px]">
          <input
            type="text"
            placeholder="Search alias, address, or purpose…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-row border border-line bg-surface px-3 py-1.5 text-xs text-ink placeholder:text-mute focus:border-marigold focus:outline-none"
          />
        </div>

        {/* Status Filter */}
        <div className="flex items-center rounded-pill border border-line bg-paper/60 p-1 text-xs">
          <button
            type="button"
            onClick={() => setStatusFilter("all")}
            className={`rounded-pill px-3 py-1 font-bold transition-colors ${
              statusFilter === "all" ? "bg-ink text-paper" : "text-mute hover:text-ink"
            }`}
          >
            All
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("active")}
            className={`rounded-pill px-3 py-1 font-bold transition-colors ${
              statusFilter === "active" ? "bg-allow text-paper" : "text-mute hover:text-ink"
            }`}
          >
            Active
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("withdrawn")}
            className={`rounded-pill px-3 py-1 font-bold transition-colors ${
              statusFilter === "withdrawn" ? "bg-block text-paper" : "text-mute hover:text-ink"
            }`}
          >
            Withdrawn
          </button>
        </div>

        {/* Purpose Filter */}
        <select
          value={purposeFilter}
          onChange={(e) => setPurposeFilter(e.target.value)}
          className="rounded-row border border-line bg-surface px-3 py-1.5 text-xs text-ink focus:border-marigold focus:outline-none font-semibold"
        >
          <option value="all">All purposes</option>
          {purposes.map((p) => (
            <option key={p.code} value={p.code}>
              {p.title.en}
            </option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="rounded-pass border border-line bg-surface p-4 shadow-sm">
        <DataTable
          columns={columns}
          rows={filteredRows}
          rowKey={(r) => `${r.principal}-${r.purposeId}`}
          caption={`${company.name} consent records`}
          filterable={false}
          emptyMessage="No matching consent records found."
        />
      </div>
    </div>
  );
}
