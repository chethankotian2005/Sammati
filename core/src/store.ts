import { randomUUID } from "node:crypto";
import {
  REASON_CODES,
  ZERO_HASH,
  chainEntry,
  hashEntry,
  keccakUtf8,
  purposeIdOf,
  type AccessLogEntry,
  type AnchorBatchView,
  type CascadeItem,
  type ConsentStateResponse,
  type ConsentView,
  type FiduciaryConsents,
  type GrantConsent,
  type Hex,
  type IntegrityState,
  type LedgerEventType,
  type LedgerEventView,
  type PrincipalConsentsResponse,
  type ReasonCode,
  type Status,
  type StoredAccessLogEntry,
  type WithdrawConsent,
} from "@sammati/shared";
import type { Config } from "./config";
import { HttpError } from "./errors";
import {
  loadFixtures,
  type DirectoryFiduciary,
  type DirectoryPurpose,
  type Fixtures,
} from "./fixtures";

export const now = (): number => Math.floor(Date.now() / 1000);
const lc = (s: string): string => s.toLowerCase();

export interface ConsentRecord {
  principal: Hex;
  fiduciary: Hex;
  purposeId: Hex;
  status: Status;
  grantedAt: number;
  expiresAt: number;
  updatedAt: number;
  noticeHash: Hex | null;
  lastTx: Hex;
}

export interface StoredRequest {
  id: string;
  fiduciary: Hex;
  purposeIds: Hex[];
  customerAlias: string;
  createdAt: number;
}

const DEMO_REQUEST_ID = "req_demo_quickloan";
const DEMO_ALIAS = "Customer #4821";
const ACK_DELAY_MS = [1000, 3000] as const; // trd.md Â§9: stubs ack after 1 to 3 s

const consentKey = (principal: string, fiduciary: string, purposeId: string): string =>
  `${lc(principal)}|${lc(fiduciary)}|${lc(purposeId)}`;
const cascadeKey = (principal: string, purposeId: string): string => `${lc(principal)}|${lc(purposeId)}`;

/**
 * In-memory stand-in for chain + DB while STUB_MODE is on. Seeded from
 * core/fixtures; `reset()` returns to that seed. Mirrors the shapes the real
 * Core will serve so clients can be built against it.
 */
export class StubStore {
  fx!: Fixtures;
  private consents = new Map<string, ConsentRecord>();
  private nonces = new Map<string, number>();
  private requests = new Map<string, StoredRequest>();
  private cascade = new Map<string, CascadeItem[]>();
  private access = new Map<string, StoredAccessLogEntry[]>();
  private anchors = new Map<string, AnchorBatchView[]>();
  private integrity = new Map<string, IntegrityState>();
  private ledger: LedgerEventView[] = [];
  private head: Hex = ZERO_HASH;
  private pendingAcks = new Set<NodeJS.Timeout>();

  constructor(private readonly config: Config) {
    this.reset();
  }

  reset(): void {
    for (const t of this.pendingAcks) clearTimeout(t);
    this.pendingAcks.clear();
    this.fx = loadFixtures();
    const { directory } = this.fx;

    this.consents = new Map();
    this.nonces = new Map();
    for (const f of this.fx.consents.fiduciaries) {
      for (const c of f.consents) {
        this.consents.set(consentKey(this.fx.consents.principal, f.fiduciary.address, c.purposeId), {
          principal: this.fx.consents.principal,
          fiduciary: f.fiduciary.address,
          purposeId: c.purposeId,
          status: c.status,
          grantedAt: c.grantedAt ?? 0,
          expiresAt: c.expiresAt ?? 0,
          updatedAt: c.updatedAt ?? 0,
          noticeHash: c.noticeHash,
          lastTx: c.lastTx ?? ZERO_HASH,
        });
      }
    }

    this.cascade = new Map(Object.entries(this.fx.cascade).map(([k, v]) => [lc(k), v]));
    this.access = new Map(Object.entries(this.fx.access).map(([k, v]) => [lc(k), v]));
    this.anchors = new Map(Object.entries(this.fx.anchors).map(([k, v]) => [lc(k), v]));
    this.integrity = new Map();
    this.ledger = this.fx.ledger;
    this.head = [...this.ledger].reverse().find((e) => e.ledgerHead)?.ledgerHead ?? ZERO_HASH;

    const quickloan = directory.fiduciaries[0]!;
    this.requests = new Map([
      [
        DEMO_REQUEST_ID,
        {
          id: DEMO_REQUEST_ID,
          fiduciary: quickloan.address,
          purposeIds: quickloan.purposes.map((p) => p.id),
          customerAlias: DEMO_ALIAS,
          createdAt: now(),
        },
      ],
    ]);
  }

