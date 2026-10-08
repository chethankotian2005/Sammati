import { randomUUID } from "node:crypto";
import { getAddress } from "ethers";
import {
  DEFAULT_COMPANY_COLOR,
  ZERO_HASH,
  entryFormat,
  expectedPrevHash,
  explorerTxUrl,
  hashEntry,
  type AccessReason,
  type ActivityItem,
  type AnchorBatchView,
  type CascadeItem,
  type ConsentProofResponse,
  type ConsentRow,
  type ConsentView,
  type Decision,
  type FiduciaryConsents,
  type Hex,
  type IntegrityState,
  type LedgerEventType,
  type LedgerEventView,
  type LocalizedText,
  type PrincipalConsentsResponse,
  type RightsRequest,
  type RightsRequestView,
  type RightsStatus,
  type RightsType,
  type Status,
  type StoredAccessLogEntry,
} from "@sammati/shared";
import { HttpError } from "../errors";
import type { DirectoryPurpose } from "../directory";
import { now, toHashedEntry } from "../clock";
import { hashApiKey } from "./apikeys";
import type { Db } from "./db";

export const NOTICE_VERSION = 1;

/** Addresses are stored checksummed, so every input goes through here. */
export function addr(v: string): Hex {
  try {
    return getAddress(v);
  } catch {
    throw new HttpError(400, "BAD_REQUEST", `"${v}" is not an address`);
  }
}

const lc = (s: string): string => s.toLowerCase();

export interface FiduciaryRow {
  address: Hex;
  name: string;
  sector: string;
  color: string;
  /** Console route /company/<slug> (R-04). */
  slug: string;
  /** In the sandbox (R-03): only test customers can be asked. */
  sandbox: boolean;
}

export interface RequestRow {
  id: string;
  fiduciary: Hex;
  purposeIds: Hex[];
  customerAlias: string;
  noticeHash: Hex;
  createdAt: number;
}

export interface CachedConsent {
  principal: Hex;
  fiduciary: Hex;
  purposeId: Hex;
  status: "Active" | "Withdrawn";
  grantedAt: number;
  expiresAt: number;
  updatedAt: number;
  noticeHash: Hex | null;
  lastTx: Hex | null;
}

export interface LedgerInsert {
  type: LedgerEventType;
  principal: Hex | null;
  fiduciary: Hex | null;
  purposeId: Hex | null;
  txHash: Hex;
  blockNumber: number;
  logIndex: number;
  ledgerHead: Hex | null;
  at: number;
  payload: Record<string, unknown> | null;
}

type Row = Record<string, unknown>;

export class Repo {
  constructor(
    private readonly db: Db,
    /** Null on a chain with no public explorer: proof responses then carry no link. */
    private readonly explorerUrl: string | null,
  ) {}

  // --- directory (fiduciaries, purposes, processors) ---

  fiduciaries(): FiduciaryRow[] {
    return (this.db.prepare("SELECT address, name, sector, color, slug, sandbox FROM fiduciaries ORDER BY rowid").all() as Row[]).map((r) => ({
      address: r.address as Hex,
      name: r.name as string,
      sector: r.sector as string,
      color: (r.color as string | null) ?? DEFAULT_COMPANY_COLOR,
      slug: (r.slug as string | null) ?? "",
      sandbox: r.sandbox === 1,
    }));
  }

  /** The company an API key belongs to, or undefined for an unknown key (trd.md §6.2a). */
  fiduciaryForKey(apiKey: string): FiduciaryRow | undefined {
    const r = this.db.prepare("SELECT fiduciary FROM fiduciary_credentials WHERE api_key_hash = ?").get(hashApiKey(apiKey)) as { fiduciary: string } | undefined;
    return r ? this.fiduciaries().find((f) => f.address === r.fiduciary) : undefined;
  }

  /** Keys Core generated for companies that joined through R-01 (disclosed shortcut, trd.md §12). */
  fiduciaryKey(address: string): string | undefined {
    return (this.db.prepare("SELECT private_key FROM fiduciary_keys WHERE address = ?").get(addr(address)) as { private_key: string } | undefined)?.private_key;
  }

  processorKey(address: string): string | undefined {
    return (this.db.prepare("SELECT private_key FROM processor_keys WHERE address = ?").get(addr(address)) as { private_key: string } | undefined)?.private_key;
  }

  fiduciary(address: string): FiduciaryRow {
    const a = addr(address);
    const f = this.fiduciaries().find((x) => x.address === a);
    if (!f) throw new HttpError(404, "FIDUCIARY_NOT_FOUND", `Unknown fiduciary ${a}`);
    return f;
  }

