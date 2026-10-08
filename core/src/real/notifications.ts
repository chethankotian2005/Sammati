// The customer's notification centre (trd.md §6.12): what the expiry scheduler, a company's renewal request, the
// Processor's erasure and a processor's acknowledgement tell the wallet. A notification is data, not prose; the wallet
// writes the sentence in the customer's language, and nothing here is personal data.
import { randomUUID } from "node:crypto";
import type { Hex, NotificationAction, NotificationItem, NotificationPatchBody, NotificationType, NotificationsResponse, VaultEvent, WsEvent } from "@sammati/shared";
import type { Config } from "../config";
import { HttpError, badRequest } from "../errors";
import { now } from "../clock";
import type { Db } from "./db";
import type { Repo } from "./repo";

const lc = (s: string): string => s.toLowerCase();
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

type Row = Record<string, unknown>;

export interface Raise {
  type: NotificationType;
  key: string;
  principal: Hex;
  fiduciary: Hex;
  purposeId: Hex | null;
  payload: NotificationItem["payload"];
}

export class Notifications {
  constructor(
    private readonly db: Db,
    private readonly repo: Repo,
    private readonly publish: (event: WsEvent) => void,
    private readonly config: Pick<Config, "expiryThresholdsSeconds">,
    private readonly clock: () => number = now,
  ) {}

  /**
   * Records a notification and pushes it to the customer's socket, once. The unique key is the whole "at most once"
   * rule: a restarted scheduler, a replayed event or a second tick find the row and do nothing.
   */
  raise(n: Raise): NotificationItem | null {
    const id = `ntf_${randomUUID().slice(0, 8)}`;
    const createdAt = this.clock();
    const inserted = this.db
      .prepare(
        `INSERT OR IGNORE INTO notifications (id, dedupe_key, principal, type, fiduciary, purpose_id, payload, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, n.key, lc(n.principal), n.type, lc(n.fiduciary), n.purposeId, JSON.stringify(n.payload), createdAt);
    if (inserted.changes === 0) return null;
    const item = this.item(this.db.prepare("SELECT * FROM notifications WHERE id = ?").get(id) as Row);
    this.publish({ event: n.type, principal: lc(n.principal) as Hex, notification: item, at: createdAt });
    return item;
  }

  private item(r: Row): NotificationItem {
    const f = this.repo.fiduciary(r.fiduciary as string);
    const purposeId = (r.purpose_id as string | null) ?? null;
    return {
      id: r.id as string,
      key: r.dedupe_key as string,
      type: r.type as NotificationType,
      fiduciary: { address: f.address, name: f.name, color: f.color },
      purposeId: purposeId as Hex | null,
      purposeCode: purposeId ? (this.repo.purposeById(purposeId)?.code ?? null) : null,
      payload: JSON.parse(r.payload as string) as NotificationItem["payload"],
      createdAt: r.created_at as number,
      readAt: (r.read_at as number | null) ?? null,
      actionTaken: (r.action_taken as NotificationAction | null) ?? null,
    };
  }

  // ------------------------------------------------------------ reading and answering

  list(principal: Hex, limitRaw: unknown): NotificationsResponse {
    const limit = limitRaw === undefined ? DEFAULT_LIMIT : Math.min(MAX_LIMIT, Math.max(1, Math.trunc(Number(limitRaw)) || DEFAULT_LIMIT));
    const rows = this.db
      .prepare("SELECT * FROM notifications WHERE principal = ? ORDER BY created_at DESC, rowid DESC LIMIT ?")
      .all(lc(principal), limit) as Row[];
    return { notifications: rows.map((r) => this.item(r)), unread: this.unread(principal), config: this.settings() };
  }

  unread(principal: Hex): number {
    return (this.db.prepare("SELECT COUNT(*) AS n FROM notifications WHERE principal = ? AND read_at IS NULL").get(lc(principal)) as { n: number }).n;
  }

  /** What the wallet needs to schedule its own reminders (trd.md §6.12). */
  settings(): NotificationsResponse["config"] {
    return { thresholdsSeconds: this.config.expiryThresholdsSeconds };
  }

  markAllRead(principal: Hex): number {
    this.db.prepare("UPDATE notifications SET read_at = ? WHERE principal = ? AND read_at IS NULL").run(this.clock(), lc(principal));
    return this.unread(principal);
  }

  /** Marks one read and/or records the customer's choice. It changes no consent: "Let expire" only remembers the answer. */
  patch(principal: Hex, id: string, body: NotificationPatchBody): NotificationItem {
    const row = this.db.prepare("SELECT * FROM notifications WHERE id = ? AND principal = ?").get(id, lc(principal)) as Row | undefined;
    if (!row) throw new HttpError(404, "NOTIFICATION_NOT_FOUND", `Unknown notification ${id}`);
    if (body.action !== undefined && body.action !== "let_expire" && body.action !== "viewed_proof") {
      throw badRequest('"action" must be "let_expire" or "viewed_proof"');
    }
    if (body.read === undefined && body.action === undefined) throw badRequest('Send "read" or "action"');
    const at = this.clock();
    // Opening or acting on something is reading it. A consent that has since been renewed keeps "renewed".
    this.db.prepare("UPDATE notifications SET read_at = COALESCE(read_at, ?) WHERE id = ?").run(at, id);
    if (body.action && row.action_taken !== "renewed") this.db.prepare("UPDATE notifications SET action_taken = ? WHERE id = ?").run(body.action, id);
    return this.item(this.db.prepare("SELECT * FROM notifications WHERE id = ?").get(id) as Row);
  }

  /** A grant arrived for this consent: its reminders and requests are answered. */
  markRenewed(principal: Hex, fiduciary: Hex, purposeId: Hex): void {
    this.db
      .prepare(
        `UPDATE notifications SET action_taken = 'renewed', read_at = COALESCE(read_at, ?)
         WHERE principal = ? AND fiduciary = ? AND purpose_id = ? AND type IN ('consent.expiring','consent.expired','consent.renewal_requested')
           AND (action_taken IS NULL OR action_taken <> 'renewed')`,
      )
      .run(this.clock(), lc(principal), lc(fiduciary), lc(purposeId));
  }

  // ------------------------------------------------------------ events from elsewhere

  /** The Processor erased something after a withdrawal or expiry (a superseded copy or a refusal is not news). */
  onVaultEvent(e: VaultEvent): void {
    if (e.event !== "vault.erased" || (e.cause !== "withdrawn" && e.cause !== "expired")) return;
    const f = this.repo.fiduciaries().find((x) => lc(x.address) === lc(e.fiduciary));
    if (!f) return;
    const purpose = this.repo.purposesOf(f.address).find((p) => p.code === e.purposeCode);
    this.raise({
      type: "data.erased",
      key: `erased:${e.handle}:${e.cause}`,
      principal: e.principal,
      fiduciary: f.address,
      purposeId: purpose?.id ?? null,
      payload: { cause: e.cause },
    });
  }

  onAcknowledged(a: { principal: Hex; purposeId: Hex; processor: Hex; txHash: string }): void {
    const purpose = this.repo.purposeById(a.purposeId);
    if (!purpose) return;
    this.raise({
      type: "cascade.acknowledged",
      key: `ack:${lc(a.principal)}:${lc(a.purposeId)}:${lc(a.processor)}:${a.txHash}`,
      principal: a.principal,
      fiduciary: purpose.fiduciary,
      purposeId: a.purposeId,
      payload: { processor: a.processor, processorName: this.repo.processorName(a.processor) },
    });
  }
}
