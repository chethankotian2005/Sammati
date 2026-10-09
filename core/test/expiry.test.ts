// Expiry, renewal and notifications (N-03, N-04, N-05; trd.md §6.12): against the real Core with a real chain.
// The scheduler is given a clock the test moves, so "3 days later" costs nothing; consents are real grants.
import type { AddressInfo } from "node:net";
import { createServer, type Server } from "node:http";
import { Wallet } from "ethers";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { GRANT_CONSENT_TYPE, WITHDRAW_CONSENT_TYPE, purposeIdOf, type ExpiringResponse, type InboxResponse, type NotificationsResponse, type RequestNotice, type TargetedRequestResponse, type TargetedRequestsResponse, type WsEvent } from "@sammati/shared";
import { createRealApp } from "../src/app";
import { readConfig, type Config } from "../src/config";
import type { RealCore } from "../src/real/core";
import { ExpiryScheduler } from "../src/real/expiry";
import { topicsFor } from "../src/ws";
import { createTestCore, realConfig, startTestChain, type TestChain } from "./harness";

import { TEST_COMPANIES } from "@sammati/test-fixtures";
const QL = TEST_COMPANIES[0]!.address;
const unix = () => Math.floor(Date.now() / 1000);
const DAY = 86_400;
const KEY = "test-processor-events";