  private purposeFromRow(r: Row): DirectoryPurpose {
    const text = (k: string): LocalizedText => ({
      en: r[`${k}_en`] as string,
      hi: (r[`${k}_hi`] as string | null) ?? (r[`${k}_en`] as string),
      kn: (r[`${k}_kn`] as string | null) ?? (r[`${k}_en`] as string),
    });
    return {
      id: r.id as Hex,
      code: r.code as string,
      title: text("title"),
      description: text("desc"),
      dataCategories: JSON.parse(r.data_categories as string) as string[],
      retentionDays: r.retention_days as number,
      sharesThirdParty: r.shares_third_party === 1,
      required: r.required === 1,
    };
  }

  purposesOf(fiduciary: Hex): DirectoryPurpose[] {
    return (this.db.prepare("SELECT * FROM purposes WHERE fiduciary = ? ORDER BY rowid").all(fiduciary) as Row[]).map((r) => this.purposeFromRow(r));
  }

  /** Accepts a purposeId (bytes32) or a purpose code. */
  purpose(f: FiduciaryRow, idOrCode: string): DirectoryPurpose {
    const p = this.purposesOf(f.address).find((x) => x.id === lc(idOrCode) || x.code === idOrCode);
    if (!p) throw new HttpError(404, "PURPOSE_NOT_FOUND", `Unknown purpose ${idOrCode} for ${f.name}`);
    return p;
  }

  purposeById(id: string): (DirectoryPurpose & { fiduciary: Hex }) | undefined {
    const r = this.db.prepare("SELECT * FROM purposes WHERE id = ?").get(lc(id)) as Row | undefined;
    return r ? { ...this.purposeFromRow(r), fiduciary: r.fiduciary as Hex } : undefined;
  }

  markFiduciaryRegistered(address: Hex, txHash: Hex): void {
    this.db.prepare("UPDATE fiduciaries SET registered_tx = ? WHERE address = ?").run(txHash, address);
  }

  // --- consent requests (QR codes) ---

  createRequest(f: FiduciaryRow, purposeIds: Hex[], customerAlias: string, noticeHash: Hex): RequestRow {
    const id = `req_${randomUUID().slice(0, 8)}`;
    const createdAt = now();
    this.db
      .prepare("INSERT INTO requests (id, fiduciary, purposes, customer_alias, notice_hash, created_at, status) VALUES (?, ?, ?, ?, ?, ?, 'open')")
      .run(id, f.address, JSON.stringify(purposeIds), customerAlias, noticeHash, createdAt);
    return { id, fiduciary: f.address, purposeIds, customerAlias, noticeHash, createdAt };
  }

  /** Marks an old request expired and refuses it . */
  request(id: string, ttlSeconds: number): RequestRow {
    const r = this.db.prepare("SELECT * FROM requests WHERE id = ?").get(id) as Row | undefined;
    if (!r) throw new HttpError(404, "REQUEST_NOT_FOUND", `Unknown request ${id}`);
    const createdAt = r.created_at as number;
    if (now() - createdAt > ttlSeconds) {
      this.db.prepare("UPDATE requests SET status = 'expired' WHERE id = ?").run(id);
      throw new HttpError(410, "REQUEST_EXPIRED", "This consent request has expired; ask the company for a new QR code");
    }
    return {
      id,
      fiduciary: r.fiduciary as Hex,
      purposeIds: JSON.parse(r.purposes as string) as Hex[],
      customerAlias: r.customer_alias as string,
      noticeHash: r.notice_hash as Hex,
      createdAt,
    };
  }

  // --- consents_cache ---

  upsertConsent(c: CachedConsent): void {
    this.db
      .prepare(
        `INSERT INTO consents_cache (principal, fiduciary, purpose_id, status, granted_at, expires_at, updated_at, notice_hash, last_tx)
         VALUES (@principal, @fiduciary, @purposeId, @status, @grantedAt, @expiresAt, @updatedAt, @noticeHash, @lastTx)
         ON CONFLICT (principal, fiduciary, purpose_id) DO UPDATE SET
           status = excluded.status, granted_at = excluded.granted_at, expires_at = excluded.expires_at,
           updated_at = excluded.updated_at, notice_hash = excluded.notice_hash, last_tx = excluded.last_tx`,
      )
      .run(c);
  }

  deleteConsent(principal: Hex, fiduciary: Hex, purposeId: Hex): void {
    this.db.prepare("DELETE FROM consents_cache WHERE principal = ? AND fiduciary = ? AND purpose_id = ?").run(principal, fiduciary, purposeId);
  }

  cachedConsent(principal: Hex, fiduciary: Hex, purposeId: Hex): CachedConsent | undefined {
    const r = this.db
      .prepare("SELECT * FROM consents_cache WHERE principal = ? AND fiduciary = ? AND purpose_id = ?")
      .get(principal, fiduciary, purposeId) as Row | undefined;
    return r ? this.cachedFromRow(r) : undefined;
  }

