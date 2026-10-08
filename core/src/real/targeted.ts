// Sammati IDs and targeted consent requests (trd.md §4.5, §6.11): a company asks a specific customer for consent
// without a QR, and the customer hears about it in the wallet.
//
// The one rule that shapes this file: **what the company is told must not depend on who the customer is.** A handle
// that exists, one that does not, a company the customer blocked, a customer who already has the maximum open from
// that company: all get the same answer and run the same writes, and only the first pushes anything.
import { verifyMessage } from "ethers";
import type { Hex, InboxRequest, TargetedRequestRow, TargetedStatus, WsEvent } from "@sammati/shared";
import type { Config } from "../config";
import { HttpError, badRequest } from "../errors";
import { now } from "../store";
import type { Db } from "./db";
import type { FiduciaryRow, Repo } from "./repo";

export const HANDLE_SUFFIX = "@sammati";
const HANDLE = /^[a-z0-9._-]{3,30}@sammati$/;
const MAX_MESSAGE = 140;
const MIN_HOURS = 1;
const MAX_HOURS = 168;
const DEFAULT_HOURS = 72;
const RATE_WINDOW_MS = 60_000;

const lc = (s: string): string => s.toLowerCase();

/** `Asha@Sammati` -> `asha@sammati`; null if it is not a well-formed handle. */
export function normaliseHandle(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const h = raw.trim().toLowerCase();
  return HANDLE.test(h) ? h : null;
}

/** Plain text only: control characters (including line breaks) are removed, then it is trimmed. */
export function cleanMessage(raw: unknown): string | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "string") throw badRequest('"message" must be text');
  // eslint-disable-next-line no-control-regex
  const text = raw.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  if (text.length > MAX_MESSAGE) throw badRequest(`"message" must be at most ${MAX_MESSAGE} characters`);
  return text === "" ? null : text;
}

export interface TargetRow {
  requestId: string;
  fiduciary: Hex;
  principal: Hex | null;
  message: string | null;
  status: "sent" | "seen" | "granted" | "declined";
  createdAt: number;
  expiresAt: number;
  seenAt: number | null;
}

type Row = Record<string, unknown>;

export class TargetedRequests {
  /** Send times per company, in ms, for the rolling rate limit. */
  private readonly sent = new Map<string, number[]>();

  constructor(
    private readonly db: Db,
    private readonly repo: Repo,
    private readonly publish: (event: WsEvent) => void,
    private readonly config: Pick<Config, "targetedRatePerMinute" | "maxOpenRequestsPerUser" | "identityFreshnessSeconds">,
    private readonly clock: () => number = now,
    private readonly clockMs: () => number = Date.now,
  ) {}

  // ------------------------------------------------------------ signed messages (trd.md §4.5)

  /** The recovered signer must be `principal`, and the message must be fresh. */
  verify(message: string, signature: unknown, principal: string, issuedAt: unknown): void {
    if (typeof issuedAt !== "number" || !Number.isSafeInteger(issuedAt) || Math.abs(this.clock() - issuedAt) > this.config.identityFreshnessSeconds) {
      throw new HttpError(400, "STALE_SIGNATURE", "The signed message is too old or too new: check the phone's clock");
    }
    let signer: string;
    try {
      signer = verifyMessage(message, String(signature));
    } catch {
      throw new HttpError(400, "BAD_SIGNATURE", "The signature is not valid");
    }
    if (lc(signer) !== lc(principal)) throw new HttpError(400, "BAD_SIGNATURE", "The message was not signed by this wallet");
  }

  // ------------------------------------------------------------ Sammati IDs (N-01)

  register(handleRaw: unknown, principal: Hex, issuedAt: unknown, signature: unknown): { handle: string; created: boolean } {
    const handle = normaliseHandle(handleRaw);
    if (!handle) throw new HttpError(400, "BAD_HANDLE", "A Sammati ID is 3 to 30 letters, numbers, dots, underscores or dashes, then @sammati");
    const p = lc(principal) as Hex;
    this.verify(`sammati-id:v1:${handle}:${p}:${issuedAt}`, signature, p, issuedAt);

    const owner = this.db.prepare("SELECT principal FROM identities WHERE handle = ?").get(handle) as { principal: string } | undefined;
    if (owner) {
      if (owner.principal === p) return { handle, created: false };
      throw new HttpError(409, "HANDLE_TAKEN", "That Sammati ID is taken");
    }
    this.db.transaction(() => {
      this.db.prepare("DELETE FROM identities WHERE principal = ?").run(p); // a wallet has one ID: the old one is released
      this.db.prepare("INSERT INTO identities (handle, principal, registered_at) VALUES (?, ?, ?)").run(handle, p, this.clock());
    })();
    return { handle, created: true };
  }

