import { WebSocket } from "ws";
import type { ConsentUpdatedEvent, Hex, ReasonCode } from "@sammati/shared";

/** What the gateway knows about one (principal, purpose) pair. */
export interface ConsentVerdict {
  valid: boolean;
  /** Present when `valid` is false. */
  reason?: ReasonCode;
  /** Unix seconds; null when unknown. A cached "valid" stops being valid at this time. */
  expiresAt: number | null;
}

interface Entry extends ConsentVerdict {
  /** Local time (ms) this was last confirmed, by an answer from Core or a pushed event. */
  checkedAt: number;
}

export interface FeedOptions {
  coreUrl: string;
  fiduciary: Hex;
  /** An entry older than this is re-checked with Core (trd.md §7: 5 s). */
  ttlMs: number;
  log: (message: string) => void;
}

const MAX_ENTRIES = 10_000;
const RECONNECT_MIN_MS = 500;
const RECONNECT_MAX_MS = 5000;

const keyOf = (principal: string, purposeId: string): string => `${principal.toLowerCase()}|${purposeId.toLowerCase()}`;

/**
 * Keeps this company's consent decisions fresh over Core's WebSocket (trd.md §7).
 *
 * The cache is the only place a stale "allowed" could come from, so it is trusted only while the
 * socket is subscribed *and acknowledged*: a withdrawal pushed by Core replaces the entry at once,
 * and when the socket is down every request goes to Core instead. Reconnecting empties the cache,
 * since events may have been missed.
 */
export class ConsentFeed {
  private readonly entries = new Map<string, Entry>();
  /** Bumped per key by every pushed event, so an answer fetched before the event is not cached over it. */
  private readonly versions = new Map<string, number>();
  private epoch = 0;
  private socket: WebSocket | null = null;
  private retryTimer: NodeJS.Timeout | null = null;
  private retryMs = RECONNECT_MIN_MS;
  private subscribed = false;
  private stopped = false;

  constructor(private readonly options: FeedOptions) {}

  get ready(): boolean {
    return this.subscribed;
  }

  start(): void {
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.socket?.terminate();
    this.socket = null;
    this.subscribed = false;
    this.entries.clear();
  }

  /** A fresh cached verdict, or undefined when the caller must ask Core. */
  lookup(principal: string, purposeId: string): ConsentVerdict | undefined {
    if (!this.subscribed) return undefined;
    const e = this.entries.get(keyOf(principal, purposeId));
    if (!e || Date.now() - e.checkedAt > this.options.ttlMs) return undefined;
    if (e.valid && e.expiresAt !== null && Date.now() / 1000 >= e.expiresAt) {
      return { valid: false, reason: "CONSENT_EXPIRED", expiresAt: e.expiresAt };
    }
    return { valid: e.valid, reason: e.reason, expiresAt: e.expiresAt };
  }

  /** Call before asking Core; hand the token back to `store`. */
  begin(principal: string, purposeId: string): string {
    return `${this.epoch}:${this.versions.get(keyOf(principal, purposeId)) ?? 0}`;
  }

  /** Remembers Core's answer unless an event or a reconnect has overtaken it. */
  store(principal: string, purposeId: string, verdict: ConsentVerdict, token: string): void {
    if (!this.subscribed || token !== this.begin(principal, purposeId)) return;
    this.put(keyOf(principal, purposeId), verdict);
  }

  private put(key: string, verdict: ConsentVerdict): void {
    if (this.entries.size >= MAX_ENTRIES) this.entries.clear();
    this.entries.set(key, { ...verdict, checkedAt: Date.now() });
  }

  private connect(): void {
    if (this.stopped) return;
    const url = new URL("/ws", this.options.coreUrl);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(url);
    this.socket = socket;

    socket.on("open", () => {
      socket.send(JSON.stringify({ sub: [`fiduciary:${this.options.fiduciary.toLowerCase()}`] }));
    });
    socket.on("message", (raw) => this.onMessage(raw.toString()));
    socket.on("error", () => {
      // 'close' follows and handles the retry
    });
    socket.on("close", () => {
      if (this.socket !== socket) return;
      if (this.subscribed) this.options.log("[sammati] lost the consent feed; checking Core on every request until it is back");
      this.subscribed = false;
      this.entries.clear();
      this.socket = null;
      if (this.stopped) return;
      this.retryTimer = setTimeout(() => this.connect(), this.retryMs);
      this.retryTimer.unref();
      this.retryMs = Math.min(this.retryMs * 2, RECONNECT_MAX_MS);
    });
  }

  private onMessage(raw: string): void {
    // Only the fields we read, and loosely typed: this is whatever Core (or a proxy) sent.
    let msg: { event?: string } & Partial<Omit<ConsentUpdatedEvent, "event">>;
    try {
      msg = JSON.parse(raw) as typeof msg;
    } catch {
      return;
    }
    if (msg.event === "subscribed") {
      // Everything fetched before the subscription was live could have missed an event: drop it.
      this.epoch++;
      this.entries.clear();
      this.subscribed = true;
      this.retryMs = RECONNECT_MIN_MS;
      return;
    }
    if (msg.event !== "consent.updated" || !msg.principal || !msg.purposeId || msg.fiduciary?.toLowerCase() !== this.options.fiduciary.toLowerCase()) {
      return;
    }
    const key = keyOf(msg.principal, msg.purposeId);
    this.versions.set(key, (this.versions.get(key) ?? 0) + 1);
    const expiresAt = msg.expiresAt ?? null;
    if (msg.status === "Active") {
      this.put(key, { valid: expiresAt === null || Date.now() / 1000 < expiresAt, reason: expiresAt !== null && Date.now() / 1000 >= expiresAt ? "CONSENT_EXPIRED" : undefined, expiresAt });
    } else {
      this.put(key, { valid: false, reason: "CONSENT_WITHDRAWN", expiresAt });
    }
  }
}
