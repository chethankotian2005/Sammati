// Renewal requests (N-04, trd.md §6.12): a request for one purpose that is already, or was, consented to.
//
// It is an ordinary request (`requests` + `request_targets`, trd.md §6.11) with a kind:
//   renewal       a company asked the customer to renew
//   self_renewal  the customer pressed Renew on a reminder; internal, never listed to a company or in the inbox
// so the notice, the EIP-712 grant, the block list and the Sent / Seen / Granted lifecycle are all the existing ones.
import type { ExpiringRow, Hex, TargetedRequestResponse, TargetedStatus } from "@sammati/shared";
import { noticeHash } from "@sammati/shared";
import type { Config } from "../config";
import { HttpError } from "../errors";
import { noticeInput } from "../notice";
import { now } from "../clock";
import type { Db } from "./db";
import type { Notifications } from "./notifications";
import { NOTICE_VERSION, addr, type FiduciaryRow, type Repo } from "./repo";
import { cleanMessage, type TargetedRequests } from "./targeted";

const lc = (s: string): string => s.toLowerCase();
/** How long a renewal request stays open. Long, because the customer may take their time; the grant is still theirs to sign. */
const RENEWAL_TTL_SECONDS = 30 * 86_400;

type Row = Record<string, unknown>;

export class Renewals {
  constructor(
    private readonly db: Db,
    private readonly repo: Repo,
    private readonly targeted: TargetedRequests,
    private readonly notifications: Notifications,
    private readonly publishRequested: TargetedRequests["publishRequested"],
    private readonly config: Pick<Config, "maxOpenRequestsPerUser" | "expiringWindowSeconds">,
    private readonly clock: () => number = now,
  ) {}

  /** The customer's own consent for that purpose must exist (a company can only ask its own customers). */
  private consentOf(principal: Hex, f: FiduciaryRow, purposeCode: string) {
    const purpose = this.repo.purpose(f, purposeCode);
    const consent = this.repo.cachedConsent(addr(principal), addr(f.address), purpose.id);
    if (!consent) throw new HttpError(404, "CONSENT_NOT_FOUND", "No consent for that purpose");
    return { purpose, consent };
  }

  private openRenewal(principal: Hex, f: FiduciaryRow, purposeId: Hex): Row | undefined {
    return this.db
      .prepare(
        `SELECT t.* FROM request_targets t JOIN requests r ON r.id = t.request_id
         WHERE t.principal = ? AND t.fiduciary = ? AND t.kind IN ('renewal','self_renewal') AND t.status IN ('sent','seen')
           AND t.expires_at > ? AND r.purposes = ?
         ORDER BY t.kind = 'renewal' DESC, t.created_at DESC LIMIT 1`,
      )
      .get(lc(principal), lc(f.address), this.clock(), JSON.stringify([purposeId])) as Row | undefined;
  }

  private create(f: FiduciaryRow, principal: Hex | null, purposeId: Hex, alias: string, kind: "renewal" | "self_renewal", message: string | null): string {
    const purpose = this.repo.purposesOf(f.address).find((p) => p.id === purposeId)!;
    const hash = noticeHash(noticeInput(f.address, [purpose], NOTICE_VERSION));
    const created = this.repo.createRequest(f, [purposeId], alias, hash);
    this.db
      .prepare(
        "INSERT INTO request_targets (request_id, fiduciary, principal, message, status, created_at, expires_at, kind) VALUES (?, ?, ?, ?, 'sent', ?, ?, ?)",
      )
      .run(created.id, lc(f.address), principal ? lc(principal) : null, message, this.clock(), this.clock() + RENEWAL_TTL_SECONDS, kind);
    return created.id;
  }

  // ------------------------------------------------------------ the customer pressed Renew

  /** The open renewal request for this consent, made if there is none. The wallet then opens its notice (W3). */
  forCustomer(principal: Hex, fiduciaryAddress: Hex, purposeCode: string): { requestId: string } {
    const f = this.repo.fiduciary(fiduciaryAddress);
    const { purpose } = this.consentOf(principal, f, purposeCode);
    const open = this.openRenewal(principal, f, purpose.id);
    if (open) return { requestId: open.request_id as string };
    const alias = this.repo.aliasOfConsent(principal, f.address, purpose.id) ?? "Renewal";
    return { requestId: this.create(f, principal, purpose.id, alias, "self_renewal", null) };
  }

  // ------------------------------------------------------------ a company asks