let chain: TestChain;
let core: RealCore;
let server: Server;
let base: string;
let config: Config;
const published: WsEvent[] = [];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function api<T = any>(method: string, path: string, body?: unknown, headers: Record<string, string> = {}, root = base): Promise<{ status: number; json: T }> {
  const res = await fetch(root + path, {
    method,
    headers: { ...(body ? { "content-type": "application/json" } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, json: (text ? JSON.parse(text) : null) as T };
}

beforeAll(async () => {
  chain = await startTestChain();
  config = realConfig(chain, { processorEventKey: KEY });
  core = await createTestCore(config, (e) => void published.push(e), () => {});
  server = createServer(createRealApp(core));
  await new Promise<void>((r) => server.listen(0, r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  core?.stop();
  await new Promise((r) => server?.close(r));
  await chain?.stop();
});
beforeEach(() => {
  published.length = 0;
  (core.targeted as unknown as { sent: Map<string, number[]> }).sent.clear();
});

/** A scheduler on a clock the test moves; `at(+3 * DAY)` is "three days from now". */
function schedulerAt(offsetSeconds: number): ExpiryScheduler {
  return new ExpiryScheduler(core.db, core.notifications, config, () => unix() + offsetSeconds);
}

/** Grants a consent for real, as the wallet would, from a fresh customer (or `who`). */
async function grant(purposeCode: string, expiresInSeconds: number, who = Wallet.createRandom(), fid = QL, requestId?: string) {
  const id = requestId ?? (await api("POST", `/v1/fiduciaries/${fid}/requests`, { purposes: [purposeCode], customerAlias: "Customer #4821" })).json.requestId;
  const notice = (await api<RequestNotice>("GET", `/v1/requests/${id}?principal=${who.address}`)).json;
  const message = { principal: who.address, fiduciary: fid, purposeId: purposeIdOf(fid, purposeCode), expiresAt: unix() + expiresInSeconds, noticeHash: notice.noticeHash, nonce: notice.nonce, deadline: unix() + 3600 };
  const signature = await who.signTypedData(notice.domain, { GrantConsent: [...GRANT_CONSENT_TYPE] }, message);
  const res = await api("POST", "/v1/consents/grant", { request: message, signature });
  expect(res.status).toBe(200);
  return { who, message, notice };
}

const list = async (who: { address: string }) => (await api<NotificationsResponse>("GET", `/v1/principals/${who.address}/notifications`)).json;
const typesOf = async (who: { address: string }) => (await list(who)).notifications.map((n) => n.type).reverse();
const pushedTo = (who: { address: string }, type: string) =>
  published.filter((e) => e.event === type && "principal" in e && e.principal.toLowerCase() === who.address.toLowerCase());

describe("the expiry scheduler (N-03)", () => {
  it("fires each threshold once, then expired once, and never a second time", async () => {
    const { who } = await grant("credit_check", 4 * DAY);

    expect(schedulerAt(0).tick()).toBe(0); // 4 days left: beyond the first threshold
    expect(schedulerAt(1.5 * DAY).tick()).toBe(1); // 2.5 days left: the 3-day threshold
    expect(schedulerAt(1.5 * DAY).tick()).toBe(0); // the same tick again changes nothing
    expect(schedulerAt(2 * DAY).tick()).toBe(0); // still between the two thresholds
    expect(schedulerAt(3.2 * DAY).tick()).toBe(1); // 0.8 day left: the 1-day threshold
    expect(schedulerAt(4.1 * DAY).tick()).toBe(1); // past expiry
    expect(schedulerAt(4.2 * DAY).tick()).toBe(0);

    const items = (await list(who)).notifications.reverse();
    expect(items.map((n) => [n.type, n.payload.thresholdSeconds ?? null])).toEqual([
      ["consent.expiring", 3 * DAY],
      ["consent.expiring", DAY],
      ["consent.expired", null],
    ]);
    expect(items[0]).toMatchObject({ purposeCode: "credit_check", fiduciary: { name: "QuickLoan" }, readAt: null, actionTaken: null });
    expect(items[0]!.payload.expiresAt).toBeGreaterThan(unix() + 3 * DAY);
  });

  it("a consent first seen inside the last day gets the 1-day notice only, with the real time left in its data", async () => {
    const { who } = await grant("marketing", 12 * 3600);
    expect(schedulerAt(0).tick()).toBe(1);
    const [only] = (await list(who)).notifications;
    expect(only).toMatchObject({ type: "consent.expiring", payload: { thresholdSeconds: DAY } });
    expect(only!.payload.expiresAt! - unix()).toBeLessThanOrEqual(12 * 3600);
  });

  it("pushes each one to that customer's topic only, as the event named by its type", async () => {
    const { who } = await grant("credit_check", 2 * DAY);
    published.length = 0;
    schedulerAt(0).tick();
    const [event] = pushedTo(who, "consent.expiring");
    expect(event).toMatchObject({ event: "consent.expiring", principal: who.address.toLowerCase(), notification: { type: "consent.expiring", payload: { thresholdSeconds: 3 * DAY } } });
    expect(topicsFor(event!)).toEqual([`principal:${who.address.toLowerCase()}`]);
  });

  it("does not announce a consent that expired long ago, or one that was withdrawn", async () => {
    const gone = await grant("credit_check", 4 * DAY);
    expect(schedulerAt(30 * DAY).tick()).toBeGreaterThanOrEqual(0); // expired weeks ago: outside the window
    expect((await list(gone.who)).notifications.filter((n) => n.type === "consent.expired")).toHaveLength(0);

    const withdrawn = await grant("marketing", 2 * DAY);
    const w = { principal: withdrawn.who.address, fiduciary: QL, purposeId: purposeIdOf(QL, "marketing"), nonce: String(Number(withdrawn.notice.nonce) + 1), deadline: unix() + 3600 };
    const sig = await withdrawn.who.signTypedData(withdrawn.notice.domain, { WithdrawConsent: [...WITHDRAW_CONSENT_TYPE] }, w);
    expect((await api("POST", "/v1/consents/withdraw", { request: w, signature: sig })).status).toBe(200);
    schedulerAt(0).tick();
    expect((await list(withdrawn.who)).notifications.filter((n) => n.type.startsWith("consent.exp"))).toHaveLength(0);
  });

  it("a renewed consent starts afresh: its reminders fire again for the new expiry", async () => {
    const first = await grant("credit_check", 2 * DAY);
    schedulerAt(0).tick();
    schedulerAt(2.5 * DAY).tick(); // expired
    expect(await typesOf(first.who)).toEqual(["consent.expiring", "consent.expired"]);

    await grant("credit_check", 3 * DAY, first.who); // renewed, with a later expiry than before
    const afterRenewal = await list(first.who);
    expect(afterRenewal.notifications.every((n) => n.actionTaken === "renewed")).toBe(true); // the old reminders are answered
    expect(afterRenewal.unread).toBe(0);

    schedulerAt(0).tick();
    expect(await typesOf(first.who)).toEqual(["consent.expiring", "consent.expired", "consent.expiring"]);
  });
});

describe("the notification centre API (N-05)", () => {
  async function withThree() {
    const a = await grant("credit_check", 2 * DAY);
    const b = await grant("marketing", 2 * DAY, a.who);
    schedulerAt(0).tick();
    return { who: a.who, b };
  }

  it("lists newest first with the unread count and what the wallet needs to schedule its own reminders", async () => {
    const { who } = await withThree();
    const res = await list(who);
    expect(res.notifications).toHaveLength(2);
    expect(res.unread).toBe(2);
    expect(res.config).toEqual({ thresholdsSeconds: [3 * DAY, DAY], fastExpiry: false });
    expect(res.notifications[0]!.createdAt).toBeGreaterThanOrEqual(res.notifications[1]!.createdAt);
    expect((await api<NotificationsResponse>("GET", `/v1/principals/${who.address}/notifications?limit=1`)).json.notifications).toHaveLength(1);
    expect((await list(Wallet.createRandom())).notifications).toEqual([]);
  });

  it("marks one read and records the customer's choice; Let expire changes no consent", async () => {
    const { who } = await withThree();
    const [first] = (await list(who)).notifications;
    const read = await api("POST", `/v1/principals/${who.address}/notifications/${first!.id}`, { read: true });
    expect([read.status, read.json.readAt]).toEqual([200, expect.any(Number)]);
    const left = await api("POST", `/v1/principals/${who.address}/notifications/${first!.id}`, { action: "let_expire" });
    expect(left.json).toMatchObject({ id: first!.id, actionTaken: "let_expire" });
    expect((await list(who)).unread).toBe(1);
    const consents = (await api("GET", `/v1/principals/${who.address}/consents`)).json.fiduciaries.flatMap((f: { consents: Array<{ status: string }> }) => f.consents);
    expect(consents.every((c: { status: string }) => c.status === "Active")).toBe(true);
  });

  it("refuses another customer's notification, an unknown action and an empty body", async () => {
    const { who } = await withThree();
    const [first] = (await list(who)).notifications;
    const stranger = Wallet.createRandom();
    expect((await api("POST", `/v1/principals/${stranger.address}/notifications/${first!.id}`, { read: true })).json.error.code).toBe("NOTIFICATION_NOT_FOUND");
    expect((await api("POST", `/v1/principals/${who.address}/notifications/${first!.id}`, { action: "renewed" })).status).toBe(400);
    expect((await api("POST", `/v1/principals/${who.address}/notifications/${first!.id}`, { nothing: 1 })).status).toBe(400);
  });

  it("marks everything read in one call", async () => {
    const { who } = await withThree();
    expect((await api("POST", `/v1/principals/${who.address}/notifications/read`, {})).json).toEqual({ ok: true, unread: 0 });
    expect((await list(who)).unread).toBe(0);
  });

});

describe("renewal (N-04)", () => {
  it("Renew on a reminder opens one request for that purpose, reuses it, and hides it from the inbox and the company's list", async () => {
    const { who } = await grant("credit_check", 2 * DAY);
    const open = await api("POST", `/v1/principals/${who.address}/renewals`, { fiduciary: QL, purposeCode: "credit_check" });
    expect(open.status).toBe(200);
    expect(open.json.requestId).toMatch(/^req_[0-9a-f]{8}$/);
    expect((await api("POST", `/v1/principals/${who.address}/renewals`, { fiduciary: QL, purposeCode: "credit_check" })).json.requestId).toBe(open.json.requestId);

    expect((await api<InboxResponse>("GET", `/v1/principals/${who.address}/requests`)).json.requests).toEqual([]);
    expect((await api<TargetedRequestsResponse>("GET", `/v1/fiduciaries/${QL}/requests/targeted`)).json.requests.map((r) => r.requestId)).not.toContain(open.json.requestId);

    // the notice is the ordinary one, for that one purpose, and only for this customer
    const notice = (await api<RequestNotice>("GET", `/v1/requests/${open.json.requestId}?principal=${who.address}`)).json;
    expect(notice.purposes.map((p) => p.code)).toEqual(["credit_check"]);
    expect((await api("GET", `/v1/requests/${open.json.requestId}?principal=${Wallet.createRandom().address}`)).status).toBe(404);
    expect((await api("GET", `/v1/requests/${open.json.requestId}`)).status).toBe(404);
  });

  it("is refused for a purpose the customer never consented to", async () => {
    const { who } = await grant("credit_check", 2 * DAY);
    const res = await api("POST", `/v1/principals/${who.address}/renewals`, { fiduciary: QL, purposeCode: "bureau_share" });
    expect([res.status, res.json.error.code]).toEqual([404, "CONSENT_NOT_FOUND"]);
  });

  it("granting through the renewal notice renews the consent and answers the reminder", async () => {
    const { who } = await grant("credit_check", 2 * DAY);
    schedulerAt(2.5 * DAY).tick();
    const { requestId } = (await api("POST", `/v1/principals/${who.address}/renewals`, { fiduciary: QL, purposeCode: "credit_check" })).json;
    await grant("credit_check", 30 * DAY, who, QL, requestId);
    const items = (await list(who)).notifications;
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((n) => n.actionTaken === "renewed")).toBe(true);
    const row = (await api("GET", `/v1/principals/${who.address}/consents`)).json.fiduciaries[0].consents.find((c: { code: string }) => c.code === "credit_check");
    expect(row.expiresAt).toBeGreaterThan(unix() + 29 * DAY);
  });

  describe("a company asks", () => {
    const ask = (who: { address: string }, over: Record<string, unknown> = {}, fid = QL) =>
      api<TargetedRequestResponse>("POST", `/v1/fiduciaries/${fid}/renewals`, { principal: who.address, purposeCode: "credit_check", ...over });

    it("answers 201, raises consent.renewal_requested with the company's message, and puts the request in the inbox", async () => {
      const { who } = await grant("credit_check", 2 * DAY);
      published.length = 0;
      const res = await ask(who, { message: "  Please\nrenew  " });
      expect(res.status).toBe(201);
      expect(res.json).toEqual({ requestId: expect.stringMatching(/^req_/), status: "sent", expiresAt: expect.any(Number) });

      const [n] = (await list(who)).notifications;
      expect(n).toMatchObject({ type: "consent.renewal_requested", purposeCode: "credit_check", payload: { message: "Please renew" } });
      expect(pushedTo(who, "consent.renewal_requested")).toHaveLength(1);
      expect(pushedTo(who, "consent.requested")).toHaveLength(1); // the inbox refreshes
      const inbox = (await api<InboxResponse>("GET", `/v1/principals/${who.address}/requests`)).json.requests;
      expect(inbox.map((r) => [r.requestId, r.purposes.map((p) => p.code), r.message])).toEqual([[res.json.requestId, ["credit_check"], "Please renew"]]);
    });

    it("asking twice is the same request and one notification", async () => {
      const { who } = await grant("credit_check", 2 * DAY);
      const a = await ask(who);
      const b = await ask(who);
      expect(b.json.requestId).toBe(a.json.requestId);
      expect((await list(who)).notifications.filter((x) => x.type === "consent.renewal_requested")).toHaveLength(1);
    });

    it("promotes a request the customer opened by pressing Renew, so the company's status follows their action", async () => {
      const { who } = await grant("credit_check", 2 * DAY);
      const self = (await api("POST", `/v1/principals/${who.address}/renewals`, { fiduciary: QL, purposeCode: "credit_check" })).json.requestId;
      const asked = await ask(who);
      expect(asked.json.requestId).toBe(self);
      expect((await api<InboxResponse>("GET", `/v1/principals/${who.address}/requests`)).json.requests.map((r) => r.requestId)).toEqual([self]);
    });

    it("refuses a customer the company has no consent from, and a purpose it never had", async () => {
      const stranger = Wallet.createRandom();
      expect((await ask(stranger)).json).toMatchObject({ error: { code: "CONSENT_NOT_FOUND" } });
      const { who } = await grant("credit_check", 2 * DAY);
      expect((await ask(who, { purposeCode: "bureau_share" })).status).toBe(404);
      expect((await ask(who, { purposeCode: "nonsense" })).status).toBe(404);
      expect((await ask(who, { message: "x".repeat(141) })).status).toBe(400);
    });

    it("gives the same answer and pushes nothing when the customer blocked the company or is at the cap", async () => {
      const blocked = await grant("credit_check", 2 * DAY);
      const issuedAt = unix();
      const sig = await blocked.who.signMessage(`sammati-block:v1:block:${QL.toLowerCase()}:${blocked.who.address.toLowerCase()}:${issuedAt}`);
      expect((await api("POST", `/v1/principals/${blocked.who.address}/blocks`, { fiduciary: QL, action: "block", issuedAt, signature: sig })).status).toBe(200);
      published.length = 0;
      const res = await ask(blocked.who);
      expect([res.status, res.json.status]).toEqual([201, "sent"]);
      expect(Object.keys(res.json).sort()).toEqual(["expiresAt", "requestId", "status"]);
      expect(published.filter((e) => e.event === "consent.renewal_requested" || e.event === "consent.requested")).toEqual([]);
      expect((await list(blocked.who)).notifications).toEqual([]);
    });

    it("shares the company's rate limit with targeted requests", async () => {
      const { who } = await grant("credit_check", 2 * DAY);
      const limit = config.targetedRatePerMinute;
      for (let i = 0; i < limit; i++) expect((await ask(who, { purposeCode: "credit_check" })).status).toBe(201);
      const over = await api("POST", `/v1/fiduciaries/${QL}/renewals`, { principal: who.address, purposeCode: "credit_check" });
      expect([over.status, over.json.error.code]).toEqual([429, "RATE_LIMITED"]);
    });

    it("the console's Expiring table follows it: expiring, then the renewal Sent, Seen, Granted", async () => {
      const { who } = await grant("credit_check", 2 * DAY);
      const rowOf = async () => (await api<ExpiringResponse>("GET", `/v1/fiduciaries/${QL}/expiring`)).json.rows.find((r) => r.principal.toLowerCase() === who.address.toLowerCase());
      expect(await rowOf()).toMatchObject({ purposeCode: "credit_check", customerAlias: "Customer #4821", state: "expiring", renewal: null });

      const { requestId } = (await ask(who)).json;
      expect((await rowOf())!.renewal).toMatchObject({ requestId, status: "sent" });
      await api("GET", `/v1/requests/${requestId}?principal=${who.address}`); // the wallet opens it
      expect((await rowOf())!.renewal).toMatchObject({ requestId, status: "seen" });
      published.length = 0;
      await grant("credit_check", 2 * DAY, who, QL, requestId);
      expect((await rowOf())!.renewal).toMatchObject({ requestId, status: "granted" });
      expect(published.filter((e) => e.event === "request.updated")).toEqual([expect.objectContaining({ requestId, status: "granted" })]);
      // and nothing the company is told carries the customer's address except the table that already holds it
      expect(JSON.stringify(published.filter((e) => e.event === "request.updated"))).not.toContain(who.address.toLowerCase());
    });

    it("lists an expired consent too, until it falls out of the window", async () => {
      const { who } = await grant("credit_check", 2 * DAY);
      const pastExpiry = async () => {
        core.db.prepare("UPDATE consents_cache SET expires_at = ? WHERE principal = ?").run(unix() - 60, who.address);
        return (await api<ExpiringResponse>("GET", `/v1/fiduciaries/${QL}/expiring`)).json.rows.find((r) => r.principal.toLowerCase() === who.address.toLowerCase());
      };
      expect(await pastExpiry()).toMatchObject({ state: "expired" });
      core.db.prepare("UPDATE consents_cache SET expires_at = ? WHERE principal = ?").run(unix() - config.expiringWindowSeconds - 60, who.address);
      expect((await api<ExpiringResponse>("GET", `/v1/fiduciaries/${QL}/expiring`)).json.rows.some((r) => r.principal.toLowerCase() === who.address.toLowerCase())).toBe(false);
    });
  });
});

describe("what the Processor and the processors report", () => {
  const post = (body: unknown, key: string | null = KEY) => api("POST", "/v1/events/vault", body, key ? { "x-sammati-processor-key": key } : {});
  const erased = (who: { address: string }, cause: string, handle: string) => ({
    event: "vault.erased",
    principal: who.address.toLowerCase(),
    fiduciary: QL.toLowerCase(),
    purposeCode: "credit_check",
    handle,
    at: unix(),
    atMs: Date.now(),
    cause,
  });
  const hex = (n: number) => "0x" + n.toString(16).padStart(64, "0");

  it("turns an erasure after withdrawal or expiry into data.erased, once, and ignores the rest", async () => {
    const { who } = await grant("credit_check", 2 * DAY);
    published.length = 0;
    expect((await post(erased(who, "expired", hex(1)))).status).toBe(202);
    expect((await post(erased(who, "expired", hex(1)))).status).toBe(202); // a replay
    expect((await post(erased(who, "withdrawn", hex(2)))).status).toBe(202);
    expect((await post(erased(who, "superseded", hex(3)))).status).toBe(202);
    expect((await post(erased(who, "no_consent", hex(4)))).status).toBe(202);

    const items = (await list(who)).notifications.filter((n) => n.type === "data.erased").reverse();
    expect(items.map((n) => n.payload.cause)).toEqual(["expired", "withdrawn"]);
    expect(items[0]).toMatchObject({ purposeCode: "credit_check", fiduciary: { name: "QuickLoan" } });
    expect(pushedTo(who, "data.erased")).toHaveLength(2);
    expect(published.filter((e) => e.event === "vault.erased")).toHaveLength(5); // the Inspector still sees every one
  });

  it("an unauthorised event creates nothing", async () => {
    const { who } = await grant("credit_check", 2 * DAY);
    expect((await post(erased(who, "expired", hex(9)), null)).status).toBe(401);
    expect((await list(who)).notifications).toEqual([]);
  });

  it("turns a processor's on-chain acknowledgement into cascade.acknowledged", async () => {
    const { who, notice } = await grant("marketing", 2 * DAY);
    const w = { principal: who.address, fiduciary: QL, purposeId: purposeIdOf(QL, "marketing"), nonce: String(Number(notice.nonce) + 1), deadline: unix() + 3600 };
    const sig = await who.signTypedData(notice.domain, { WithdrawConsent: [...WITHDRAW_CONSENT_TYPE] }, w);
    expect((await api("POST", "/v1/consents/withdraw", { request: w, signature: sig })).status).toBe(200);

    const deadline = Date.now() + 8000;
    let acked = (await list(who)).notifications.filter((n) => n.type === "cascade.acknowledged");
    while (acked.length === 0 && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 100));
      acked = (await list(who)).notifications.filter((n) => n.type === "cascade.acknowledged");
    }
    expect(acked).toHaveLength(1);
    expect(acked[0]).toMatchObject({ purposeCode: "marketing", payload: { processorName: expect.any(String) } });
    expect(acked[0]!.payload.processorName).not.toBe("");
  });
});

describe("expiry settings (trd.md §6.12)", () => {
  it("an explicit setting wins, and the defaults are days", () => {
    expect(readConfig({ EXPIRY_THRESHOLDS_SECONDS: "5, 10", EXPIRY_TICK_MS: "500" })).toMatchObject({ expiryThresholdsSeconds: [10, 5], expiryTickMs: 500 });
    expect(readConfig({})).toMatchObject({ expiryTickMs: 30_000, expiryThresholdsSeconds: [3 * DAY, DAY], expiringWindowSeconds: 30 * DAY });
    expect(readConfig({ EXPIRY_THRESHOLDS_SECONDS: "soon" }).expiryThresholdsSeconds).toEqual([3 * DAY, DAY]); // unusable: the default
  });
});