  /** Every (principal, fiduciary, purpose) the cache or the ledger has ever heard of; what reconcile must check. */
  knownConsentKeys(): { principal: Hex; fiduciary: Hex; purposeId: Hex }[] {
    return this.db
      .prepare(
        `SELECT principal, fiduciary, purpose_id AS purposeId FROM consents_cache
         UNION
         SELECT principal, fiduciary, purpose_id FROM ledger_events WHERE type IN ('granted','withdrawn')`,
      )
      .all() as { principal: Hex; fiduciary: Hex; purposeId: Hex }[];
  }

  /** The tx of the newest grant/withdraw for a consent, by chain order. */
  lastConsentTx(principal: Hex, fiduciary: Hex, purposeId: Hex): Hex | null {
    const r = this.db
      .prepare(
        `SELECT tx_hash FROM ledger_events WHERE type IN ('granted','withdrawn') AND principal = ? AND fiduciary = ? AND purpose_id = ?
         ORDER BY block_number DESC, log_index DESC LIMIT 1`,
      )
      .get(principal, fiduciary, purposeId) as { tx_hash: Hex } | undefined;
    return r?.tx_hash ?? null;
  }

  private cachedFromRow(r: Row): CachedConsent {
    return {
      principal: r.principal as Hex,
      fiduciary: r.fiduciary as Hex,
      purposeId: r.purpose_id as Hex,
      status: r.status as "Active" | "Withdrawn",
      grantedAt: r.granted_at as number,
      expiresAt: r.expires_at as number,
      updatedAt: r.updated_at as number,
      noticeHash: (r.notice_hash as Hex | null) ?? null,
      lastTx: (r.last_tx as Hex | null) ?? null,
    };
  }

  /** The route adds `nonce` (read from the chain) and `domain`, which the repository does not hold. */
  principalConsents(principal: Hex): Omit<PrincipalConsentsResponse, "nonce" | "domain"> {
    const fiduciaries: FiduciaryConsents[] = [];
    for (const f of this.fiduciaries()) {
      const consents: ConsentView[] = [];
      for (const p of this.purposesOf(f.address)) {
        const c = this.cachedConsent(principal, f.address, p.id);
        if (!c) continue;
        consents.push({
          purposeId: p.id,
          code: p.code,
          title: p.title,
          status: c.status,
          grantedAt: c.grantedAt,
          expiresAt: c.expiresAt,
          updatedAt: c.updatedAt,
          noticeHash: c.noticeHash,
          lastTx: c.lastTx,
          required: p.required,
          dataCategories: p.dataCategories,
        });
      }
      if (consents.length) fiduciaries.push({ fiduciary: f, consents });
    }
    return { principal, fiduciaries };
  }

  /**
   * The company-side alias for whoever consented to this exact notice. A request addressed to this very customer
   * (targeted, trd.md §6.11) wins, because Core knows who it was for; otherwise the newest request with the same notice
   * hash is taken, which is all a QR code allows.
   */
  private aliasFor(fiduciary: Hex, noticeHash: Hex | null, principal: Hex): string | null {
    if (!noticeHash) return null;
    const addressed = this.db
      .prepare(
        `SELECT r.customer_alias FROM requests r JOIN request_targets t ON t.request_id = r.id
         WHERE r.fiduciary = ? AND r.notice_hash = ? AND t.principal = ? ORDER BY r.created_at DESC, r.rowid DESC LIMIT 1`,
      )
      .get(fiduciary, noticeHash, lc(principal)) as { customer_alias: string } | undefined;
    if (addressed) return addressed.customer_alias;
    const r = this.db
      .prepare("SELECT customer_alias FROM requests WHERE fiduciary = ? AND notice_hash = ? ORDER BY created_at DESC, rowid DESC LIMIT 1")
      .get(fiduciary, noticeHash) as { customer_alias: string } | undefined;
    return r?.customer_alias ?? null;
  }

  /** The company's own alias for the customer behind this consent, if it has one (renewals reuse it). */
  aliasOfConsent(principal: Hex, fiduciary: Hex, purposeId: Hex): string | null {
    const c = this.cachedConsent(addr(principal), addr(fiduciary), purposeId);
    return c ? this.aliasFor(addr(fiduciary), c.noticeHash, addr(principal)) : null;
  }