  // --- directory lookups ---

  get fiduciaries(): DirectoryFiduciary[] {
    return this.fx.directory.fiduciaries;
  }

  fiduciary(address: string): DirectoryFiduciary {
    const f = this.fiduciaries.find((x) => lc(x.address) === lc(address));
    if (!f) throw new HttpError(404, "FIDUCIARY_NOT_FOUND", `Unknown fiduciary ${address}`);
    return f;
  }

  /** Accepts a purposeId (bytes32) or a purpose code. */
  purpose(f: DirectoryFiduciary, idOrCode: string): DirectoryPurpose {
    const p = f.purposes.find((x) => lc(x.id) === lc(idOrCode) || x.code === idOrCode);
    if (!p) throw new HttpError(404, "PURPOSE_NOT_FOUND", `Unknown purpose ${idOrCode} for ${f.name}`);
    return p;
  }

  addPurpose(f: DirectoryFiduciary, p: Omit<DirectoryPurpose, "id">): DirectoryPurpose {
    if (f.purposes.some((x) => x.code === p.code)) {
      throw new HttpError(409, "PURPOSE_EXISTS", `${f.name} already has purpose ${p.code}`);
    }
    const purpose = { id: purposeIdOf(f.address, p.code), ...p };
    f.purposes.push(purpose);
    return purpose;
  }

  // --- requests behind QR codes ---

  createRequest(f: DirectoryFiduciary, purposeIds: Hex[], customerAlias: string): StoredRequest {
    const id = `req_${randomUUID().slice(0, 8)}`;
    const req = { id, fiduciary: f.address, purposeIds, customerAlias, createdAt: now() };
    this.requests.set(id, req);
    return req;
  }

  request(id: string): StoredRequest {
    const r = this.requests.get(id);
    if (!r) throw new HttpError(404, "REQUEST_NOT_FOUND", `Unknown request ${id}`);
    return r;
  }

  // --- consent state ---

  nonce(principal: string): number {
    return this.nonces.get(lc(principal)) ?? 0;
  }

  /** Mirrors the contract: the nonce must match exactly, then it advances. */
  private consumeNonce(principal: string, nonce: string): void {
    if (nonce !== String(this.nonce(principal))) {
      throw new HttpError(409, "BAD_NONCE", `Expected nonce ${this.nonce(principal)}, got ${nonce}`);
    }
    this.nonces.set(lc(principal), this.nonce(principal) + 1);
  }

  consentState(principal: Hex, fiduciary: Hex, purposeId: Hex): ConsentStateResponse {
    const rec = this.consents.get(consentKey(principal, fiduciary, purposeId));
    const base = { principal, fiduciary, purposeId, checkedAt: now() };
    if (!rec) return { ...base, status: "None", expiresAt: null, valid: false, reason: "NO_CONSENT" };
    if (rec.status === "Withdrawn") {
      return { ...base, status: rec.status, expiresAt: rec.expiresAt, valid: false, reason: "CONSENT_WITHDRAWN" };
    }
    if (rec.expiresAt <= base.checkedAt) {
      return { ...base, status: rec.status, expiresAt: rec.expiresAt, valid: false, reason: "CONSENT_EXPIRED" };
    }
    return { ...base, status: rec.status, expiresAt: rec.expiresAt, valid: true };
  }

  grant(req: GrantConsent): { txHash: Hex; record: ConsentRecord } {
    this.consumeNonce(req.principal, req.nonce);
    const txHash = this.newTxHash();
    const at = now();
    const record: ConsentRecord = {
      principal: req.principal,
      fiduciary: req.fiduciary,
      purposeId: req.purposeId,
      status: "Active",
      grantedAt: at,
      expiresAt: req.expiresAt,
      updatedAt: at,
      noticeHash: req.noticeHash,
      lastTx: txHash,
    };
    this.consents.set(consentKey(req.principal, req.fiduciary, req.purposeId), record);
    this.addLedger("granted", txHash, req, { expiresAt: req.expiresAt, noticeHash: req.noticeHash });
    return { txHash, record };
  }