  identityOf(principal: Hex): string | null {
    const r = this.db.prepare("SELECT handle FROM identities WHERE principal = ?").get(lc(principal)) as { handle: string } | undefined;
    return r?.handle ?? null;
  }

  // ------------------------------------------------------------ sending (N-02)

  /** A company over its own limit gets a 429, which says nothing about any customer. */
  checkRate(f: FiduciaryRow): void {
    const t = this.clockMs();
    const recent = (this.sent.get(lc(f.address)) ?? []).filter((x) => t - x < RATE_WINDOW_MS);
    if (recent.length >= this.config.targetedRatePerMinute) {
      const retry = Math.max(1, Math.ceil((RATE_WINDOW_MS - (t - recent[0]!)) / 1000));
      const err = new HttpError(429, "RATE_LIMITED", `You are sending too fast. Try again in ${retry} seconds.`);
      (err as HttpError & { retryAfter?: number }).retryAfter = retry;
      throw err;
    }
    recent.push(t);
    this.sent.set(lc(f.address), recent);
  }

  expiryFrom(hours: unknown): number {
    const h = hours === undefined || hours === null ? DEFAULT_HOURS : hours;
    if (typeof h !== "number" || !Number.isInteger(h) || h < MIN_HOURS || h > MAX_HOURS) {
      throw badRequest(`"expiresInHours" must be a whole number from ${MIN_HOURS} to ${MAX_HOURS}`);
    }
    return this.clock() + h * 3600;
  }

  /**
   * Records a request addressed to `handle`. Validation has already happened; from here on the branches differ only
   * in whether the row names a wallet and whether anything is pushed.
   */
  send(f: FiduciaryRow, requestId: string, handle: string, purposeCodes: string[], message: string | null, expiresAt: number): void {
    const created = this.clock();
    const company = lc(f.address);
    const identity = this.db.prepare("SELECT principal FROM identities WHERE handle = ?").get(handle) as { principal: Hex } | undefined;
    const target = identity?.principal ?? null;
    // Both of these run for an unknown handle too (against NULL), so the work is the same.
    const blocked = this.db.prepare("SELECT 1 FROM blocks WHERE principal = ? AND fiduciary = ?").get(target, company) !== undefined;
    const open = (
      this.db
        .prepare("SELECT COUNT(*) AS n FROM request_targets WHERE principal = ? AND fiduciary = ? AND kind <> 'self_renewal' AND status IN ('sent','seen') AND expires_at > ?")
        .get(target, company, created) as { n: number }
    ).n;
    const deliver = target !== null && !blocked && open < this.config.maxOpenRequestsPerUser;

    this.db
      .prepare("INSERT INTO request_targets (request_id, fiduciary, principal, message, status, created_at, expires_at) VALUES (?, ?, ?, ?, 'sent', ?, ?)")
      .run(requestId, company, deliver ? target : null, message, created, expiresAt);

    if (deliver) this.publishRequested({ requestId, principal: target, f, purposeCodes, message, expiresAt });
  }

  /** Tells the customer's wallet to refetch its inbox: used for targeted requests and for a company's renewal request. */
  publishRequested(r: { requestId: string; principal: Hex; f: FiduciaryRow; purposeCodes: string[]; message: string | null; expiresAt: number }): void {
    this.publish({
      event: "consent.requested",
      principal: lc(r.principal) as Hex,
      requestId: r.requestId,
      fiduciary: r.f.address,
      fiduciaryName: r.f.name,
      purposeCodes: r.purposeCodes,
      message: r.message,
      expiresAt: r.expiresAt,
      at: this.clock(),
    });
  }

  // ------------------------------------------------------------ reading

  private status(r: Row): TargetedStatus {
    const s = r.status as TargetRow["status"];
    return (s === "sent" || s === "seen") && (r.expires_at as number) <= this.clock() ? "expired" : s;
  }

