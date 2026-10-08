// `pnpm dev:tamper` (trd.md §6.4): what a malicious insider with access to the database would do. It flips the
// `decision` of one stored access-log row and leaves the hash alone, so the log no longer matches itself or its
// on-chain anchor. It works on the SQLite file directly: no service, route or UI can call it.
import type { Decision } from "@sammati/shared";
import type { Db } from "../real/db";

export interface TamperedRow {
  fiduciary: string;
  slug: string | null;
  seq: number;
  id: string;
  before: Decision;
  after: Decision;
}

/** `who` is a company address or its slug. Throws a plain Error naming what was not found. */
export function tamperRow(db: Db, who: string, seq: number): TamperedRow {
  if (!Number.isSafeInteger(seq) || seq < 1) throw new Error(`<seq> must be a positive whole number, got "${seq}"`);
  const company = db.prepare("SELECT address, slug FROM fiduciaries WHERE lower(address) = lower(?) OR slug = lower(?)").get(who, who) as
    | { address: string; slug: string | null }
    | undefined;
  if (!company) throw new Error(`No company "${who}" in this database`);
  const row = db.prepare("SELECT id, decision FROM access_logs WHERE fiduciary = ? AND seq = ?").get(company.address, seq) as
    | { id: string; decision: Decision }
    | undefined;
  if (!row) throw new Error(`${company.slug ?? company.address} has no stored log entry with seq ${seq}`);
  const after: Decision = row.decision === "BLOCKED" ? "ALLOWED" : "BLOCKED";
  db.prepare("UPDATE access_logs SET decision = ? WHERE fiduciary = ? AND seq = ?").run(after, company.address, seq);
  return { fiduciary: company.address, slug: company.slug, seq, id: row.id, before: row.decision, after };
}