  consentRows(f: FiduciaryRow): ConsentRow[] {
    const rows = this.db.prepare("SELECT * FROM consents_cache WHERE fiduciary = ? ORDER BY updated_at DESC").all(f.address) as Row[];
    return rows.map((r) => {
      const c = this.cachedFromRow(r);
      return {
        principal: c.principal,
        customerAlias: this.aliasFor(f.address, c.noticeHash, c.principal),
        purposeId: c.purposeId,
        purposeCode: this.purposeById(c.purposeId)?.code ?? "",
        status: c.status,
        grantedAt: c.grantedAt,
        expiresAt: c.expiresAt,
        updatedAt: c.updatedAt,
        lastTx: c.lastTx,
      };
    });
  }

  // --- access logs ---

  private logFromRow(r: Row): StoredAccessLogEntry {
    return {
      at: r.at as number,
      decision: r.decision as Decision,
      endpoint: r.endpoint as string,
      fiduciary: r.fiduciary as Hex,
      id: r.id as string,
      latencyMs: (r.latency_ms as number | null) ?? 0,
      principal: r.principal as Hex,
      purposeCode: r.purpose_code as string,
      reason: ((r.reason as string | null) ?? "OK") as AccessReason,
      seq: r.seq as number,
      prevHash: r.prev_hash as Hex,
      hash: r.hash as Hex,
      batchIndex: (r.batch_index as number | null) ?? null,
      // Format 2 only (drd.md §4.1a): a format-1 row has neither key, so it hashes exactly as it was written.
      ...(r.outcome === null || r.outcome === undefined ? {} : { dataCategories: JSON.parse((r.data_categories as string | null) ?? "[]") as string[], outcome: r.outcome as string }),
    };
  }

  /** Newest first. */
  accessFor(fiduciary: Hex, limit = 500): StoredAccessLogEntry[] {
    return (this.db.prepare("SELECT * FROM access_logs WHERE fiduciary = ? ORDER BY seq DESC LIMIT ?").all(fiduciary, limit) as Row[]).map((r) =>
      this.logFromRow(r),
    );
  }

  activity(principal: Hex, limit: number): ActivityItem[] {
    const rows = this.db.prepare("SELECT * FROM access_logs WHERE principal = ? ORDER BY at DESC, seq DESC LIMIT ?").all(principal, limit) as Row[];
    return rows.map((r) => {
      const e = this.logFromRow(r);
      return {
        id: e.id,
        seq: e.seq,
        fiduciary: e.fiduciary,
        fiduciaryName: this.fiduciary(e.fiduciary).name,
        purposeCode: e.purposeCode,
        decision: e.decision,
        reason: e.reason,
        endpoint: e.endpoint,
        at: e.at,
        anchored: e.batchIndex !== null,
        ...(e.outcome === undefined ? {} : { dataCategories: e.dataCategories, outcome: e.outcome }),
      };
    });
  }

  /** Where the next entry goes. `lastFormat` is 0 for an empty chain; the prevHash depends on the entry's own format (drd.md §4.1a). */
  nextLogPosition(fiduciary: Hex): { seq: number; head: { hash: Hex; format: 1 | 2 } | null } {
    const last = this.db.prepare("SELECT seq, hash, outcome FROM access_logs WHERE fiduciary = ? ORDER BY seq DESC LIMIT 1").get(fiduciary) as
      | { seq: number; hash: Hex; outcome: string | null }
      | undefined;
    return { seq: (last?.seq ?? 0) + 1, head: last ? { hash: last.hash, format: last.outcome === null ? 1 : 2 } : null };
  }