  target(requestId: string): TargetRow | undefined {
    const r = this.db.prepare("SELECT * FROM request_targets WHERE request_id = ?").get(requestId) as Row | undefined;
    if (!r) return undefined;
    return {
      requestId,
      fiduciary: r.fiduciary as Hex,
      principal: (r.principal as Hex | null) ?? null,
      message: (r.message as string | null) ?? null,
      status: r.status as TargetRow["status"],
      createdAt: r.created_at as number,
      expiresAt: r.expires_at as number,
      seenAt: (r.seen_at as number | null) ?? null,
    };
  }

  /** The company's own sent requests. The handle shown is the text it typed; no principal is in the answer. */
  listFor(f: FiduciaryRow): TargetedRequestRow[] {
    const rows = this.db
      .prepare(
        `SELECT t.*, r.customer_alias AS alias, r.purposes AS purposes FROM request_targets t JOIN requests r ON r.id = t.request_id
         WHERE t.fiduciary = ? AND t.kind = 'targeted' ORDER BY t.created_at DESC, t.rowid DESC`,
      )
      .all(lc(f.address)) as Row[];
    return rows.map((r) => this.rowFor(f, r));
  }

  statusFor(f: FiduciaryRow, requestId: string): { requestId: string; status: TargetedStatus; expiresAt: number } {
    const r = this.db.prepare("SELECT * FROM request_targets WHERE request_id = ? AND fiduciary = ?").get(requestId, lc(f.address)) as Row | undefined;
    if (!r) throw new HttpError(404, "REQUEST_NOT_FOUND", `Unknown request ${requestId}`);
    return { requestId, status: this.status(r), expiresAt: r.expires_at as number };
  }

  private rowFor(f: FiduciaryRow, r: Row): TargetedRequestRow {
    const codes = (JSON.parse(r.purposes as string) as string[]).map((id) => this.repo.purpose(f, id).code);
    return {
      requestId: r.request_id as string,
      handle: r.alias as string,
      purposes: codes,
      message: (r.message as string | null) ?? null,
      status: this.status(r),
      createdAt: r.created_at as number,
      expiresAt: r.expires_at as number,
    };
  }

  /** What is waiting for this wallet: open, not expired, from a company that is not blocked. */
  inbox(principal: Hex): InboxRequest[] {
    const rows = this.db
      .prepare(
        `SELECT t.*, r.purposes AS purposes FROM request_targets t JOIN requests r ON r.id = t.request_id
         WHERE t.principal = ? AND t.kind <> 'self_renewal' AND t.status IN ('sent','seen') AND t.expires_at > ?
           AND NOT EXISTS (SELECT 1 FROM blocks b WHERE b.principal = t.principal AND b.fiduciary = t.fiduciary)
         ORDER BY t.created_at DESC, t.rowid DESC`,
      )
      .all(lc(principal), this.clock()) as Row[];
    return rows.map((r) => {
      const f = this.repo.fiduciary(r.fiduciary as string);
      return {
        requestId: r.request_id as string,
        fiduciary: { address: f.address, name: f.name, color: f.color, sector: f.sector },
        purposes: (JSON.parse(r.purposes as string) as string[]).map((id) => {
          const p = this.repo.purpose(f, id);
          return { code: p.code, title: p.title };
        }),
        message: (r.message as string | null) ?? null,
        createdAt: r.created_at as number,
        expiresAt: r.expires_at as number,
        status: r.status as "sent" | "seen",
      };
    });
  }

  // ------------------------------------------------------------ the wallet opening a request

  /**
   * Called before a notice is served. A request that is not targeted is untouched (null). A targeted one answers only
   * to the wallet it was addressed to; to anyone else, or once dead, it looks like an unknown or a gone request.
   */
  openNotice(requestId: string, principal: Hex | null): { targeted: boolean } {
    const t = this.target(requestId);
    if (!t) return { targeted: false };
    const missing = new HttpError(404, "REQUEST_NOT_FOUND", `Unknown request ${requestId}`);
    if (!t.principal || !principal || lc(t.principal) !== lc(principal) || this.isBlocked(t.principal, t.fiduciary)) throw missing;
    if (t.status === "declined" || (t.status !== "granted" && t.expiresAt <= this.clock())) {
      throw new HttpError(410, "REQUEST_EXPIRED", "This consent request is no longer available");
    }
    if (t.status === "sent") {
      this.db.prepare("UPDATE request_targets SET status = 'seen', seen_at = ? WHERE request_id = ? AND status = 'sent'").run(this.clock(), requestId);
      this.announce(t.fiduciary, requestId, "seen");
    }
    return { targeted: true };
  }