  withdraw(req: WithdrawConsent): { txHash: Hex; record: ConsentRecord } {
    const rec = this.consents.get(consentKey(req.principal, req.fiduciary, req.purposeId));
    if (!rec || rec.status !== "Active") {
      throw new HttpError(409, "NOT_ACTIVE", "Only an active consent can be withdrawn");
    }
    this.consumeNonce(req.principal, req.nonce);
    const txHash = this.newTxHash();
    const record = { ...rec, status: "Withdrawn" as const, updatedAt: now(), lastTx: txHash };
    this.consents.set(consentKey(req.principal, req.fiduciary, req.purposeId), record);
    this.addLedger("withdrawn", txHash, req, null);
    return { txHash, record };
  }

  principalConsents(principal: Hex): PrincipalConsentsResponse {
    const fiduciaries: FiduciaryConsents[] = [];
    for (const f of this.fiduciaries) {
      const consents: ConsentView[] = [];
      for (const p of f.purposes) {
        const r = this.consents.get(consentKey(principal, f.address, p.id));
        if (!r) continue;
        consents.push({
          purposeId: p.id,
          code: p.code,
          title: p.title,
          status: r.status,
          grantedAt: r.grantedAt,
          expiresAt: r.expiresAt,
          updatedAt: r.updatedAt,
          noticeHash: r.noticeHash,
          lastTx: r.lastTx,
          required: p.required,
        });
      }
      if (consents.length) {
        fiduciaries.push({
          fiduciary: { address: f.address, name: f.name, sector: f.sector, color: f.color },
          consents,
        });
      }
    }
    return { principal, fiduciaries };
  }

  /** Every stored consent for one fiduciary, across principals. */
  fiduciaryConsents(fiduciary: Hex): ConsentRecord[] {
    return [...this.consents.values()].filter((r) => lc(r.fiduciary) === lc(fiduciary));
  }

  aliasFor(principal: Hex): string | null {
    return lc(principal) === lc(this.fx.directory.demoPrincipal) ? DEMO_ALIAS : null;
  }

  // --- cascade (trd.md Â§9) ---

  cascadeFor(principal: Hex, f: DirectoryFiduciary, purposeId: Hex): CascadeItem[] {
    const stored = this.cascade.get(cascadeKey(principal, purposeId));
    if (stored) return stored;
    return f.processors
      .filter((p) => lc(p.purposeId) === lc(purposeId))
      .map((p) => ({ processor: p.address, name: p.name, notifiedAt: null, ackedAt: null, txHash: null }));
  }

  /** Notifies processors now and acks each after 1 to 3 s; `onUpdate` fires for every change. */
  startCascade(
    principal: Hex,
    f: DirectoryFiduciary,
    purposeId: Hex,
    onUpdate: (item: CascadeItem) => void,
  ): void {
    const items = f.processors
      .filter((p) => lc(p.purposeId) === lc(purposeId))
      .map((p): CascadeItem => ({
        processor: p.address,
        name: p.name,
        notifiedAt: now(),
        ackedAt: null,
        txHash: null,
      }));
    this.cascade.set(cascadeKey(principal, purposeId), items);
    for (const item of items) {
      onUpdate(item);
      const [min, max] = ACK_DELAY_MS;
      const timer = setTimeout(() => {
        this.pendingAcks.delete(timer);
        item.ackedAt = now();
        item.txHash = this.newTxHash();
        onUpdate(item);
      }, min + Math.random() * (max - min));
      timer.unref();
      this.pendingAcks.add(timer);
    }
  }

  // --- access logs ---

  accessFor(fiduciary: Hex): StoredAccessLogEntry[] {
    return this.access.get(lc(fiduciary)) ?? [];
  }

