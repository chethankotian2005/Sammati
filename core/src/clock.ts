import type { AccessLogEntry } from "@sammati/shared";

export const now = (): number => Math.floor(Date.now() / 1000);

/** Drops row-only fields so the hash covers exactly the canonical entry. */
export function toHashedEntry(row: AccessLogEntry): AccessLogEntry {
  const usage = row.outcome === undefined ? {} : { dataCategories: row.dataCategories ?? [], outcome: row.outcome };
  return {
    ...usage,
    at: row.at,
    decision: row.decision,
    endpoint: row.endpoint,
    fiduciary: row.fiduciary,
    id: row.id,
    latencyMs: row.latencyMs,
    principal: row.principal,
    purposeCode: row.purposeCode,
    reason: row.reason,
    seq: row.seq,
  };
}