  /** Validates seq, prevHash and hash exactly as the Auditor will later (drd.md §7). */
  appendLog(row: StoredAccessLogEntry): void {
    this.fiduciary(row.fiduciary);
    const expected = this.nextLogPosition(row.fiduciary);
    if (row.seq !== expected.seq) throw new HttpError(409, "SEQ_MISMATCH", `Expected seq ${expected.seq}, got ${row.seq}`);
    const format = entryFormat(row);
    // Once the chain is in the new format, an old-format entry is refused: the two never mix (drd.md §4.1a).
    if (format === 1 && expected.head?.format === 2) throw new HttpError(409, "FORMAT_OUTDATED", "This chain uses the usage-record format; update the Sammati SDK");
    if (row.prevHash !== expectedPrevHash(expected.head, format)) throw new HttpError(409, "PREV_HASH_MISMATCH", "prevHash does not match the chain head");
    if (row.hash !== hashEntry(row.prevHash, toHashedEntry(row))) {
      throw new HttpError(400, "BAD_HASH", "hash does not match keccak256(prevHash || canonical entry)");
    }
    this.db
      .prepare(
        `INSERT INTO access_logs (seq, fiduciary, id, principal, purpose_code, decision, reason, endpoint, latency_ms, at, prev_hash, hash, batch_index, data_categories, outcome)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
      )
      .run(row.seq, row.fiduciary, row.id, row.principal, row.purposeCode, row.decision, row.reason, row.endpoint, row.latencyMs, row.at, row.prevHash, row.hash, format === 2 ? JSON.stringify(row.dataCategories ?? []) : null, format === 2 ? row.outcome : null);
  }

  // --- cascade ---

  cascadeFor(principal: Hex, purposeId: Hex): CascadeItem[] {
    const procs = this.db.prepare("SELECT address, name FROM processors WHERE purpose_id = ? ORDER BY rowid").all(purposeId) as { address: Hex; name: string }[];
    return procs.map((p) => {
      const a = this.db
        .prepare("SELECT notified_at, acked_at, tx_hash FROM cascade_acks WHERE principal = ? AND purpose_id = ? AND processor = ?")
        .get(principal, purposeId, p.address) as Row | undefined;
      return {
        processor: p.address,
        name: p.name,
        notifiedAt: (a?.notified_at as number | null) ?? null,
        ackedAt: (a?.acked_at as number | null) ?? null,
        txHash: (a?.tx_hash as Hex | null) ?? null,
      };
    });
  }

  processorsFor(purposeId: Hex): { address: Hex; name: string }[] {
    return this.db.prepare("SELECT address, name FROM processors WHERE purpose_id = ? ORDER BY rowid").all(purposeId) as { address: Hex; name: string }[];
  }

  /** Every processor a company declared, with the code of the purpose it serves. */
  processorsOfFiduciary(fiduciary: Hex): Array<{ name: string; address: Hex; purposeCode: string }> {
    return (
      this.db
        .prepare("SELECT p.name AS name, p.address AS address, u.code AS code FROM processors p JOIN purposes u ON u.id = p.purpose_id WHERE u.fiduciary = ? ORDER BY p.rowid")
        .all(fiduciary) as Array<{ name: string; address: Hex; code: string }>
    ).map((r) => ({ name: r.name, address: r.address, purposeCode: r.code }));
  }

  /** A new cascade starts: the processor has been told, and any earlier acknowledgement belongs to an earlier withdrawal. */
  markNotified(principal: Hex, purposeId: Hex, processor: Hex, at: number): void {
    this.db
      .prepare(
        `INSERT INTO cascade_acks (principal, purpose_id, processor, notified_at, acked_at, tx_hash) VALUES (?, ?, ?, ?, NULL, NULL)
         ON CONFLICT (principal, purpose_id, processor) DO UPDATE SET notified_at = excluded.notified_at, acked_at = NULL, tx_hash = NULL`,
      )
      .run(principal, purposeId, processor, at);
  }

  /** A fresh grant ends the consent's last cascade: there is nothing left to wait for. */
  clearCascade(principal: Hex, purposeId: Hex): void {
    this.db.prepare("DELETE FROM cascade_acks WHERE principal = ? AND purpose_id = ?").run(principal, purposeId);
  }

  /** Withdrawn consents with a processor that has not acknowledged that withdrawal yet. */
  unacknowledgedWithdrawals(): { principal: Hex; fiduciary: Hex; purposeId: Hex; processor: Hex; processorName: string; txHash: Hex; at: number }[] {
    return this.db
      .prepare(
        `SELECT c.principal, c.fiduciary, c.purpose_id AS purposeId, p.address AS processor, p.name AS processorName,
                c.last_tx AS txHash, c.updated_at AS at
         FROM consents_cache c
         JOIN processors p ON p.purpose_id = c.purpose_id
         LEFT JOIN cascade_acks a ON a.principal = c.principal AND a.purpose_id = c.purpose_id AND a.processor = p.address
         WHERE c.status = 'Withdrawn' AND c.last_tx IS NOT NULL AND (a.acked_at IS NULL OR a.acked_at < c.updated_at)`,
      )
      .all() as { principal: Hex; fiduciary: Hex; purposeId: Hex; processor: Hex; processorName: string; txHash: Hex; at: number }[];
  }

  recordAck(principal: Hex, purposeId: Hex, processor: Hex, ackedAt: number, txHash: Hex): void {
    this.db
      .prepare(
        `INSERT INTO cascade_acks (principal, purpose_id, processor, notified_at, acked_at, tx_hash) VALUES (?, ?, ?, NULL, ?, ?)
         ON CONFLICT (principal, purpose_id, processor) DO UPDATE SET acked_at = excluded.acked_at, tx_hash = excluded.tx_hash`,
      )
      .run(principal, purposeId, processor, ackedAt, txHash);
  }

  processorName(address: Hex): string {
    return (this.db.prepare("SELECT name FROM processors WHERE address = ?").get(address) as { name: string } | undefined)?.name ?? "";
  }

  // --- ledger events and anchors ---

  /** Returns true when the event was new (the unique key makes re-indexing a no-op). */
  insertLedger(e: LedgerInsert): boolean {
    const r = this.db
      .prepare(
        `INSERT OR IGNORE INTO ledger_events (type, principal, fiduciary, purpose_id, tx_hash, block_number, ledger_head, at, payload, log_index)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(e.type, e.principal, e.fiduciary, e.purposeId, e.txHash, e.blockNumber, e.ledgerHead, e.at, e.payload ? JSON.stringify(e.payload) : null, e.logIndex);
    return r.changes > 0;
  }

  private ledgerFromRow(r: Row): LedgerEventView {
    return {
      id: r.id as number,
      type: r.type as LedgerEventType,
      principal: (r.principal as Hex | null) ?? null,
      fiduciary: (r.fiduciary as Hex | null) ?? null,
      purposeId: (r.purpose_id as Hex | null) ?? null,
      txHash: r.tx_hash as Hex,
      blockNumber: r.block_number as number,
      ledgerHead: (r.ledger_head as Hex | null) ?? null,
      at: r.at as number,
      payload: r.payload ? (JSON.parse(r.payload as string) as Record<string, unknown>) : null,
      explorerUrl: explorerTxUrl(this.explorerUrl, r.tx_hash as string),
    };
  }

  /** Newest first. */
  ledgerEvents(filter: { fiduciary?: Hex; principal?: Hex; type?: LedgerEventType }, limit = 500): LedgerEventView[] {
    const where: string[] = [];
    const args: unknown[] = [];
    for (const [column, value] of [["fiduciary", filter.fiduciary], ["principal", filter.principal], ["type", filter.type]] as const) {
      if (value) {
        where.push(`${column} = ?`);
        args.push(value);
      }
    }
    const sql = `SELECT * FROM ledger_events ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY block_number DESC, log_index DESC LIMIT ?`;
    return (this.db.prepare(sql).all(...args, limit) as Row[]).map((r) => this.ledgerFromRow(r));
  }

  consentProof(txHash: Hex): ConsentProofResponse | undefined {
    const r = this.db
      .prepare("SELECT * FROM ledger_events WHERE tx_hash = ? AND type IN ('granted','withdrawn') ORDER BY log_index LIMIT 1")
      .get(lc(txHash)) as Row | undefined;
    if (!r || !r.principal || !r.fiduciary || !r.purpose_id || !r.ledger_head) return undefined;
    const e = this.ledgerFromRow(r);
    const payload = e.payload ?? {};
    return {
      txHash: e.txHash,
      type: e.type as "granted" | "withdrawn",
      principal: e.principal!,
      fiduciary: e.fiduciary!,
      purposeId: e.purposeId!,
      expiresAt: typeof payload.expiresAt === "number" ? payload.expiresAt : null,
      noticeHash: typeof payload.noticeHash === "string" ? payload.noticeHash : null,
      ledgerHead: e.ledgerHead!,
      blockNumber: e.blockNumber,
      at: e.at,
      explorerUrl: e.explorerUrl,
    };
  }

  latestLedgerHead(): Hex {
    const r = this.db.prepare("SELECT ledger_head FROM ledger_events WHERE ledger_head IS NOT NULL ORDER BY block_number DESC, log_index DESC LIMIT 1").get() as
      | { ledger_head: Hex }
      | undefined;
    return r?.ledger_head ?? ZERO_HASH;
  }

  insertAnchor(b: { fiduciary: Hex; index: number; merkleRoot: Hex; fromSeq: number; toSeq: number; count: number; txHash: Hex; at: number }): void {
    this.db
      .prepare("INSERT OR IGNORE INTO anchor_batches (fiduciary, idx, merkle_root, from_seq, to_seq, count, tx_hash, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run(b.fiduciary, b.index, b.merkleRoot, b.fromSeq, b.toSeq, b.count, b.txHash, b.at);
    this.db
      .prepare("UPDATE access_logs SET batch_index = ? WHERE fiduciary = ? AND seq BETWEEN ? AND ?")
      .run(b.index, b.fiduciary, b.fromSeq, b.toSeq);
  }

  anchorsFor(fiduciary: Hex): AnchorBatchView[] {
    return (this.db.prepare("SELECT * FROM anchor_batches WHERE fiduciary = ? ORDER BY idx").all(fiduciary) as Row[]).map((r) => ({
      index: r.idx as number,
      merkleRoot: r.merkle_root as Hex,
      fromSeq: r.from_seq as number,
      toSeq: r.to_seq as number,
      count: r.count as number,
      txHash: r.tx_hash as Hex,
      at: r.at as number,
    }));
  }

  // --- audit ---

  /** Every stored row of a company's log, oldest first. */
  accessAsc(fiduciary: Hex): StoredAccessLogEntry[] {
    return (this.db.prepare("SELECT * FROM access_logs WHERE fiduciary = ? ORDER BY seq").all(fiduciary) as Row[]).map((r) => this.logFromRow(r));
  }

  /** Up to `limit` rows from `fromSeq` on, oldest first (what the anchor job batches). */
  accessFrom(fiduciary: Hex, fromSeq: number, limit: number): StoredAccessLogEntry[] {
    return (this.db.prepare("SELECT * FROM access_logs WHERE fiduciary = ? AND seq >= ? ORDER BY seq LIMIT ?").all(fiduciary, fromSeq, limit) as Row[]).map((r) =>
      this.logFromRow(r),
    );
  }

  accessById(id: string): StoredAccessLogEntry | undefined {
    const r = this.db.prepare("SELECT * FROM access_logs WHERE id = ?").get(id) as Row | undefined;
    return r ? this.logFromRow(r) : undefined;
  }

  /** Rows not yet covered by an anchored batch. */
  pendingCount(fiduciary: Hex): number {
    return (this.db.prepare("SELECT COUNT(*) AS c FROM access_logs WHERE fiduciary = ? AND batch_index IS NULL").get(fiduciary) as { c: number }).c;
  }

  decisionCounts(fiduciary: Hex): { allowed: number; blocked: number } {
    const rows = this.db.prepare("SELECT decision, COUNT(*) AS c FROM access_logs WHERE fiduciary = ? GROUP BY decision").all(fiduciary) as { decision: string; c: number }[];
    const count = (d: string) => rows.find((r) => r.decision === d)?.c ?? 0;
    return { allowed: count("ALLOWED"), blocked: count("BLOCKED") };
  }

  anchorBatchFor(fiduciary: Hex, seq: number): AnchorBatchView | undefined {
    return this.anchorsFor(fiduciary).find((b) => seq >= b.fromSeq && seq <= b.toSeq);
  }

  consentCounts(fiduciary: Hex, nowSeconds: number): { active: number; withdrawn: number } {
    const rows = this.db.prepare("SELECT status, expires_at AS expiresAt FROM consents_cache WHERE fiduciary = ?").all(fiduciary) as { status: string; expiresAt: number }[];
    return {
      active: rows.filter((r) => r.status === "Active" && r.expiresAt > nowSeconds).length,
      withdrawn: rows.filter((r) => r.status === "Withdrawn").length,
    };
  }

  /** Grants and withdrawals of one company in chain order, with the consent's expiry for grants. */
  consentHistory(fiduciary: Hex): { type: "granted" | "withdrawn"; principal: Hex; purposeId: Hex; at: number; expiresAt: number | null }[] {
    const rows = this.db
      .prepare(
        `SELECT type, principal, purpose_id AS purposeId, at, payload FROM ledger_events
         WHERE fiduciary = ? AND type IN ('granted','withdrawn') ORDER BY block_number, log_index`,
      )
      .all(fiduciary) as { type: "granted" | "withdrawn"; principal: Hex; purposeId: Hex; at: number; payload: string | null }[];
    return rows.map((r) => ({
      type: r.type,
      principal: r.principal,
      purposeId: r.purposeId,
      at: r.at,
      expiresAt: r.payload ? ((JSON.parse(r.payload) as { expiresAt?: number }).expiresAt ?? null) : null,
    }));
  }

  /** Withdrawn consents whose processors have not acknowledged, once the withdrawal is older than `olderThan`. */
  unacknowledgedCascades(fiduciary: Hex, olderThan: number): number {
    return (
      this.db
        .prepare(
          `SELECT COUNT(*) AS c FROM consents_cache c
           JOIN processors p ON p.purpose_id = c.purpose_id
           LEFT JOIN cascade_acks a ON a.principal = c.principal AND a.purpose_id = c.purpose_id AND a.processor = p.address
           WHERE c.fiduciary = ? AND c.status = 'Withdrawn' AND c.updated_at < ? AND a.acked_at IS NULL`,
        )
        .get(fiduciary, olderThan) as { c: number }
    ).c;
  }

  /** The result of the last verification run; "unverified" until one has happened. */
  integrity(fiduciary: Hex): IntegrityState {
    return (this.getState(`integrity:${fiduciary}`) as IntegrityState | undefined) ?? "unverified";
  }

  setIntegrity(fiduciary: Hex, state: IntegrityState): void {
    this.setState(`integrity:${fiduciary}`, state);
  }

  // --- data rights (drd.md §3 rights_requests) ---

  createRightsRequest(principal: Hex, fiduciary: Hex, type: RightsType, note: string): RightsRequest {
    const request: RightsRequest = {
      id: `rights_${randomUUID().slice(0, 8)}`,
      principal,
      fiduciary,
      type,
      note,
      status: "open",
      createdAt: now(),
      updatedAt: now(),
    };
    this.db
      .prepare("INSERT INTO rights_requests (id, principal, fiduciary, type, note, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run(request.id, principal, fiduciary, type, note, request.status, request.createdAt, request.updatedAt);
    return request;
  }

  /** Oldest first. */
  /** A company moves a rights request along and may say why (W-10). Returns the updated view, or undefined if it is not this company's. */
  updateRightsRequest(fiduciary: Hex, id: string, status: RightsStatus, reply: string | null): (RightsRequestView & { reply: string | null }) | undefined {
    const row = this.db.prepare("SELECT * FROM rights_requests WHERE id = ? AND fiduciary = ?").get(id, fiduciary) as Row | undefined;
    if (!row) return undefined;
    this.db.prepare("UPDATE rights_requests SET status = ?, reply = ?, updated_at = ? WHERE id = ?").run(status, reply, now(), id);
    const view = this.rightsFor(row.principal as Hex).find((r) => r.id === id)!;
    return { ...view, reply };
  }

  rightsFor(principal: Hex): RightsRequestView[] {
    const rows = this.db.prepare("SELECT * FROM rights_requests WHERE principal = ? ORDER BY created_at, rowid").all(principal) as Row[];
    return rows.map((r) => ({
      id: r.id as string,
      principal: r.principal as Hex,
      fiduciary: r.fiduciary as Hex,
      fiduciaryName: this.fiduciary(r.fiduciary as string).name,
      type: r.type as RightsType,
      note: (r.note as string | null) ?? "",
      status: r.status as RightsStatus,
      createdAt: r.created_at as number,
      updatedAt: r.updated_at as number,
    }));
  }

  fiduciaryRights(fiduciary: Hex): RightsRequestView[] {
    const rows = this.db.prepare("SELECT * FROM rights_requests WHERE fiduciary = ? ORDER BY created_at DESC, rowid").all(fiduciary) as Row[];
    return rows.map((r) => ({
      id: r.id as string,
      principal: r.principal as Hex,
      fiduciary: r.fiduciary as Hex,
      fiduciaryName: this.fiduciary(r.fiduciary as string).name,
      type: r.type as RightsType,
      note: (r.note as string | null) ?? "",
      status: r.status as RightsStatus,
      createdAt: r.created_at as number,
      updatedAt: r.updated_at as number,
    }));
  }

  /** Anything worth wiping? Only used to decide whether a wipe is worth announcing. */
  hasData(): boolean {
    const n = (t: string) => (this.db.prepare(`SELECT COUNT(*) AS c FROM ${t}`).get() as { c: number }).c;
    return n("access_logs") + n("ledger_events") + n("consents_cache") > 0;
  }

  // --- indexer cursor ---

  getState(key: string): string | undefined {
    return (this.db.prepare("SELECT value FROM indexer_state WHERE key = ?").get(key) as { value: string } | undefined)?.value;
  }

  setState(key: string, value: string): void {
    this.db.prepare("INSERT INTO indexer_state (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value").run(key, value);
  }

  // --- console operators (C-10) ---
  consoleLogin(email: string, passwordHash: string): { token: string, operatorEmail: string, fiduciaries: Array<{ address: string, slug: string }> } | null {
    const op = this.db.prepare("SELECT email FROM console_operators WHERE email = ? AND password_hash = ?").get(email, passwordHash) as { email: string } | undefined;
    if (!op) return null;
    const token = require("node:crypto").randomBytes(32).toString("base64url");
    const expiresAt = Math.floor(Date.now() / 1000) + 86400; // 24 hours
    this.db.prepare("INSERT INTO console_sessions (token, operator_email, expires_at) VALUES (?, ?, ?)").run(token, email, expiresAt);
    const me = this.consoleMe(token);
    return me ? { token, ...me } : null;
  }

  consoleMe(token: string): { operatorEmail: string, fiduciaries: Array<{ address: string, slug: string }> } | null {
    const nowSecs = Math.floor(Date.now() / 1000);
    const session = this.db.prepare("SELECT operator_email FROM console_sessions WHERE token = ? AND expires_at > ?").get(token, nowSecs) as { operator_email: string } | undefined;
    if (!session) return null;
    const email = session.operator_email;
    const rows = this.db.prepare("SELECT f.address, f.slug FROM fiduciaries f JOIN fiduciary_operators fo ON f.address = fo.fiduciary WHERE fo.operator_email = ?").all(email) as Array<{ address: string, slug: string }>;
    return { operatorEmail: email, fiduciaries: rows };
  }
}

export function statusOf(n: bigint | number): Status {
  return (["None", "Active", "Withdrawn"] as const)[Number(n)] ?? "None";
}
