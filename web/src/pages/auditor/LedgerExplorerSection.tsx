/**
 * LedgerExplorerSection — A-02:
 * "Ledger explorer: reverse-chronological table with type, principal alias (short address),
 *  company, purpose, tx, ledger head; filters on top."
 */

import { useState, useMemo, type ReactNode } from "react";
import {
  SEED_FIDUCIARIES,
  type LedgerEventType,
  type LedgerEventView,
} from "@sammati/shared";
import { DataTable, HashLabel, StatusChip, type Column } from "../../ui";

interface LedgerExplorerSectionProps {
  events: LedgerEventView[];
  onFilterChange: (params: { fid?: string; type?: string }) => void;
}

const EVENT_TYPE_LABELS: Record<LedgerEventType, string> = {
  granted: "Consent Granted",
  withdrawn: "Consent Withdrawn",
  ack: "Cascade Ack",
  anchor: "Access Batch Anchored",
  purpose: "Purpose Registered",
};

export function LedgerExplorerSection({
  events,
  onFilterChange,
}: LedgerExplorerSectionProps): ReactNode {
  const [selectedFid, setSelectedFid] = useState<string>("all");
  const [selectedType, setSelectedType] = useState<string>("all");
  const [search, setSearch] = useState("");

  const handleFidChange = (fid: string) => {
    setSelectedFid(fid);
    onFilterChange({
      fid: fid === "all" ? undefined : fid,
      type: selectedType === "all" ? undefined : selectedType,
    });
  };

  const handleTypeChange = (type: string) => {
    setSelectedType(type);
    onFilterChange({
      fid: selectedFid === "all" ? undefined : selectedFid,
      type: type === "all" ? undefined : type,
    });
  };

  const filteredEvents = useMemo(() => {
    if (!search.trim()) return events;
    const q = search.toLowerCase();
    return events.filter(
      (e) =>
        e.txHash.toLowerCase().includes(q) ||
        (e.principal && e.principal.toLowerCase().includes(q)) ||
        (e.ledgerHead && e.ledgerHead.toLowerCase().includes(q)) ||
        e.type.toLowerCase().includes(q),
    );
  }, [events, search]);

  const columns: Column<LedgerEventView>[] = [
    {
      key: "type",
      header: "Event Type",
      width: "w-44",
      render: (e) => {
        const isAllow = e.type === "granted" || e.type === "anchor";
        const isBlock = e.type === "withdrawn";
        return (
          <div className="space-y-0.5">
            <StatusChip
              variant={isAllow ? "active" : isBlock ? "withdrawn" : "pending"}
              label={EVENT_TYPE_LABELS[e.type] || e.type}
            />
          </div>
        );
      },
    },
    {
      key: "company",
      header: "Fiduciary",
      width: "w-36",
      render: (e) => {
        const found = SEED_FIDUCIARIES.find(
          (f) => f.address.toLowerCase() === e.fiduciary?.toLowerCase(),
        );
        return (
          <div className="flex items-center gap-2">
            {found && (
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: found.color }}
              />
            )}
            <span className="font-bold text-xs text-ink">
              {found ? found.name : "System"}
            </span>
          </div>
        );
      },
    },
    {
      key: "principal",
      header: "Principal",
      width: "w-36",
      render: (e) =>
        e.principal ? (
          <HashLabel value={e.principal} />
        ) : (
          <span className="text-xs text-mute font-mono">0x00…00</span>
        ),
    },
    {
      key: "txHash",
      header: "Transaction Hash",
      render: (e) => (
        <div className="flex items-center gap-2">
          <HashLabel value={e.txHash} />
          {e.explorerUrl && (
            <a
              href={e.explorerUrl}
              target="_blank"
              rel="noreferrer"
              className="text-[11px] text-mute hover:text-ink font-bold"
              title="View on Polygon Amoy Explorer"
            >
              ↗
            </a>
          )}
        </div>
      ),
    },
    {
      key: "ledgerHead",
      header: "Ledger Head",
      render: (e) =>
        e.ledgerHead ? (
          <HashLabel value={e.ledgerHead} />
        ) : (
          <span className="text-xs text-mute">—</span>
        ),
    },
    {
      key: "blockNumber",
      header: "Block & Time",
      width: "w-32",
      render: (e) => (
        <div className="text-xs font-mono">
          <span className="font-bold text-ink">#{e.blockNumber}</span>
          <div className="text-[11px] text-mute font-sans">
            {new Date(e.at * 1000).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            })}
          </div>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-extrabold text-ink">Immutable Ledger Explorer</h2>
        <p className="text-sm text-mute">
          On-chain consent events, Merkle batch anchors, and rolling ledger heads (A-02).
        </p>
      </div>

      {/* Filters Bar */}
      <div className="flex flex-wrap items-center gap-4 rounded-pass border border-line bg-surface p-4 shadow-sm">
        {/* Search */}
        <div className="flex-1 min-w-[220px]">
          <input
            type="text"
            placeholder="Search tx hash, principal, or ledger head…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-row border border-line bg-surface px-3 py-1.5 text-xs text-ink placeholder:text-mute focus:border-marigold focus:outline-none font-mono"
          />
        </div>

        {/* Fiduciary Filter */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-mute">Company:</span>
          <select
            value={selectedFid}
            onChange={(e) => handleFidChange(e.target.value)}
            className="rounded-row border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-ink focus:border-marigold focus:outline-none"
          >
            <option value="all">All Fiduciaries</option>
            {SEED_FIDUCIARIES.map((f) => (
              <option key={f.address} value={f.address}>
                {f.name}
              </option>
            ))}
          </select>
        </div>

        {/* Event Type Filter */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-mute">Type:</span>
          <select
            value={selectedType}
            onChange={(e) => handleTypeChange(e.target.value)}
            className="rounded-row border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-ink focus:border-marigold focus:outline-none"
          >
            <option value="all">All Event Types</option>
            <option value="granted">Consent Granted</option>
            <option value="withdrawn">Consent Withdrawn</option>
            <option value="anchor">Batch Anchored</option>
            <option value="ack">Cascade Ack</option>
            <option value="purpose">Purpose Registered</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-pass border border-line bg-surface p-4 shadow-sm">
        <DataTable
          columns={columns}
          rows={filteredEvents}
          rowKey={(e) => `${e.txHash}-${e.id}`}
          caption="Audit Ledger Events"
          filterable={false}
          emptyMessage="No ledger events found matching the filter."
        />
      </div>
    </div>
  );
}
