import { randomUUID } from "node:crypto";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import {
  API_KEY_HEADER,
  ENTRY_ID_HEADER,
  REASON_CODES,
  ZERO_HASH,
  chainEntry,
  checksumAddress,
  purposeIdOf,
  type AccessLogEntry,
  type AccessReason,
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
  /**
   * The company's API key (trd.md §6.2a), sent on every call to Core. Core's gateway endpoints refuse a call without
   * a valid key for this company, and the SDK then fails closed.
   */
  apiKey?: string;
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

/** An access decided by someone else (the Processor, trd.md §6.7) that still belongs in this company's log. */
export interface LogAccessInput {
  purpose: string;
  principal: string;
  decision: "ALLOWED" | "BLOCKED";
  reason: AccessReason;
  endpoint: string;
  latencyMs: number;
}

export interface SammatiGate {
  requireConsent(opts: RequireConsentOptions): RequestHandler;
  /** Appends an entry to this company's hash chain through the same queue as requireConsent; returns its id. Never throws and never waits for Core. */
  logAccess(input: LogAccessInput): string;
  /** Resolves when every queued access-log entry has been delivered (or given up on). */
  flush(): Promise<void>;
  /** Stops the consent feed. Call on shutdown. */
  close(): void;
}

export { ENTRY_ID_HEADER };

const DEFAULT_TIMEOUT_MS = 3000;
const DEFAULT_CACHE_TTL_MS = 5000;
const DEFAULT_MAX_QUEUED_LOGS = 5000;
const MAX_APPEND_ATTEMPTS = 5;
const NO_PRINCIPAL_ADDRESS: Hex = "0x" + "00".repeat(20);
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const MESSAGES: Record<ReasonCode, string> = {
  CONSENT_WITHDRAWN: "The user withdrew consent for this purpose.",
  CONSENT_EXPIRED: "The user's consent for this purpose has expired.",
  NO_CONSENT: "The user has not given consent for this purpose.",
  LEDGER_UNAVAILABLE: "Consent could not be verified, so access is blocked.",
  NO_PRINCIPAL: "The request did not identify a data principal.",
};

/** What an API-key refusal from Core means for the company's developer, in the 451 message and the one warning. */
const KEY_PROBLEMS: Record<string, string> = {
  INVALID_API_KEY:
    "Sammati rejected this company's API key (unknown, revoked or missing), so consent could not be verified and access is blocked. A company can use Sammati only after the regulator approves its registration.",
  FIDUCIARY_MISMATCH: "Sammati rejected this API key because it belongs to another company, so consent could not be verified and access is blocked.",
};

const UNAVAILABLE: ConsentVerdict = { valid: false, reason: "LEDGER_UNAVAILABLE", expiresAt: null };

export function sammati(rawOptions: SammatiOptions): SammatiGate {
  // Core stores addresses in EIP-55 form and a log entry's hash covers them, so everything this gate writes uses it too.
  const options = { ...rawOptions, fiduciary: checksumAddress(rawOptions.fiduciary) };
  const core = options.coreUrl.replace(/\/+$/, "");
  const timeout = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const auth: Record<string, string> = options.apiKey ? { [API_KEY_HEADER]: options.apiKey } : {};
  /** Set while Core is refusing this company's key, so the 451 can say why. Cleared by the next accepted call. */
  let keyProblem: string | null = null;
  const warned = new Set<string>();
  const keyRefused = async (res: globalThis.Response): Promise<void> => {
    const body = (await res.json().catch(() => ({}))) as { error?: { code?: string } };
    const code = body.error?.code && KEY_PROBLEMS[body.error.code] ? body.error.code : "INVALID_API_KEY";
    keyProblem = KEY_PROBLEMS[code]!;
    if (!warned.has(code)) {
      warned.add(code);
      console.warn(`[sammati] Core refused this company's API key (${code}). ${KEY_PROBLEMS[code]}`);
    }
  };
  const log = new LogChain(core, options.fiduciary, timeout, options.maxQueuedLogs ?? DEFAULT_MAX_QUEUED_LOGS, auth);
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
      const res = await fetch(`${core}/v1/gateway/consent-state?${q}`, { headers: auth, signal: AbortSignal.timeout(timeout) });
      if (res.status === 401 || res.status === 403) {
        await keyRefused(res);
        return { verdict: UNAVAILABLE, trusted: false };
      }
      if (!res.ok) return { verdict: UNAVAILABLE, trusted: false };
      keyProblem = null;
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
        const principal = raw && ADDRESS.test(raw) ? checksumAddress(raw) : undefined;
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
          res.status(451).json({ code: denied, message: denied === "LEDGER_UNAVAILABLE" && keyProblem ? keyProblem : MESSAGES[denied] });
        } else {
          next();
        }
        log.enqueue(entry);
      };
    },
    logAccess(input) {
      const id = randomUUID();
      log.enqueue({
        at: Math.floor(Date.now() / 1000),
        decision: input.decision,
        endpoint: input.endpoint,
        id,
        latencyMs: input.latencyMs,
        principal: ADDRESS.test(input.principal) ? checksumAddress(input.principal) : NO_PRINCIPAL_ADDRESS,
        purposeCode: input.purpose,
        reason: input.reason,
      });
      return id;
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
    private readonly auth: Record<string, string> = {},
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
    // More than one writer may share a company's chain (its app and the Processor): a sequence collision is
    // rejected with 409, we resume from Core and try again.
    for (let attempt = 0; attempt < MAX_APPEND_ATTEMPTS; attempt++) {
      const head = this.head ?? (await this.resume());
      const full: AccessLogEntry = { ...entry, fiduciary: this.fiduciary, seq: head.seq + 1 };
      const chained = chainEntry(head.hash, full);
      const row: StoredAccessLogEntry = { ...full, prevHash: chained.prevHash, hash: chained.hash, batchIndex: null };
      const res = await fetch(`${this.core}/v1/gateway/log`, {
        method: "POST",
        headers: { "content-type": "application/json", ...this.auth },
        body: JSON.stringify(row),
        signal: AbortSignal.timeout(this.timeout),
      });
      if (res.ok) {
        this.head = { seq: row.seq, hash: row.hash };
        return;
      }
      this.head = null; // out of sync: resume from Core and retry
      if (res.status === 401 || res.status === 403) throw new Error(`Core refused this company's API key (${res.status}); the access was not logged`);
      if (res.status !== 409) throw new Error(`Core rejected log entry: ${res.status}`);
    }
    throw new Error("Core kept rejecting the log entry");
  }

  private async resume(): Promise<{ seq: number; hash: Hex }> {
    const res = await fetch(`${this.core}/v1/fiduciaries/${this.fiduciary}/access?limit=1`, {
      headers: this.auth,
      signal: AbortSignal.timeout(this.timeout),
    });
    if (!res.ok) throw new Error(`Could not read log head: ${res.status}`);
    const { items } = (await res.json()) as { items: StoredAccessLogEntry[] };
    const last = items[0];
    return last ? { seq: last.seq, hash: last.hash } : { seq: 0, hash: ZERO_HASH };
  }
}
