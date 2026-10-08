import { randomUUID } from "node:crypto";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import {
  ENTRY_ID_HEADER,
  REASON_CODES,
  ZERO_HASH,
  chainEntry,
  purposeIdOf,
  type AccessLogEntry,
  type ConsentStateResponse,
  type Hex,
  type ReasonCode,
  type StoredAccessLogEntry,
} from "@sammati/shared";
import { ConsentFeed, type ConsentVerdict } from "./feed";

export interface SammatiOptions {
  coreUrl: string;
  /** The company's fiduciary address. */
  fiduciary: Hex;
  /** Company key. Reserved for signing anchor batches (trd.md §8); unused until anchoring lands. */
  signer?: string;
  /** Per-call timeout; consent checks fail closed when Core is slower than this. */
  timeoutMs?: number;
  /** A cached consent decision older than this is re-checked with Core. Default 5000 (trd.md §7). */
  cacheTtlMs?: number;
  /** Set false to skip the WebSocket and ask Core on every request. */
  liveCache?: boolean;
  /** Log entries waiting for Core beyond this are dropped with a warning. Default 5000. */
  maxQueuedLogs?: number;
}

export interface RequireConsentOptions {
  /** Purpose code, e.g. "credit_check". */
  purpose: string;
  principalFrom: (req: Request) => string | undefined;
}

export interface SammatiGate {
  requireConsent(opts: RequireConsentOptions): RequestHandler;
  /** Resolves when every queued access-log entry has been delivered (or given up on). */
  flush(): Promise<void>;
  /** Stops the consent feed. Call on shutdown. */
  close(): void;
}

export { ENTRY_ID_HEADER };

const DEFAULT_TIMEOUT_MS = 3000;
const DEFAULT_CACHE_TTL_MS = 5000;
const DEFAULT_MAX_QUEUED_LOGS = 5000;
const NO_PRINCIPAL_ADDRESS: Hex = "0x" + "00".repeat(20);
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const MESSAGES: Record<ReasonCode, string> = {
  CONSENT_WITHDRAWN: "The user withdrew consent for this purpose.",
  CONSENT_EXPIRED: "The user's consent for this purpose has expired.",
  NO_CONSENT: "The user has not given consent for this purpose.",
  LEDGER_UNAVAILABLE: "Consent could not be verified, so access is blocked.",
  NO_PRINCIPAL: "The request did not identify a data principal.",
};

const UNAVAILABLE: ConsentVerdict = { valid: false, reason: "LEDGER_UNAVAILABLE", expiresAt: null };

export function sammati(options: SammatiOptions): SammatiGate {
  const core = options.coreUrl.replace(/\/+$/, "");
  const timeout = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const log = new LogChain(core, options.fiduciary, timeout, options.maxQueuedLogs ?? DEFAULT_MAX_QUEUED_LOGS);
  const feed = new ConsentFeed({
    coreUrl: core,
    fiduciary: options.fiduciary,
    ttlMs: options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS,
    log: console.warn,
  });
  if (options.liveCache !== false) feed.start();

  /** Asks Core. Anything but a clean answer is "cannot verify", which blocks (AGENTS.md: fail closed). */
  async function askCore(principal: string, purposeId: Hex): Promise<{ verdict: ConsentVerdict; trusted: boolean }> {
    const q = new URLSearchParams({ principal, fid: options.fiduciary, purpose: purposeId });
    try {
      const res = await fetch(`${core}/v1/gateway/consent-state?${q}`, { signal: AbortSignal.timeout(timeout) });
      if (!res.ok) return { verdict: UNAVAILABLE, trusted: false };
      const state = (await res.json()) as ConsentStateResponse;
      if (state.valid) return { verdict: { valid: true, expiresAt: state.expiresAt }, trusted: true };
      const reason = isReasonCode(state.reason) ? state.reason : "LEDGER_UNAVAILABLE";
      return { verdict: { valid: false, reason, expiresAt: state.expiresAt }, trusted: reason !== "LEDGER_UNAVAILABLE" };
    } catch {
      return { verdict: UNAVAILABLE, trusted: false };
    }
  }

  async function verdictFor(principal: string, purposeId: Hex): Promise<ConsentVerdict> {
    const cached = feed.lookup(principal, purposeId);
    if (cached) return cached;
    const token = feed.begin(principal, purposeId);
    const { verdict, trusted } = await askCore(principal, purposeId);
    if (trusted) feed.store(principal, purposeId, verdict, token);
    return verdict;
  }

  return {
    requireConsent({ purpose, principalFrom }) {
      const purposeId = purposeIdOf(options.fiduciary, purpose);

      return async (req: Request, res: Response, next: NextFunction) => {
        const started = Date.now();
        const raw = principalFrom(req)?.trim();
        const principal = raw && ADDRESS.test(raw) ? raw : undefined;
        const verdict = principal ? await verdictFor(principal, purposeId) : null;
        const denied: ReasonCode | null = !principal ? "NO_PRINCIPAL" : verdict!.valid ? null : (verdict!.reason ?? "LEDGER_UNAVAILABLE");

        const id = randomUUID();
        const entry = {
          at: Math.floor(started / 1000),
          decision: denied ? ("BLOCKED" as const) : ("ALLOWED" as const),
          endpoint: `${req.method} ${req.route?.path ?? req.path}`,
          id,
          latencyMs: Date.now() - started,
          principal: principal ?? NO_PRINCIPAL_ADDRESS,
          purposeCode: purpose,
          reason: denied ?? ("OK" as const),
        };

        res.setHeader(ENTRY_ID_HEADER, id);
        // Logging never blocks the response (AGENTS.md): the entry is queued after the decision is sent.
        if (denied) {
          res.status(451).json({ code: denied, message: MESSAGES[denied] });
        } else {
          next();
        }
        log.enqueue(entry);
      };
    },
    flush: () => log.flush(),
    close: () => feed.stop(),
  };
}