  /** Newest first across all fiduciaries, filtered by principal. */
  activity(principal: Hex): StoredAccessLogEntry[] {
    return [...this.access.values()]
      .flat()
      .filter((e) => lc(e.principal) === lc(principal))
      .sort((a, b) => b.at - a.at || b.seq - a.seq);
  }

  nextLogPosition(fiduciary: Hex): { seq: number; prevHash: Hex } {
    const rows = this.accessFor(fiduciary);
    const last = rows[rows.length - 1];
    return { seq: (last?.seq ?? 0) + 1, prevHash: last?.hash ?? ZERO_HASH };
  }

  /** Validates seq, prevHash and hash exactly as the real Core must. */
  appendLog(row: StoredAccessLogEntry): void {
    this.fiduciary(row.fiduciary);
    const expected = this.nextLogPosition(row.fiduciary);
    if (row.seq !== expected.seq) {
      throw new HttpError(409, "SEQ_MISMATCH", `Expected seq ${expected.seq}, got ${row.seq}`);
    }
    if (row.prevHash !== expected.prevHash) {
      throw new HttpError(409, "PREV_HASH_MISMATCH", "prevHash does not match the chain head");
    }
    if (row.hash !== hashEntry(row.prevHash, toHashedEntry(row))) {
      throw new HttpError(400, "BAD_HASH", "hash does not match keccak256(prevHash || canonical entry)");
    }
    const key = lc(row.fiduciary);
    this.access.set(key, [...this.accessFor(row.fiduciary), { ...row, batchIndex: null }]);
  }

  /** Core-side log entry for the demo simulator (the SDK builds its own). */
  recordDecision(
    f: DirectoryFiduciary,
    principal: Hex,
    purposeCode: string,
    endpoint: string,
    state: ConsentStateResponse,
  ): StoredAccessLogEntry {
    const { seq, prevHash } = this.nextLogPosition(f.address);
    const entry: AccessLogEntry = {
      at: now(),
      decision: state.valid ? "ALLOWED" : "BLOCKED",
      endpoint,
      fiduciary: f.address,
      id: randomUUID(),
      latencyMs: 5 + Math.floor(Math.random() * 20),
      principal,
      purposeCode,
      reason: state.valid ? "OK" : (state.reason ?? "NO_CONSENT"),
      seq,
    };
    const chained = chainEntry(prevHash, entry);
    const row = { ...entry, prevHash: chained.prevHash, hash: chained.hash, batchIndex: null };
    this.appendLog(row);
    return row;
  }

  // --- anchors, integrity, ledger ---

  anchorsFor(fiduciary: Hex): AnchorBatchView[] {
    return this.anchors.get(lc(fiduciary)) ?? [];
  }

  integrityOf(fiduciary: Hex): IntegrityState {
    return this.integrity.get(lc(fiduciary)) ?? "unverified";
  }

  setIntegrity(fiduciary: Hex, state: IntegrityState): void {
    this.integrity.set(lc(fiduciary), state);
  }

  get ledgerEvents(): LedgerEventView[] {
    return this.ledger;
  }

  get ledgerHead(): Hex {
    return this.head;
  }

  newTxHash(): Hex {
    return keccakUtf8(`tx:${randomUUID()}`);
  }

  private addLedger(
    type: LedgerEventType,
    txHash: Hex,
    req: { principal: Hex; fiduciary: Hex; purposeId: Hex },
    payload: Record<string, unknown> | null,
  ): void {
    this.head = keccakUtf8(`${this.head}:${txHash}`);
    const last = this.ledger[this.ledger.length - 1];
    this.ledger = [
      ...this.ledger,
      {
        id: (last?.id ?? 0) + 1,
        type,
        principal: req.principal,
        fiduciary: req.fiduciary,
        purposeId: req.purposeId,
        txHash,
        blockNumber: (last?.blockNumber ?? 0) + 1,
        ledgerHead: this.head,
        at: now(),
        payload,
        explorerUrl: `${this.config.explorerUrl}/tx/${txHash}`,
      },
    ];
  }
}

/** Drops row-only fields so the hash covers exactly the canonical entry. */
export function toHashedEntry(row: AccessLogEntry): AccessLogEntry {
  return {
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

export function isReasonCode(v: unknown): v is ReasonCode {
  return typeof v === "string" && (REASON_CODES as readonly string[]).includes(v);
}
