// Sammati IDs and targeted consent requests (N-01, N-02, W-14; trd.md §4.5, §6.11): against the real Core, with a
// real chain. The rule under test above all: what a company is told does not depend on who the customer is.
import type { AddressInfo } from "node:net";
import { createServer, type Server } from "node:http";
import { Wallet } from "ethers";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { GRANT_CONSENT_TYPE, purposeIdOf, type FiduciaryConsentsResponse, type InboxResponse, type RequestNotice, type TargetedRequestResponse, type TargetedRequestsResponse, type WsEvent } from "@sammati/shared";
import { createRealApp } from "../src/app";
import type { Config } from "../src/config";
import type { RealCore } from "../src/real/core";
import { createTestCore, realConfig, startTestChain, type TestChain } from "./harness";

import { TEST_COMPANIES } from "@sammati/test-fixtures";
const [QUICKLOAN, MEDICARE] = TEST_COMPANIES;
const QL = QUICKLOAN!.address;
const MC = MEDICARE!.address;
const unix = () => Math.floor(Date.now() / 1000);

let chain: TestChain;
let core: RealCore;
let server: Server;
let base: string;
let config: Config;
const published: WsEvent[] = [];

// Responses are asserted field by field, so they are read loosely.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function api<T = any>(method: string, path: string, body?: unknown, root = base): Promise<{ status: number; json: T; headers: Headers }> {
  const res = await fetch(root + path, { method, headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  return { status: res.status, json: (text ? JSON.parse(text) : null) as T, headers: res.headers };
}

beforeAll(async () => {
  chain = await startTestChain();
  config = realConfig(chain, { targetedRatePerMinute: 6, maxOpenRequestsPerUser: 3 });
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
  // each test starts with a company that has sent nothing this minute
  (core.targeted as unknown as { sent: Map<string, number[]> }).sent.clear();
});

let n = 0;
/** A fresh customer with a registered Sammati ID. */
async function customer(name = `user${++n}${Date.now() % 100000}`) {
  const wallet = Wallet.createRandom();
  const handle = `${name}@sammati`;
  const issuedAt = unix();
  const signature = await wallet.signMessage(`sammati-id:v1:${handle}:${wallet.address.toLowerCase()}:${issuedAt}`);
  const res = await api("POST", "/v1/identities", { handle, principal: wallet.address, issuedAt, signature });
  expect(res.status).toBe(201);
  return { wallet, handle, address: wallet.address };
}

const send = (handle: string, over: Record<string, unknown> = {}, fid = QL) =>
  api<TargetedRequestResponse>("POST", `/v1/fiduciaries/${fid}/requests/targeted`, { handle, purposes: ["credit_check"], ...over });
const pushesTo = (principal: string) => published.filter((e) => e.event === "consent.requested" && e.principal.toLowerCase() === principal.toLowerCase());
const statusOf = async (id: string, fid = QL) => (await api(`GET`, `/v1/fiduciaries/${fid}/requests/targeted/${id}`)).json.status;

describe("Sammati IDs (N-01)", () => {
  it("registers a handle the wallet signed for, once, and says it is the wallet's", async () => {
    const asha = await customer("asha" + Date.now());
    expect((await api("GET", `/v1/principals/${asha.address}/identity`)).json).toEqual({ handle: asha.handle });
    expect((await api("GET", `/v1/principals/${Wallet.createRandom().address}/identity`)).json).toEqual({ handle: null });

    // the same wallet asking for the same handle again is fine
    const issuedAt = unix();
    const signature = await asha.wallet.signMessage(`sammati-id:v1:${asha.handle}:${asha.address.toLowerCase()}:${issuedAt}`);
    expect((await api("POST", "/v1/identities", { handle: asha.handle, principal: asha.address, issuedAt, signature })).status).toBe(200);
  });

  it("refuses a handle another wallet holds, and a message the wallet did not sign", async () => {
    const asha = await customer();
    const thief = Wallet.createRandom();
    const issuedAt = unix();
    const sig = await thief.signMessage(`sammati-id:v1:${asha.handle}:${thief.address.toLowerCase()}:${issuedAt}`);
    const taken = await api("POST", "/v1/identities", { handle: asha.handle, principal: thief.address, issuedAt, signature: sig });
    expect([taken.status, taken.json.error.code]).toEqual([409, "HANDLE_TAKEN"]);

    // someone else's signature over my claim
    const mine = `claim${Date.now()}@sammati`;
    const forged = await thief.signMessage(`sammati-id:v1:${mine}:${asha.address.toLowerCase()}:${issuedAt}`);
    const bad = await api("POST", "/v1/identities", { handle: mine, principal: asha.address, issuedAt, signature: forged });
    expect([bad.status, bad.json.error.code]).toEqual([400, "BAD_SIGNATURE"]);
    expect((await api("GET", `/v1/principals/${asha.address}/identity`)).json.handle).toBe(asha.handle); // untouched
  });

  it("refuses a stale or future message, and a signature over different words", async () => {
    const w = Wallet.createRandom();
    const handle = `late${Date.now()}@sammati`;
    for (const issuedAt of [unix() - 3600, unix() + 3600]) {
      const signature = await w.signMessage(`sammati-id:v1:${handle}:${w.address.toLowerCase()}:${issuedAt}`);
      const res = await api("POST", "/v1/identities", { handle, principal: w.address, issuedAt, signature });
      expect([res.status, res.json.error.code]).toEqual([400, "STALE_SIGNATURE"]);
    }
    const issuedAt = unix();
    const other = await w.signMessage(`sammati-id:v1:somethingelse@sammati:${w.address.toLowerCase()}:${issuedAt}`);
    expect((await api("POST", "/v1/identities", { handle, principal: w.address, issuedAt, signature: other })).json.error.code).toBe("BAD_SIGNATURE");
    expect((await api("POST", "/v1/identities", { handle, principal: w.address, issuedAt, signature: "0x12" })).json.error.code).toBe("BAD_SIGNATURE");
  });

  it.each(["ab@sammati", "asha", "asha@example.com", "as ha@sammati", "ASHA!@sammati", `${"a".repeat(31)}@sammati`, "", 5])("refuses the malformed handle %j", async (handle) => {
    const w = Wallet.createRandom();
    const issuedAt = unix();
    const res = await api("POST", "/v1/identities", { handle, principal: w.address, issuedAt, signature: await w.signMessage("x") });
    expect([res.status, res.json.error.code]).toEqual([400, "BAD_HANDLE"]);
  });

  it("lower-cases the handle, and a wallet that registers a new one releases the old", async () => {
    const w = Wallet.createRandom();
    const a = `Mixed${Date.now()}@Sammati`;
    const issuedAt = unix();
    const sigA = await w.signMessage(`sammati-id:v1:${a.toLowerCase()}:${w.address.toLowerCase()}:${issuedAt}`);
    expect((await api("POST", "/v1/identities", { handle: a, principal: w.address, issuedAt, signature: sigA })).json.handle).toBe(a.toLowerCase());

    const b = `second${Date.now()}@sammati`;
    const sigB = await w.signMessage(`sammati-id:v1:${b}:${w.address.toLowerCase()}:${issuedAt}`);
    expect((await api("POST", "/v1/identities", { handle: b, principal: w.address, issuedAt, signature: sigB })).status).toBe(201);
    expect((await api("GET", `/v1/principals/${w.address}/identity`)).json.handle).toBe(b);
    // the old one is free for anyone
    const other = Wallet.createRandom();
    const sigO = await other.signMessage(`sammati-id:v1:${a.toLowerCase()}:${other.address.toLowerCase()}:${issuedAt}`);
    expect((await api("POST", "/v1/identities", { handle: a, principal: other.address, issuedAt, signature: sigO })).status).toBe(201);
  });
});

describe("sending a request (N-02)", () => {
  it("answers 201 with an opaque id, and pushes consent.requested to that wallet and nobody else", async () => {
    const asha = await customer();
    const res = await send(asha.handle, { message: "  Your loan\nform is ready  ", expiresInHours: 24 });
    expect(res.status).toBe(201);
    expect(res.json).toEqual({ requestId: expect.stringMatching(/^req_[0-9a-f]{8}$/), status: "sent", expiresAt: expect.any(Number) });
    expect(res.json.expiresAt - unix()).toBeGreaterThan(24 * 3600 - 5);

    const pushes = pushesTo(asha.address);
    expect(pushes).toHaveLength(1);
    expect(pushes[0]).toMatchObject({ requestId: res.json.requestId, fiduciary: QL, fiduciaryName: "QuickLoan", purposeCodes: ["credit_check"], message: "Your loan form is ready" });
    expect(published.filter((e) => e.event === "consent.requested")).toHaveLength(1);
  });

  it("gives exactly the same answer for a handle nobody has, and pushes nothing", async () => {
    const asha = await customer();
    const known = await send(asha.handle);
    const unknown = await send(`nobody${Date.now()}@sammati`);
    expect(unknown.status).toBe(known.status);
    expect(Object.keys(unknown.json).sort()).toEqual(Object.keys(known.json).sort());
    expect(unknown.json.status).toBe(known.json.status);
    expect(unknown.json.requestId).toMatch(/^req_[0-9a-f]{8}$/);
    expect(unknown.headers.get("content-type")).toBe(known.headers.get("content-type"));
    expect(published.filter((e) => e.event === "consent.requested")).toHaveLength(1); // only the known one
    // and both read the same until one of them expires
    expect(await statusOf(known.json.requestId)).toBe("sent");
    expect(await statusOf(unknown.json.requestId)).toBe("sent");
  });

  it("gives the same answer when the customer blocked the company, or is at the limit, and pushes nothing", async () => {
    const asha = await customer();
    const first = await send(asha.handle);
    const issuedAt = unix();
    const signature = await asha.wallet.signMessage(`sammati-block:v1:block:${QL.toLowerCase()}:${asha.address.toLowerCase()}:${issuedAt}`);
    expect((await api("POST", `/v1/principals/${asha.address}/blocks`, { fiduciary: QL, action: "block", issuedAt, signature })).json.blocked).toBe(true);
    published.length = 0;
    const blocked = await send(asha.handle);
    expect(blocked.status).toBe(first.status);
    expect(Object.keys(blocked.json).sort()).toEqual(Object.keys(first.json).sort());
    expect(pushesTo(asha.address)).toHaveLength(0);

    const busy = await customer();
    for (let i = 0; i < 3; i++) expect((await send(busy.handle)).status).toBe(201);
    published.length = 0;
    const capped = await send(busy.handle);
    expect([capped.status, capped.json.status]).toEqual([201, "sent"]);
    expect(pushesTo(busy.address)).toHaveLength(0);
    expect((await api<InboxResponse>("GET", `/v1/principals/${busy.address}/requests`)).json.requests).toHaveLength(3);
  });

  it("never puts a customer's address in anything a company can read", async () => {
    const asha = await customer();
    const sent = await send(asha.handle);
    const everything = JSON.stringify([
      sent.json,
      (await api("GET", `/v1/fiduciaries/${QL}/requests/targeted`)).json,
      (await api("GET", `/v1/fiduciaries/${QL}/requests/targeted/${sent.json.requestId}`)).json,
      published.filter((e) => e.event === "request.updated"),
    ]).toLowerCase();
    expect(everything).not.toContain(asha.address.toLowerCase());
    expect(everything).not.toContain(asha.address.slice(2).toLowerCase());
    // the company's list shows the text it typed
    const list = (await api<TargetedRequestsResponse>("GET", `/v1/fiduciaries/${QL}/requests/targeted`)).json.requests;
    expect(list.find((r) => r.requestId === sent.json.requestId)).toMatchObject({ handle: asha.handle, purposes: ["credit_check"], status: "sent" });
  });

  it("checks what is the company's own business: handle format, purposes, message, expiry", async () => {
    const asha = await customer();
    expect((await send("not-a-handle")).json).toMatchObject({ error: { code: "BAD_HANDLE" } });
    expect((await send(asha.handle, { purposes: [] })).status).toBe(400);
    expect((await send(asha.handle, { purposes: ["nope"] })).status).toBe(404);
    expect((await send(asha.handle, { message: "x".repeat(141) })).status).toBe(400);
    expect((await send(asha.handle, { message: 5 })).status).toBe(400);
    for (const hours of [0, 169, 1.5, "3"]) expect((await send(asha.handle, { expiresInHours: hours })).status).toBe(400);
    expect((await send(asha.handle, { expiresInHours: 1 })).status).toBe(201);
    expect((await send(asha.handle, { expiresInHours: 168 })).status).toBe(201);
    expect((await send(asha.handle, {}, "0x000000000000000000000000000000000000dEaD")).status).toBe(404);
  });

  it("limits a company's rate, whoever it writes to, and says when to try again", async () => {
    const asha = await customer();
    for (let i = 0; i < 6; i++) expect((await send(i % 2 ? asha.handle : `ghost${i}@sammati`)).status).toBe(201);
    const over = await send(`ghost-again@sammati`); // an unknown handle is counted too
    expect([over.status, over.json]).toEqual([429, expect.objectContaining({ error: expect.objectContaining({ code: "RATE_LIMITED" }) })]);
    expect(Number(over.headers.get("retry-after"))).toBeGreaterThan(0);
    // another company is not held back by this one
    expect((await send(asha.handle, { purposes: ["treatment"] }, MC)).status).toBe(201);
  });
});

describe("the customer's side (W-14)", () => {
  async function waitingRequest() {
    const asha = await customer();
    const sent = await send(asha.handle, { message: "Please look" });
    return { asha, id: sent.json.requestId };
  }

  it("lists what is open for this wallet only, with the company and the purposes in words", async () => {
    const { asha, id } = await waitingRequest();
    const mine = (await api<InboxResponse>("GET", `/v1/principals/${asha.address}/requests`)).json.requests;
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({
      requestId: id,
      status: "sent",
      message: "Please look",
      fiduciary: { address: QL, name: "QuickLoan" },
      purposes: [{ code: "credit_check", title: { en: "Credit check" } }],
    });
    expect((await api<InboxResponse>("GET", `/v1/principals/${Wallet.createRandom().address}/requests`)).json.requests).toEqual([]);
  });

  it("opening the notice makes it Seen for the company, once, and only for the addressed wallet", async () => {
    const { asha, id } = await waitingRequest();
    const stranger = Wallet.createRandom();
    for (const q of [`?principal=${stranger.address}`, ""]) {
      const res = await api("GET", `/v1/requests/${id}${q}`);
      expect([res.status, res.json.error.code]).toEqual([404, "REQUEST_NOT_FOUND"]); // the same as an unknown id
    }
    expect(await statusOf(id)).toBe("sent");

    published.length = 0;
    const notice = await api<RequestNotice>("GET", `/v1/requests/${id}?principal=${asha.address}`);
    expect(notice.status).toBe(200);
    expect(notice.json.purposes.map((p) => p.code)).toEqual(["credit_check"]);
    expect(await statusOf(id)).toBe("seen");
    await api("GET", `/v1/requests/${id}?principal=${asha.address}`);
    expect(published.filter((e) => e.event === "request.updated")).toEqual([expect.objectContaining({ requestId: id, status: "seen", fiduciary: QL.toLowerCase() })]);
  });

  it("grants make it Granted, with the consent in the customer's list and the company told by id only", async () => {
    const { asha, id } = await waitingRequest();
    const notice = (await api<RequestNotice>("GET", `/v1/requests/${id}?principal=${asha.address}`)).json;
    const message = {
      principal: asha.address,
      fiduciary: QL,
      purposeId: purposeIdOf(QL, "credit_check"),
      expiresAt: unix() + 86_400,
      noticeHash: notice.noticeHash,
      nonce: notice.nonce,
      deadline: unix() + 3600,
    };
    const signature = await asha.wallet.signTypedData(notice.domain, { GrantConsent: [...GRANT_CONSENT_TYPE] }, message);
    published.length = 0;
    expect((await api("POST", "/v1/consents/grant", { request: message, signature })).status).toBe(200);

    expect(await statusOf(id)).toBe("granted");
    expect(published.filter((e) => e.event === "request.updated")).toEqual([expect.objectContaining({ requestId: id, status: "granted" })]);
    expect((await api<InboxResponse>("GET", `/v1/principals/${asha.address}/requests`)).json.requests).toEqual([]); // it has left the inbox
    // and now, with consent in place, the company's own table knows the customer under the name it typed
    const rows = (await api<FiduciaryConsentsResponse>("GET", `/v1/fiduciaries/${QL}/consents`)).json.rows;
    expect(rows.find((r) => r.principal.toLowerCase() === asha.address.toLowerCase())).toMatchObject({ customerAlias: asha.handle, status: "Active", purposeCode: "credit_check" });
  });

  it("a grant for someone else's request, or an unrelated notice, grants nothing here", async () => {
    const { asha, id } = await waitingRequest();
    // a QR-style request for the same purposes, granted by a different wallet
    const qr = (await api("POST", `/v1/fiduciaries/${QL}/requests`, { purposes: ["credit_check"], customerAlias: "walk-in" })).json;
    const stranger = Wallet.createRandom();
    const notice = (await api<RequestNotice>("GET", `/v1/requests/${qr.requestId}?principal=${stranger.address}`)).json;
    const message = { principal: stranger.address, fiduciary: QL, purposeId: purposeIdOf(QL, "credit_check"), expiresAt: unix() + 86_400, noticeHash: notice.noticeHash, nonce: notice.nonce, deadline: unix() + 3600 };
    const signature = await stranger.signTypedData(notice.domain, { GrantConsent: [...GRANT_CONSENT_TYPE] }, message);
    expect((await api("POST", "/v1/consents/grant", { request: message, signature })).status).toBe(200);
    expect(await statusOf(id)).toBe("sent");
    expect((await api<InboxResponse>("GET", `/v1/principals/${asha.address}/requests`)).json.requests).toHaveLength(1);
  });

  it("Decline: signed, idempotent, shown to the company as Declined, gone from the inbox and the notice", async () => {
    const { asha, id } = await waitingRequest();
    const issuedAt = unix();
    const sign = (who: ReturnType<typeof Wallet.createRandom>) => who.signMessage(`sammati-decline:v1:${id}:${asha.address.toLowerCase()}:${issuedAt}`);

    const stranger = Wallet.createRandom();
    const forged = await api("POST", `/v1/requests/${id}/decline`, { principal: asha.address, issuedAt, signature: await sign(stranger) });
    expect([forged.status, forged.json.error.code]).toEqual([400, "BAD_SIGNATURE"]);
    expect(await statusOf(id)).toBe("sent");

    const theirs = await api("POST", `/v1/requests/${id}/decline`, { principal: stranger.address, issuedAt, signature: await stranger.signMessage(`sammati-decline:v1:${id}:${stranger.address.toLowerCase()}:${issuedAt}`) });
    expect(theirs.status).toBe(404); // not addressed to them, same as unknown

    published.length = 0;
    const signature = await sign(asha.wallet);
    expect((await api("POST", `/v1/requests/${id}/decline`, { principal: asha.address, issuedAt, signature })).json).toEqual({ status: "declined" });
    expect((await api("POST", `/v1/requests/${id}/decline`, { principal: asha.address, issuedAt, signature })).json).toEqual({ status: "declined" });
    expect(await statusOf(id)).toBe("declined");
    expect(published.filter((e) => e.event === "request.updated")).toHaveLength(1);
    expect((await api<InboxResponse>("GET", `/v1/principals/${asha.address}/requests`)).json.requests).toEqual([]);
    expect((await api("GET", `/v1/requests/${id}?principal=${asha.address}`)).status).toBe(410);
    expect((await api("POST", `/v1/requests/req_00000000/decline`, { principal: asha.address, issuedAt, signature })).status).toBe(400); // a different message was signed
  });

  it("Block this company: signed, respected silently, per company, and undone by Unblock", async () => {
    const { asha, id } = await waitingRequest();
    const other = (await send(asha.handle, { purposes: ["treatment"] }, MC)).json.requestId;
    const block = async (action: "block" | "unblock", fid = QL) => {
      const issuedAt = unix();
      const signature = await asha.wallet.signMessage(`sammati-block:v1:${action}:${fid.toLowerCase()}:${asha.address.toLowerCase()}:${issuedAt}`);
      return api<{ blocked: boolean }>("POST", `/v1/principals/${asha.address}/blocks`, { fiduciary: fid, action, issuedAt, signature });
    };

    expect((await block("block")).json.blocked).toBe(true);
    expect((await block("block")).json.blocked).toBe(true); // idempotent
    expect((await api("GET", `/v1/principals/${asha.address}/blocks`)).json.blocked).toEqual([expect.objectContaining({ fiduciary: { address: QL, name: "QuickLoan" } })]);
    expect(await statusOf(id)).toBe("declined"); // what QuickLoan had open is declined
    expect(await statusOf(other, MC)).toBe("sent"); // MediCare+ is unaffected
    expect((await api<InboxResponse>("GET", `/v1/principals/${asha.address}/requests`)).json.requests.map((r) => r.fiduciary.name)).toEqual(["MediCare+"]);

    published.length = 0;
    const after = await send(asha.handle);
    expect([after.status, after.json.status]).toEqual([201, "sent"]); // QuickLoan is told nothing
    expect(pushesTo(asha.address)).toHaveLength(0);
    expect(await statusOf(after.json.requestId)).toBe("sent");

    expect((await block("unblock")).json.blocked).toBe(false);
    expect((await api("GET", `/v1/principals/${asha.address}/blocks`)).json.blocked).toEqual([]);
    expect((await send(asha.handle)).status).toBe(201);
    expect(pushesTo(asha.address)).toHaveLength(1);
  });

  it("refuses a block or unblock the wallet did not sign, or with a bad action", async () => {
    const asha = await customer();
    const issuedAt = unix();
    const stranger = Wallet.createRandom();
    const signature = await stranger.signMessage(`sammati-block:v1:block:${QL.toLowerCase()}:${asha.address.toLowerCase()}:${issuedAt}`);
    expect((await api("POST", `/v1/principals/${asha.address}/blocks`, { fiduciary: QL, action: "block", issuedAt, signature })).json.error.code).toBe("BAD_SIGNATURE");
    expect((await api("POST", `/v1/principals/${asha.address}/blocks`, { fiduciary: QL, action: "mute", issuedAt, signature })).status).toBe(400);
    expect((await api("GET", `/v1/principals/${asha.address}/blocks`)).json.blocked).toEqual([]);
  });
});

describe("expiry", () => {
  it("a request that ran out is Expired for the company, absent from the inbox, and gone for the notice, with no timer", async () => {
    const asha = await customer();
    const id = (await send(asha.handle)).json.requestId;
    core.db.prepare("UPDATE request_targets SET expires_at = ? WHERE request_id = ?").run(unix() - 1, id);
    expect(await statusOf(id)).toBe("expired");
    expect((await api<TargetedRequestsResponse>("GET", `/v1/fiduciaries/${QL}/requests/targeted`)).json.requests.find((r) => r.requestId === id)!.status).toBe("expired");
    expect((await api<InboxResponse>("GET", `/v1/principals/${asha.address}/requests`)).json.requests).toEqual([]);
    expect((await api("GET", `/v1/requests/${id}?principal=${asha.address}`)).status).toBe(410);
    // expired requests do not count against the open-request limit
    for (let i = 0; i < 3; i++) expect((await send(asha.handle)).status).toBe(201);
    expect(pushesTo(asha.address).length).toBeGreaterThanOrEqual(4);
  });

  it("a request lives past the QR code's 30 minutes", async () => {
    const asha = await customer();
    const id = (await send(asha.handle)).json.requestId;
    core.db.prepare("UPDATE requests SET created_at = ? WHERE id = ?").run(unix() - 7200, id);
    expect((await api("GET", `/v1/requests/${id}?principal=${asha.address}`)).status).toBe(200);
  });

  it("a request is another company's business: its status is not readable by a different company", async () => {
    const asha = await customer();
    const id = (await send(asha.handle)).json.requestId;
    expect((await api("GET", `/v1/fiduciaries/${MC}/requests/targeted/${id}`)).status).toBe(404);
    expect((await api<TargetedRequestsResponse>("GET", `/v1/fiduciaries/${MC}/requests/targeted`)).json.requests.some((r) => r.requestId === id)).toBe(false);
  });
});

describe("who hears what", () => {
  it("consent.requested goes to the customer's topic only, request.updated to the company's only", async () => {
    const { topicsFor } = await import("../src/ws");
    const asha = await customer();
    const sent = await send(asha.handle);
    const requested = published.find((e) => e.event === "consent.requested")!;
    expect(topicsFor(requested)).toEqual([`principal:${asha.address.toLowerCase()}`]);
    await api("GET", `/v1/requests/${sent.json.requestId}?principal=${asha.address}`);
    const updated = published.find((e) => e.event === "request.updated")!;
    expect(topicsFor(updated)).toEqual([`fiduciary:${QL.toLowerCase()}`]);
    expect(Object.keys(updated)).not.toContain("principal");
  });
});