function isReasonCode(v: unknown): v is ReasonCode {
  return typeof v === "string" && (REASON_CODES as readonly string[]).includes(v);
}

type PendingEntry = Omit<AccessLogEntry, "seq" | "fiduciary">;

/**
 * Appends entries to this fiduciary's hash chain and posts them to Core in
 * order. seq/prevHash resume from Core on first use and after any rejection
 * (Core reset, another writer), so a log call can fail but never wedge.
 */
class LogChain {
  private tail: Promise<void> = Promise.resolve();
  private head: { seq: number; hash: Hex } | null = null;
  private queued = 0;
  private dropped = 0;

  constructor(
    private readonly core: string,
    private readonly fiduciary: Hex,
    private readonly timeout: number,
    private readonly maxQueued: number,
  ) {}

  enqueue(entry: PendingEntry): void {
    if (this.queued >= this.maxQueued) {
      // Core has been unreachable for a long time. Unbounded memory would take the company's app down with it.
      if (this.dropped++ % 100 === 0) console.warn(`[sammati] access log queue full (${this.maxQueued}); dropped ${this.dropped} entries so far`);
      return;
    }
    this.queued++;
    this.tail = this.tail
      .then(() => this.append(entry))
      .catch((err) => {
        console.warn("[sammati] access log failed:", err instanceof Error ? err.message : err);
      })
      .finally(() => {
        this.queued--;
      });
  }

  flush(): Promise<void> {
    return this.tail;
  }

  private async append(entry: PendingEntry): Promise<void> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const head = this.head ?? (await this.resume());
      const full: AccessLogEntry = { ...entry, fiduciary: this.fiduciary, seq: head.seq + 1 };
      const chained = chainEntry(head.hash, full);
      const row: StoredAccessLogEntry = { ...full, prevHash: chained.prevHash, hash: chained.hash, batchIndex: null };
      const res = await fetch(`${this.core}/v1/gateway/log`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(row),
        signal: AbortSignal.timeout(this.timeout),
      });
      if (res.ok) {
        this.head = { seq: row.seq, hash: row.hash };
        return;
      }
      this.head = null; // out of sync: resume from Core and retry once
      if (res.status !== 409) throw new Error(`Core rejected log entry: ${res.status}`);
    }
    throw new Error("Core kept rejecting the log entry");
  }

  private async resume(): Promise<{ seq: number; hash: Hex }> {
    const res = await fetch(`${this.core}/v1/fiduciaries/${this.fiduciary}/access?limit=1`, {
      signal: AbortSignal.timeout(this.timeout),
    });
    if (!res.ok) throw new Error(`Could not read log head: ${res.status}`);
    const { items } = (await res.json()) as { items: StoredAccessLogEntry[] };
    const last = items[0];
    return last ? { seq: last.seq, hash: last.hash } : { seq: 0, hash: ZERO_HASH };
  }
}
