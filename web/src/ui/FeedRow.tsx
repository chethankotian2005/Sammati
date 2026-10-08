/**
 * FeedRow — a single row in the live request / activity feed.
 *
 * - Slides in from top with animate-feed-enter on mount.
 * - Brief colour wash (green for ALLOWED, red for BLOCKED) per ui.md §1.3.
 * - Blocked rows get a left border in `block` colour.
 * - Uses radius-row (14px) and surface background.
 * - Reduced motion: no animation, instant state change.
 */

import { useEffect, useRef, type ReactNode } from "react";
import type { Decision, AccessReason } from "@sammati/shared";
import { StatusChip } from "./StatusChip";
import { HashLabel } from "./HashLabel";

export interface FeedRowData {
  id: string;
  /** Company dot colour (hex). */
  companyColor: string;
  companyName: string;
  purposeCode: string;
  decision: Decision;
  reason: AccessReason;
  endpoint: string;
  /** Unix seconds. */
  at: number;
  latencyMs?: number;
  txHash?: string;
}

interface FeedRowProps {
  row: FeedRowData;
  /** Whether this is a freshly-arrived row (triggers wash animation). */
  isNew?: boolean;
}

function relativeTime(unixSec: number): string {
  const delta = Math.round(Date.now() / 1000 - unixSec);
  if (delta < 5) return "just now";
  if (delta < 60) return `${delta}s ago`;
  if (delta < 3600) return `${Math.floor(delta / 60)}m ago`;
  return `${Math.floor(delta / 3600)}h ago`;
}

export function FeedRow({ row, isNew = false }: FeedRowProps): ReactNode {
  const rowRef = useRef<HTMLDivElement>(null);
  const isBlocked = row.decision === "BLOCKED";

  // Apply the colour wash animation class, then remove it so it can replay
  // if the same row updates.
  useEffect(() => {
    if (!isNew) return;
    const el = rowRef.current;
    if (!el) return;
    const cls = isBlocked ? "animate-wash-block" : "animate-wash-allow";
    el.classList.add(cls);
    const tid = setTimeout(() => el.classList.remove(cls), 900);
    return () => clearTimeout(tid);
  }, [isNew, isBlocked]);

  return (
    <div
      ref={rowRef}
      role="listitem"
      className={`animate-feed-enter flex items-center gap-3 rounded-row border bg-surface px-4 py-3 text-sm
        ${isBlocked ? "border-block/40 border-l-4 border-l-block" : "border-line"}`}
    >
      {/* Company colour dot */}
      <span
        className="h-2.5 w-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: row.companyColor }}
        aria-hidden="true"
      />

      {/* Purpose + company */}
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">
          {row.purposeCode.replace(/_/g, " ")} &middot;{" "}
          <span className="text-mute">{row.companyName}</span>
        </p>
        <p className="truncate text-xs text-mute">{row.endpoint}</p>
      </div>

      {/* Latency */}
      {row.latencyMs !== undefined && (
        <span className="shrink-0 text-xs text-mute">{row.latencyMs} ms</span>
      )}

      {/* Hash */}
      {row.txHash && (
        <HashLabel value={row.txHash} className="hidden lg:inline-flex" />
      )}

      {/* Decision chip */}
      <StatusChip
        variant={isBlocked ? "blocked" : "allowed"}
        label={isBlocked ? `${row.decision} · ${row.reason}` : row.decision}
        size="sm"
      />

      {/* Relative time */}
      <span className="shrink-0 text-xs text-mute">{relativeTime(row.at)}</span>
    </div>
  );
}

/** A scrollable feed container rendering FeedRow items. */
interface FeedProps {
  rows: FeedRowData[];
  /** IDs of rows that just arrived (get the wash animation). */
  newIds?: Set<string>;
  emptyMessage?: string;
  className?: string;
}

export function Feed({
  rows,
  newIds,
  emptyMessage = "No activity yet.",
  className = "",
}: FeedProps): ReactNode {
  if (rows.length === 0) {
    return (
      <p className={`py-12 text-center text-sm text-mute ${className}`}>
        {emptyMessage}
      </p>
    );
  }

  return (
    <div role="list" aria-label="Activity feed" className={`flex flex-col gap-2 ${className}`}>
      {rows.map((row) => (
        <FeedRow key={row.id} row={row} isNew={newIds?.has(row.id)} />
      ))}
    </div>
  );
}