  /** A grant arrived: every open request from that company with this notice, addressed to this customer, is Granted. */
  onGrant(principal: Hex, fiduciary: Hex, noticeHash: string): void {
    const rows = this.db
      .prepare(
        `SELECT t.request_id FROM request_targets t JOIN requests r ON r.id = t.request_id
         WHERE t.principal = ? AND t.fiduciary = ? AND t.status IN ('sent','seen') AND t.expires_at > ? AND r.notice_hash = ?`,
      )
      .all(lc(principal), lc(fiduciary), this.clock(), lc(noticeHash)) as Array<{ request_id: string }>;
    for (const { request_id } of rows) {
      this.db.prepare("UPDATE request_targets SET status = 'granted', decided_at = ? WHERE request_id = ?").run(this.clock(), request_id);
      this.announce(fiduciary, request_id, "granted");
    }
  }

  // ------------------------------------------------------------ decline and block

  decline(requestId: string, principal: Hex, issuedAt: unknown, signature: unknown): TargetedStatus {
    const p = lc(principal) as Hex;
    this.verify(`sammati-decline:v1:${requestId}:${p}:${issuedAt}`, signature, p, issuedAt);
    const t = this.target(requestId);
    if (!t || !t.principal || lc(t.principal) !== p) throw new HttpError(404, "REQUEST_NOT_FOUND", `Unknown request ${requestId}`);
    if (t.status === "sent" || t.status === "seen") {
      this.db.prepare("UPDATE request_targets SET status = 'declined', decided_at = ? WHERE request_id = ?").run(this.clock(), requestId);
      this.announce(t.fiduciary, requestId, "declined");
      return "declined";
    }
    return this.status({ status: t.status, expires_at: t.expiresAt });
  }

  isBlocked(principal: string, fiduciary: string): boolean {
    return this.db.prepare("SELECT 1 FROM blocks WHERE principal = ? AND fiduciary = ?").get(lc(principal), lc(fiduciary)) !== undefined;
  }

  setBlocked(principal: Hex, fiduciary: Hex, action: unknown, issuedAt: unknown, signature: unknown): boolean {
    if (action !== "block" && action !== "unblock") throw badRequest('"action" must be "block" or "unblock"');
    const p = lc(principal) as Hex;
    const f = this.repo.fiduciary(fiduciary);
    this.verify(`sammati-block:v1:${action}:${lc(f.address)}:${p}:${issuedAt}`, signature, p, issuedAt);
    if (action === "unblock") {
      this.db.prepare("DELETE FROM blocks WHERE principal = ? AND fiduciary = ?").run(p, lc(f.address));
      return false;
    }
    this.db.transaction(() => {
      this.db.prepare("INSERT OR IGNORE INTO blocks (principal, fiduciary, blocked_at) VALUES (?, ?, ?)").run(p, lc(f.address), this.clock());
    })();
    // Blocking also declines what that company already has open with this customer.
    const open = this.db
      .prepare("SELECT request_id FROM request_targets WHERE principal = ? AND fiduciary = ? AND status IN ('sent','seen')")
      .all(p, lc(f.address)) as Array<{ request_id: string }>;
    for (const { request_id } of open) {
      this.db.prepare("UPDATE request_targets SET status = 'declined', decided_at = ? WHERE request_id = ?").run(this.clock(), request_id);
      this.announce(f.address, request_id, "declined");
    }
    return true;
  }

  blocks(principal: Hex): Array<{ fiduciary: { address: Hex; name: string }; blockedAt: number }> {
    const rows = this.db.prepare("SELECT fiduciary, blocked_at FROM blocks WHERE principal = ? ORDER BY blocked_at DESC").all(lc(principal)) as Row[];
    return rows.map((r) => {
      const f = this.repo.fiduciary(r.fiduciary as string);
      return { fiduciary: { address: f.address, name: f.name }, blockedAt: r.blocked_at as number };
    });
  }

  private announce(fiduciary: string, requestId: string, status: TargetedStatus): void {
    // A request the customer opened on their own behalf is not one the company knows about.
    const kind = (this.db.prepare("SELECT kind FROM request_targets WHERE request_id = ?").get(requestId) as { kind: string } | undefined)?.kind;
    if (kind === "self_renewal") return;
    this.publish({ event: "request.updated", fiduciary: fiduciary as Hex, requestId, status, at: this.clock() });
  }
}
