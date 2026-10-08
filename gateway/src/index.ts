import { randomUUID } from "node:crypto";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import {
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

export interface SammatiOptions {
  coreUrl: string;
  /** The company's fiduciary address. */
  fiduciary: Hex;
  /** Company key. Reserved for signing anchor batches (trd.md §8); unused until anchoring lands. */
  signer?: string;
  /** Per-call timeout; consent checks fail closed when Core is slower than this. */
  timeoutMs?: number;
}

export interface RequireConsentOptions {
  /** Purpose code, e.g. "credit_check". */
  purpose: string;
  principalFrom: (req: Request) => string | undefined;
}

export interface SammatiGate {
  requireConsent(opts: RequireConsentOptions): RequestHandler;
}

const DEFAULT_TIMEOUT_MS = 3000;
const NO_PRINCIPAL_ADDRESS: Hex = "0x" + "00".repeat(20);
const MESSAGES: Record<ReasonCode, string> = {
  CONSENT_WITHDRAWN: "The user withdrew consent for this purpose.",
  CONSENT_EXPIRED: "The user's consent for this purpose has expired.",
  NO_CONSENT: "The user has not given consent for this purpose.",
  LEDGER_UNAVAILABLE: "Consent could not be verified, so access is blocked.",
  NO_PRINCIPAL: "The request did not identify a data principal.",
};

export function sammati(options: SammatiOptions): SammatiGate {
  const core = options.coreUrl.replace(/\/+$/, "");
  const timeout = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const log = new LogChain(core, options.fiduciary, timeout);

  async function checkConsent(principal: string, purposeId: Hex): Promise<ReasonCode | null> {
    const q = new URLSearchParams({ principal, fid: options.fiduciary, purpose: purposeId });
    try {
      const res = await fetch(`${core}/v1/gateway/consent-state?${q}`, { signal: AbortSignal.timeout(timeout) });
      if (!res.ok) return "LEDGER_UNAVAILABLE";
      const state = (await res.json()) as ConsentStateResponse;
      if (state.valid) return null;
      return isReasonCode(state.reason) ? state.reason : "LEDGER_UNAVAILABLE";
    } catch {
      return "LEDGER_UNAVAILABLE"; // fail closed (AGENTS.md)
    }
  }

  return {
    requireConsent({ purpose, principalFrom }) {
      const purposeId = purposeIdOf(options.fiduciary, purpose);

      return async (req: Request, res: Response, next: NextFunction) => {
        const started = Date.now();
        const principal = principalFrom(req)?.trim() || undefined;
        const denied = principal ? await checkConsent(principal, purposeId) : "NO_PRINCIPAL";

        const entry = {
          at: Math.floor(started / 1000),
          decision: denied ? ("BLOCKED" as const) : ("ALLOWED" as const),
          endpoint: `${req.method} ${req.route?.path ?? req.path}`,
          id: randomUUID(),
          latencyMs: Date.now() - started,
          principal: principal ?? NO_PRINCIPAL_ADDRESS,
          purposeCode: purpose,
          reason: denied ?? ("OK" as const),
        };

        // Logging never blocks the response (AGENTS.md): queued after the decision is sent.
        if (denied) {
          res.status(451).json({ code: denied, message: MESSAGES[denied] });
        } else {
          next();
        }
        log.enqueue(entry);
      };
    },
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

  constructor(
    private readonly core: string,
    private readonly fiduciary: Hex,
    private readonly timeout: number,
  ) {}

  enqueue(entry: PendingEntry): void {
    this.tail = this.tail.then(() => this.append(entry)).catch((err) => {
      console.warn("[sammati] access log failed:", err instanceof Error ? err.message : err);
    });
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