  /**
   * Same rules as a targeted request: the answer never depends on whether the customer blocked the company or is at the
   * open-request cap. Only a purpose the company has no consent for at all is refused, since that says nothing about a
   * customer the company does not already know.
   */
  ask(f: FiduciaryRow, principal: Hex, purposeCode: string, messageRaw: unknown): TargetedRequestResponse {
    const message = cleanMessage(messageRaw);
    const { purpose, consent } = this.consentOf(principal, f, purposeCode);
    this.targeted.checkRate(f);

    const open = this.openRenewal(principal, f, purpose.id);
    if (open && open.kind === "renewal") {
      return { requestId: open.request_id as string, status: "sent", expiresAt: open.expires_at as number };
    }

    const blocked = this.targeted.isBlocked(principal, f.address);
    const cap = (
      this.db
        .prepare("SELECT COUNT(*) AS n FROM request_targets WHERE principal = ? AND fiduciary = ? AND kind <> 'self_renewal' AND status IN ('sent','seen') AND expires_at > ?")
        .get(lc(principal), lc(f.address), this.clock()) as { n: number }
    ).n;
    const deliver = !blocked && cap < this.config.maxOpenRequestsPerUser;

    let requestId: string;
    let expiresAt: number;
    if (open && deliver) {
      // The customer already pressed Renew: the company's ask is the same request, so its status follows the customer's own action.
      requestId = open.request_id as string;
      expiresAt = open.expires_at as number;
      this.db.prepare("UPDATE request_targets SET kind = 'renewal', message = ? WHERE request_id = ?").run(message, requestId);
    } else {
      const alias = this.repo.aliasOfConsent(principal, f.address, purpose.id) ?? "Renewal";
      requestId = this.create(f, deliver ? principal : null, purpose.id, alias, "renewal", message);
      expiresAt = this.clock() + RENEWAL_TTL_SECONDS;
    }

    if (deliver) {
      this.notifications.raise({
        type: "consent.renewal_requested",
        key: `renewal:${requestId}`,
        principal,
        fiduciary: f.address,
        purposeId: purpose.id,
        payload: { expiresAt: consent.expiresAt, message },
      });
      this.publishRequested({ requestId, principal, f, purposeCodes: [purpose.code], message, expiresAt });
    }
    return { requestId, status: "sent", expiresAt };
  }

  // ------------------------------------------------------------ the company's table

  /** Consents expiring soon, or that expired recently, with the status of any renewal the company asked for. */
  expiring(f: FiduciaryRow): ExpiringRow[] {
    const t = this.clock();
    const w = this.config.expiringWindowSeconds;
    const rows = this.db
      .prepare("SELECT * FROM consents_cache WHERE fiduciary = ? AND status = 'Active' AND expires_at BETWEEN ? AND ? ORDER BY expires_at")
      .all(f.address, t - w, t + w) as Row[];
    return rows.map((r) => {
      const principal = r.principal as Hex;
      const purposeId = r.purpose_id as Hex;
      const grantedAt = (r.granted_at as number | null) ?? 0;
      // This cycle's request: asked since the consent was granted, or the one that produced the grant.
      const request = this.db
        .prepare(
          `SELECT t.* FROM request_targets t JOIN requests q ON q.id = t.request_id
           WHERE t.principal = ? AND t.fiduciary = ? AND t.kind = 'renewal' AND q.purposes = ?
             AND (t.created_at >= ? OR (t.status = 'granted' AND t.decided_at >= ?))
           ORDER BY t.created_at DESC, t.rowid DESC LIMIT 1`,
        )
        .get(lc(principal), lc(f.address), JSON.stringify([purposeId]), grantedAt, grantedAt - 60) as Row | undefined;
      return {
        principal,
        customerAlias: this.repo.aliasOfConsent(principal, f.address, purposeId),
        purposeCode: this.repo.purposeById(purposeId)?.code ?? "",
        expiresAt: r.expires_at as number,
        state: (r.expires_at as number) <= t ? "expired" : "expiring",
        renewal: request
          ? { requestId: request.request_id as string, status: this.statusOf(request), requestedAt: request.created_at as number }
          : null,
      } satisfies ExpiringRow;
    });
  }

  private statusOf(r: Row): TargetedStatus {
    const s = r.status as TargetedStatus;
    return (s === "sent" || s === "seen") && (r.expires_at as number) <= this.clock() ? "expired" : s;
  }
}
