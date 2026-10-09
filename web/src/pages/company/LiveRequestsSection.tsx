/**
 * LiveRequestsSection (C-04, ui.md §3): the feed of what the company's own server asked Sammati, allowed or blocked,
 * as it happens. There are no buttons that fire requests: the company's server makes them through the gateway SDK
 * (docs/integration.md). A company that uses the Processor also sees what it holds (a handle, never the data).
 */

import { type ReactNode } from "react";
import type { FiduciaryInfo, StoredAccessLogEntry } from "@sammati/shared";
import { VaultPanel, useVaultTimeline, Feed, type FeedRowData } from "../../ui";

interface LiveRequestsSectionProps {
  company: FiduciaryInfo;
  accessLogs: StoredAccessLogEntry[];
  newLogIds: Set<string>;
}

export function LiveRequestsSection({ company, accessLogs, newLogIds }: LiveRequestsSectionProps): ReactNode {
  const vaultEvents = useVaultTimeline(company.address);
  const rows: FeedRowData[] = accessLogs.map((log) => ({
    id: log.id,
    companyColor: company.color,
    companyName: company.name,
    purposeCode: log.purposeCode,
    decision: log.decision,
    reason: log.reason,
    endpoint: log.endpoint,
    at: log.at,
    latencyMs: log.latencyMs,
  }));
  return (
    <div className="space-y-6">
      <div className="rounded-pass border border-line bg-surface p-6 shadow-sm">
        <h2 className="text-xl font-extrabold text-ink">Your requests come from your own server</h2>
        <p className="mt-1 text-sm text-mute">
          Each call your server checks with Sammati appears below, allowed or blocked, as it happens.
        </p>
        <p className="mt-3 text-sm text-ink">
          Not integrated yet? Five lines with <span className="font-mono">@sammati/gateway</span> are in{" "}
          <span className="font-mono">docs/integration.md</span>.
        </p>
      </div>
      <div className="rounded-pass border border-line bg-surface p-6 shadow-sm">
        <h3 className="mb-3 font-extrabold text-ink">Live feed</h3>
        <Feed rows={rows} newIds={newLogIds} emptyMessage="No requests yet. Calls from your server appear here." />
      </div>
      {vaultEvents.length > 0 && <VaultPanel company={company.name} events={vaultEvents} />}
    </div>
  );
}
