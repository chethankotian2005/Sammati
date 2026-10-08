import type { AddressInfo } from "node:net";
import { createServer, type Server } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express from "express";
import { Contract, Wallet } from "ethers";
import { WebSocket } from "ws";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { sammati, type SammatiGate } from "@sammati/gateway";
import {
  GRANT_CONSENT_TYPE,
  GUARDED_ENDPOINTS,
  SEED_FIDUCIARIES,
  demoApiKey,
  WITHDRAW_CONSENT_TYPE,
  ZERO_HASH,
  chainEntry,
  noticeHash,
  purposeIdOf,
  type ActivityResponse,
  type AccessLogEntry,
  type ConsentStateResponse,
  type CreateRequestResponse,
  type FiduciaryAccessResponse,
  type PrincipalConsentsResponse,
  type RequestNotice,
  type WsEvent,
} from "@sammati/shared";
import { createRealApp } from "../src/app";
import type { Config } from "../src/config";
import { createRealCore, type RealCore } from "../src/real/core";
import { WsHub } from "../src/ws";
import { gatewayHeaders } from "./gatewayKey";
import { realConfig, startTestChain, type TestChain } from "./harness";

// Hardhat account #0: the seeded demo principal's key (public, test only).
const wallet = new Wallet("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");
const PRINCIPAL = wallet.address;
const QUICKLOAN = SEED_FIDUCIARIES[0]!;
const CREDIT = purposeIdOf(QUICKLOAN.address, "credit_check");
const MARKETING = purposeIdOf(QUICKLOAN.address, "marketing");
const hourFromNow = () => Math.floor(Date.now() / 1000) + 3600;
const monthFromNow = () => Math.floor(Date.now() / 1000) + 30 * 86_400;

let chain: TestChain;
let core: RealCore;
let server: Server;
let hub: WsHub;
let base: string;
let companyServer: Server;
let gate: SammatiGate;
let config: Config;
let companyUrl: string;
let socket: WebSocket;
const events: WsEvent[] = [];

async function api<T = unknown>(method: string, path: string, body?: unknown): Promise<{ status: number; json: T }> {
  const res = await fetch(base + path, {
    method,
    headers: { ...(body ? { "content-type": "application/json" } : {}), ...gatewayHeaders(path, body) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: (await res.json()) as T };
}

async function notice(requestId: string): Promise<RequestNotice> {
  return (await api<RequestNotice>("GET", `/v1/requests/${requestId}?principal=${PRINCIPAL}`)).json;
}

async function signGrant(n: RequestNotice, purposeId: string, nonce: string, over: Record<string, unknown> = {}, signer: Pick<Wallet, "signTypedData"> = wallet) {
  const message = {
    principal: PRINCIPAL,
    fiduciary: QUICKLOAN.address,
    purposeId,
    expiresAt: monthFromNow(),
    noticeHash: n.noticeHash,
    nonce,
    deadline: hourFromNow(),
    ...over,
  };
  const signature = await signer.signTypedData(n.domain, { GrantConsent: [...GRANT_CONSENT_TYPE] }, message);
  return { request: message, signature };
}

async function signWithdraw(n: RequestNotice, purposeId: string, nonce: string, over: Record<string, unknown> = {}) {
  const message = { principal: PRINCIPAL, fiduciary: QUICKLOAN.address, purposeId, nonce, deadline: hourFromNow(), ...over };
  const signature = await wallet.signTypedData(n.domain, { WithdrawConsent: [...WITHDRAW_CONSENT_TYPE] }, message);
  return { request: message, signature };
}

const state = async (purposeId: string) =>
  (await api<ConsentStateResponse>("GET", `/v1/gateway/consent-state?principal=${PRINCIPAL}&fid=${QUICKLOAN.address}&purpose=${purposeId}`)).json;

const count = (table: string, where = "1=1") => (core.db.prepare(`SELECT COUNT(*) AS c FROM ${table} WHERE ${where}`).get() as { c: number }).c;

beforeAll(async () => {
  chain = await startTestChain();
  server = createServer();
  hub = new WsHub(server);
  config = realConfig(chain);
  core = await createRealCore(config, (e) => hub.publish(e), () => {});
  server.on("request", createRealApp(core));
  core.start();
  await new Promise<void>((r) => server.listen(0, r));
  const port = (server.address() as AddressInfo).port;
  base = `http://127.0.0.1:${port}`;

  socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  socket.on("message", (raw) => events.push(JSON.parse(raw.toString()) as WsEvent));
  await new Promise((r) => socket.once("open", r));
  socket.send(JSON.stringify({ sub: [`principal:${PRINCIPAL}`, `fiduciary:${QUICKLOAN.address}`] }));

  // A company backend guarded by the real SDK (with its live consent feed), pointed at the real Core.
  gate = sammati({ coreUrl: base, fiduciary: QUICKLOAN.address, apiKey: demoApiKey("quickloan"), timeoutMs: 2000, cacheTtlMs: 1000 });
  const company = express();
  for (const p of QUICKLOAN.purposes) {
    const endpoint = GUARDED_ENDPOINTS[p.code]!;
    company.get(
      endpoint.path,
      gate.requireConsent({ purpose: p.code, principalFrom: (r) => r.header("x-sammati-principal") }),
      (_req, res) => res.json({ ok: true }),
    );
  }
  companyServer = company.listen(0);  companyUrl = `http://127.0.0.1:${(companyServer.address() as AddressInfo).port}`;
  config.companyUrls[QUICKLOAN.address.toLowerCase()] = companyUrl; // where /v1/demo/fire reaches QuickLoan
  await vi.waitFor(() => expect(hub.clientCount).toBeGreaterThanOrEqual(2)); // the test socket and the gateway's feed
});

afterAll(async () => {
  socket?.close();
  gate?.close();
  await gate?.flush(); // let queued log entries land before the database closes
  companyServer?.close();
  core?.stop();
  await hub?.close();
  await new Promise((r) => server?.close(r));
  await chain?.stop();
});

describe("real mode: setup", () => {
  it("reports live mode and seeds the directory", async () => {
    const { json } = await api<{ mode: string }>("GET", "/v1/health");
    expect(json.mode).toBe("live");
    expect(core.repo.fiduciaries().map((f) => f.name)).toEqual(["QuickLoan", "MediCare+", "FoodRush"]);
  });

  it("indexed the on-chain seed registrations into ledger_events", async () => {
    await core.indexer.syncOnce();
    // 3 fiduciaries + 9 purposes + 5 processors
    expect(count("ledger_events", "type = 'purpose'")).toBe(17);
    expect(core.repo.fiduciary(QUICKLOAN.address).address).toBe(QUICKLOAN.address);
    const registeredTx = core.db.prepare("SELECT registered_tx FROM fiduciaries WHERE address = ?").get(QUICKLOAN.address) as { registered_tx: string | null };
    expect(registeredTx.registered_tx).toMatch(/^0x[0-9a-f]{64}$/);
  });
});

describe("real mode: notices", () => {
  it("serves the seeded demo request with a notice hash per drd.md §4.2 and the principal's chain nonce", async () => {
    const n = await notice("req_demo_quickloan");
    const expected = noticeHash({
      fiduciary: QUICKLOAN.address,
      version: 1,
      purposes: QUICKLOAN.purposes.map((p) => ({
        id: purposeIdOf(QUICKLOAN.address, p.code),
        desc_en: p.description.en,
        desc_hi: p.description.hi,
        desc_kn: p.description.kn,
        dataCategories: p.dataCategories,
        retentionDays: p.retentionDays,
        sharesThirdParty: p.sharesThirdParty,
      })),
    });
    expect(n.noticeHash).toBe(expected);
    expect(n.nonce).toBe("0");
    expect(n.domain).toMatchObject({ name: "Sammati", version: "1", chainId: 31337, verifyingContract: chain.deployment.consentRegistry });
    expect(n.typedDataTemplate.message).toMatchObject({ principal: PRINCIPAL, fiduciary: QUICKLOAN.address, nonce: "0", noticeHash: expected });
    expect(n.purposes.map((p) => p.code)).toEqual(["credit_check", "marketing", "bureau_share"]);
  });

  it("creates a request from the console and expires it after the TTL", async () => {
    const created = await api<CreateRequestResponse>("POST", `/v1/fiduciaries/${QUICKLOAN.address}/requests`, {
      purposes: ["marketing"],
      customerAlias: "Customer #1",
    });
    expect(created.status).toBe(201);
    expect(created.json.qrPayload).toMatchObject({ v: 1, fiduciary: QUICKLOAN.address, name: "QuickLoan" });
    expect((await api("GET", `/v1/requests/${created.json.requestId}`)).status).toBe(200);

    core.db.prepare("UPDATE requests SET created_at = created_at - 100000 WHERE id = ?").run(created.json.requestId);
    const expired = await api<{ error: { code: string } }>("GET", `/v1/requests/${created.json.requestId}`);
    expect(expired.status).toBe(410);
    expect(expired.json.error.code).toBe("REQUEST_EXPIRED");

    expect((await api("POST", `/v1/fiduciaries/${QUICKLOAN.address}/requests`, { purposes: ["nope"], customerAlias: "x" })).status).toBe(404);
  });
});

describe("real mode: golden path", () => {
  it("grant → ALLOWED (through the gateway SDK) → withdraw → BLOCKED", async () => {
    const n = await notice("req_demo_quickloan");

    // two purposes, signed with consecutive nonces (RequestNotice docs)
    const g1 = await api<{ txHash: string; status: string }>("POST", "/v1/consents/grant", await signGrant(n, CREDIT, "0"));
    expect(g1.status).toBe(200);
    expect(g1.json).toMatchObject({ status: "confirmed", txHash: expect.stringMatching(/^0x[0-9a-f]{64}$/) });
    expect((await api("POST", "/v1/consents/grant", await signGrant(n, MARKETING, "1"))).status).toBe(200);

    // visible at once, through every read path
    expect(await state(CREDIT)).toMatchObject({ valid: true, status: "Active" });
    const consents = (await api<PrincipalConsentsResponse>("GET", `/v1/principals/${PRINCIPAL}/consents`)).json;
    // the wallet signs a withdrawal with exactly these (trd.md §6.1): the chain's nonce and the EIP-712 domain
    expect(consents.nonce).toBe("2");
    expect(consents.domain).toMatchObject({ name: "Sammati", version: "1", chainId: 31337, verifyingContract: chain.deployment.consentRegistry });
    const ql = consents.fiduciaries.find((f) => f.fiduciary.name === "QuickLoan")!;
    expect(ql.consents.map((c) => [c.code, c.status])).toEqual([["credit_check", "Active"], ["marketing", "Active"]]);
    expect(ql.consents[0]!.lastTx).toBe(g1.json.txHash);
    expect((await api<{ rows: { customerAlias: string | null }[] }>("GET", `/v1/fiduciaries/${QUICKLOAN.address}/consents`)).json.rows[0]!.customerAlias).toBe("Customer #4821");
    expect((await api("GET", `/v1/proof/consent/${g1.json.txHash}`)).status).toBe(200);

    // the company's endpoint, guarded by the SDK, lets the request through
    const allowed = await fetch(`${companyUrl}/customers/1/credit-profile`, { headers: { "x-sammati-principal": PRINCIPAL } });
    expect(allowed.status).toBe(200);

    const w = await api("POST", "/v1/consents/withdraw", await signWithdraw(n, CREDIT, "2"));
    expect(w.status).toBe(200);

    // and the very next request is refused
    const blocked = await fetch(`${companyUrl}/customers/1/credit-profile`, { headers: { "x-sammati-principal": PRINCIPAL } });
    expect(blocked.status).toBe(451);
    expect(await blocked.json()).toMatchObject({ code: "CONSENT_WITHDRAWN" });
    expect(await state(CREDIT)).toMatchObject({ valid: false, status: "Withdrawn", reason: "CONSENT_WITHDRAWN" });
    expect((await state(MARKETING)).valid).toBe(true);

    // both decisions were logged by the SDK, hash-chained, and show up in the wallet's feed
    await vi.waitFor(async () => {
      const feed = (await api<ActivityResponse>("GET", `/v1/principals/${PRINCIPAL}/activity`)).json.items;
      expect(feed.map((i) => i.decision)).toEqual(["BLOCKED", "ALLOWED"]);
      expect(feed[0]!.reason).toBe("CONSENT_WITHDRAWN");
    });
  });

  it("pushes each consent change over the WebSocket exactly once", async () => {
    await vi.waitFor(() => expect(events.filter((e) => e.event === "consent.updated")).toHaveLength(3));
    await new Promise((r) => setTimeout(r, 800)); // several poll intervals: the poller must not announce them again
    const updates = events.filter((e) => e.event === "consent.updated");
    expect(updates.map((e) => e.status)).toEqual(["Active", "Active", "Withdrawn"]);
    expect(new Set(updates.map((e) => e.txHash)).size).toBe(3);
    expect(updates[2]).toMatchObject({ principal: PRINCIPAL, fiduciary: QUICKLOAN.address, purposeId: CREDIT, purposeCode: "credit_check" });
    expect(events.filter((e) => e.event === "access.logged")).toHaveLength(2);
  });

  it("recorded the actions in ledger_events with the contract's ledger head", async () => {
    const rows = core.db.prepare("SELECT type, ledger_head FROM ledger_events WHERE type IN ('granted','withdrawn') ORDER BY block_number, log_index").all() as {
      type: string;
      ledger_head: string;
    }[];
    expect(rows.map((r) => r.type)).toEqual(["granted", "granted", "withdrawn"]);
    expect(new Set(rows.map((r) => r.ledger_head)).size).toBe(3);
    // the last action on chain was the withdrawal, so its event carries the registry's current head
    const registry = new Contract(chain.deployment.consentRegistry, ["function ledgerHead() view returns (bytes32)"], chain.provider);
    expect(core.repo.latestLedgerHead()).toBe(await registry.getFunction("ledgerHead")());
  });
});

describe("real mode: rejected requests", () => {
  it("maps contract reverts to the documented errors", async () => {
    const n = await notice("req_demo_quickloan");
    const code = async (body: unknown, path = "/v1/consents/grant") => {
      const res = await api<{ error: { code: string } }>("POST", path, body);
      return [res.status, res.json.error.code];
    };
    const nonce = String(await core.chain.registry.nonces(PRINCIPAL));

    expect(await code(await signGrant(n, MARKETING, "0"))).toEqual([409, "BAD_NONCE"]); // replayed nonce
    expect(await code(await signGrant(n, MARKETING, nonce, {}, Wallet.createRandom()))).toEqual([400, "BAD_SIGNATURE"]);
    expect(await code(await signGrant(n, MARKETING, nonce, { deadline: 1000 }))).toEqual([400, "DEADLINE_PASSED"]);
    expect(await code(await signGrant(n, MARKETING, nonce, { expiresAt: 1000 }))).toEqual([400, "BAD_EXPIRY"]);
    expect(await code(await signGrant(n, "0x" + "ab".repeat(32), nonce))).toEqual([404, "PURPOSE_NOT_FOUND"]);
    expect(await code(await signWithdraw(n, CREDIT, nonce), "/v1/consents/withdraw")).toEqual([409, "NOT_ACTIVE"]); // already withdrawn

    const bad = await api<{ error: { code: string } }>("POST", "/v1/consents/grant", { request: { principal: "nope" }, signature: "0x00" });
    expect(bad.status).toBe(400);
    expect(await code({ ...(await signGrant(n, MARKETING, nonce)), signature: "not hex" })).toEqual([400, "BAD_SIGNATURE"]);
    expect(await state(MARKETING)).toMatchObject({ valid: true }); // nothing above changed state
  });

  it("answers 501 for what real mode does not build yet, and honours DEMO_MODE", async () => {
    expect((await api("POST", `/v1/fiduciaries/${QUICKLOAN.address}/purposes`, {})).status).toBe(501);
    expect((await api("POST", `/v1/fiduciaries/${QUICKLOAN.address}/processors`, {})).status).toBe(501);
  });
});

describe("real mode: gateway log", () => {
  it("accepts a correctly chained entry and refuses a replayed or forged one", async () => {
    await gate.flush(); // nothing from the SDK may land between reading the head and posting on top of it
    const head = (await api<FiduciaryAccessResponse>("GET", `/v1/fiduciaries/${QUICKLOAN.address}/access?limit=1`)).json.items[0]!;
    const entry: AccessLogEntry = {
      at: Math.floor(Date.now() / 1000),
      decision: "ALLOWED",
      endpoint: "GET /customers/:id/credit-profile",
      fiduciary: QUICKLOAN.address,
      id: "log-test-1",
      latencyMs: 3,
      principal: PRINCIPAL,
      purposeCode: "marketing",
      reason: "OK",
      seq: head.seq + 1,
    };
    const chained = chainEntry(head.hash, entry);
    const row = { ...entry, prevHash: chained.prevHash, hash: chained.hash, batchIndex: null };

    expect((await api("POST", "/v1/gateway/log", row)).status).toBe(201);
    expect((await api<{ error: { code: string } }>("POST", "/v1/gateway/log", row)).json.error.code).toBe("SEQ_MISMATCH");
    const forged = { ...row, seq: row.seq + 1, hash: ZERO_HASH, prevHash: chained.hash };
    expect((await api<{ error: { code: string } }>("POST", "/v1/gateway/log", forged)).json.error.code).toBe("BAD_HASH");
  });

});

describe("real mode: /v1/demo/fire goes through the company's gateway", () => {
  const fire = (purposeCode: string) =>
    api<{ decision: string; reason: string; entryId: string }>("POST", "/v1/demo/fire", { fiduciary: QUICKLOAN.address, purposeCode, principal: PRINCIPAL });

  it("reports the company's own decision, and the log entry the SDK wrote for it", async () => {
    const allowed = await fire("marketing"); // consented earlier in this file
    expect(allowed.status).toBe(200);
    expect(allowed.json).toMatchObject({ decision: "ALLOWED", reason: "OK", entryId: expect.stringMatching(/^[0-9a-f-]{36}$/) });

    expect((await fire("credit_check")).json).toMatchObject({ decision: "BLOCKED", reason: "CONSENT_WITHDRAWN" });
    expect((await fire("bureau_share")).json).toMatchObject({ decision: "BLOCKED", reason: "NO_CONSENT" });

    await gate.flush();
    const feed = (await api<ActivityResponse>("GET", `/v1/principals/${PRINCIPAL}/activity?limit=200`)).json.items;
    const logged = feed.find((i) => i.id === allowed.json.entryId);
    expect(logged).toMatchObject({ decision: "ALLOWED", purposeCode: "marketing", endpoint: `GET ${GUARDED_ENDPOINTS.marketing!.path}` });
    await vi.waitFor(() => expect(events.some((e) => e.event === "access.logged" && e.entryId === allowed.json.entryId)).toBe(true));
  });

  it("grant → ALLOWED → withdraw → BLOCKED → grant → ALLOWED, each step on the very next request", async () => {
    const n = await notice("req_demo_quickloan");
    const nonce = Number(n.nonce);

    expect((await fire("marketing")).json.decision).toBe("ALLOWED");
    expect((await api("POST", "/v1/consents/withdraw", await signWithdraw(n, MARKETING, String(nonce)))).status).toBe(200);
    expect((await fire("marketing")).json).toMatchObject({ decision: "BLOCKED", reason: "CONSENT_WITHDRAWN" });
    expect((await api("POST", "/v1/consents/grant", await signGrant(n, MARKETING, String(nonce + 1)))).status).toBe(200);
    expect((await fire("marketing")).json).toMatchObject({ decision: "ALLOWED", reason: "OK" });

    // every decision above is in the hash-chained log, in order, with no gaps
    await gate.flush();
    const rows = (await api<FiduciaryAccessResponse>("GET", `/v1/fiduciaries/${QUICKLOAN.address}/access?limit=500`)).json.items.reverse();
    expect(rows.map((r) => r.seq)).toEqual(rows.map((_, i) => i + 1));
    expect(rows.slice(-3).map((r) => r.decision)).toEqual(["ALLOWED", "BLOCKED", "ALLOWED"]);
  });

  it("the presenter's demo withdraw signs for the demo customer, takes effect at once, and refuses anyone else", async () => {
    expect((await fire("marketing")).json.decision).toBe("ALLOWED");
    const body = { principal: PRINCIPAL, fiduciary: QUICKLOAN.address, purposeCode: "marketing" };

    const withdrawn = await api<{ txHash: string; status: string }>("POST", "/v1/demo/withdraw", body);
    expect(withdrawn.status).toBe(200);
    expect(withdrawn.json).toMatchObject({ status: "confirmed", txHash: expect.stringMatching(/^0x[0-9a-f]{64}$/) });
    expect(await state(MARKETING)).toMatchObject({ valid: false, status: "Withdrawn", reason: "CONSENT_WITHDRAWN" });
    expect((await fire("marketing")).json).toMatchObject({ decision: "BLOCKED", reason: "CONSENT_WITHDRAWN" });

    // withdrawing what is already withdrawn is the contract's refusal, passed on
    const again = await api<{ error: { code: string } }>("POST", "/v1/demo/withdraw", body);
    expect([again.status, again.json.error.code]).toEqual([409, "NOT_ACTIVE"]);

    // a customer whose key Core does not hold is a real wallet: only its phone can withdraw
    const stranger = await api<{ error: { code: string } }>("POST", "/v1/demo/withdraw", { ...body, principal: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" });
    expect([stranger.status, stranger.json.error.code]).toEqual([403, "NOT_A_DEMO_PRINCIPAL"]);
    expect((await api("POST", "/v1/demo/withdraw", { ...body, purposeCode: "nope" })).status).toBe(404);

    // leave the ledger as the tests after this one expect it
    const n = await notice("req_demo_quickloan");
    expect((await api("POST", "/v1/consents/grant", await signGrant(n, MARKETING, n.nonce))).status).toBe(200);
  });

  it("answers 502 when the company's backend is not running", async () => {
    const real = config.companyUrls[QUICKLOAN.address.toLowerCase()];
    config.companyUrls[QUICKLOAN.address.toLowerCase()] = "http://127.0.0.1:1";
    try {
      const res = await api<{ error: { code: string } }>("POST", "/v1/demo/fire", { fiduciary: QUICKLOAN.address, purposeCode: "marketing", principal: PRINCIPAL });
      expect(res.status).toBe(502);
      expect(res.json.error.code).toBe("COMPANY_UNREACHABLE");
    } finally {
      config.companyUrls[QUICKLOAN.address.toLowerCase()] = real!;
    }
  });
});
describe("real mode: indexer and reconcile", () => {
  it("rebuilds the same ledger from scratch, then resumes from its cursor without re-announcing", async () => {
    const dir = mkdtempSync(join(tmpdir(), "sammati-core-"));
    const dbPath = join(dir, "core.sqlite");
    try {
      const announced: WsEvent[] = [];
      const fresh = await createRealCore(realConfig(chain, { dbPath }), (e) => announced.push(e), () => {});
      await fresh.indexer.syncOnce();
      const total = (c: RealCore) => (c.db.prepare("SELECT COUNT(*) AS c FROM ledger_events").get() as { c: number }).c;
      expect(total(fresh)).toBe(count("ledger_events"));
      expect(fresh.repo.principalConsents(PRINCIPAL)).toEqual(core.repo.principalConsents(PRINCIPAL));
      const cursor = fresh.repo.getState("last_block");
      expect(Number(cursor)).toBe(await chain.provider.getBlockNumber());
      fresh.stop();

      announced.length = 0;
      const resumed = await createRealCore(realConfig(chain, { dbPath }), (e) => announced.push(e), () => {});
      await resumed.indexer.syncOnce();
      expect(resumed.repo.getState("last_block")).toBe(cursor);
      expect(total(resumed)).toBe(count("ledger_events"));
      expect(announced).toEqual([]);
      resumed.stop();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("reconcile finds a stale cache and repairs it from the chain", async () => {
    const phantom = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
    core.db.prepare("UPDATE consents_cache SET status = 'Withdrawn', expires_at = 5 WHERE purpose_id = ?").run(MARKETING);
    core.db.prepare("DELETE FROM consents_cache WHERE purpose_id = ?").run(CREDIT);
    core.db
      .prepare("INSERT INTO consents_cache (principal, fiduciary, purpose_id, status, granted_at, expires_at, updated_at) VALUES (?, ?, ?, 'Active', 1, 9999999999, 1)")
      .run(phantom, QUICKLOAN.address, CREDIT);

    const result = await core.reconcile();
    expect(result.drift.map((d) => d.field).sort()).toEqual(["expiresAt", "missing", "status", "status"].sort());

    const healed = core.repo.principalConsents(PRINCIPAL).fiduciaries[0]!.consents;
    expect(healed.map((c) => [c.code, c.status])).toEqual([["credit_check", "Withdrawn"], ["marketing", "Active"]]);
    expect(core.repo.cachedConsent(phantom, QUICKLOAN.address, CREDIT)).toBeUndefined();
    expect((await core.reconcile()).drift).toEqual([]);
  });
});

describe("real mode: no stale reads", () => {
  // ethers caches identical RPC reads for 250 ms by default. For consent that would mean a withdrawal
  // that is not enforced yet (stale eth_call), or a second relayed tx reusing a nonce. Every step
  // below follows the previous one immediately, with no sleeps.
  it("sees every grant and withdrawal on the very next read, and never reuses a relayer nonce", async () => {
    const n = await notice("req_demo_quickloan");
    let nonce = Number(n.nonce);
    expect((await state(MARKETING)).valid).toBe(true); // primes any read cache with "valid"

    for (let i = 0; i < 5; i++) {
      const withdrawn = await api("POST", "/v1/consents/withdraw", await signWithdraw(n, MARKETING, String(nonce++)));
      expect(withdrawn.status, `withdraw ${i}`).toBe(200);
      expect(await state(MARKETING), `after withdraw ${i}`).toMatchObject({ valid: false, reason: "CONSENT_WITHDRAWN" });
      expect((await notice("req_demo_quickloan")).nonce, `nonce after withdraw ${i}`).toBe(String(nonce));

      const granted = await api("POST", "/v1/consents/grant", await signGrant(n, MARKETING, String(nonce++)));
      expect(granted.status, `grant ${i}`).toBe(200);
      expect(await state(MARKETING), `after grant ${i}`).toMatchObject({ valid: true });
    }
  });
});

describe("real mode: chain reset and outage", () => {
  it("discards what it derived from a chain that was reset", async () => {
    await chain.reset(); // new chain, same addresses, reseeded: what demo:reset does
    await core.indexer.syncOnce();
    expect((await api<PrincipalConsentsResponse>("GET", `/v1/principals/${PRINCIPAL}/consents`)).json.fiduciaries).toEqual([]);
    expect(count("ledger_events", "type IN ('granted','withdrawn')")).toBe(0);
    expect(count("ledger_events", "type = 'purpose'")).toBe(17);

    // the golden path works again from nonce 0
    const n = await notice("req_demo_quickloan");
    expect(n.nonce).toBe("0");
    expect((await api("POST", "/v1/consents/grant", await signGrant(n, CREDIT, "0"))).status).toBe(200);
    expect((await state(CREDIT)).valid).toBe(true);
  });

  it("POST /v1/demo/reset wipes Core's database and re-reads the chain", async () => {
    core.db.prepare("DELETE FROM consents_cache").run();
    expect((await api("POST", "/v1/demo/reset")).status).toBe(200);
    expect(core.repo.principalConsents(PRINCIPAL).fiduciaries[0]!.consents.map((c) => c.code)).toEqual(["credit_check"]);
    expect(count("access_logs")).toBe(0);
  });

  it("fails closed when the ledger is unreachable", async () => {
    const n = await notice("req_demo_quickloan");
    const signedGrant = await signGrant(n, MARKETING, "0"); // ready to send once the node is gone
    await chain.stop();
    const res = await api<{ error: { code: string } }>("GET", `/v1/gateway/consent-state?principal=${PRINCIPAL}&fid=${QUICKLOAN.address}&purpose=credit_check`);
    expect(res.status).toBe(503);
    expect(res.json.error.code).toBe("LEDGER_UNAVAILABLE");

    // The SDK may keep answering from its consent cache for its short TTL (architecture.md §8), then it fails closed.
    await new Promise((r) => setTimeout(r, 1200));
    const blocked = await fetch(`${companyUrl}/customers/1/credit-profile`, { headers: { "x-sammati-principal": PRINCIPAL } });
    expect(blocked.status).toBe(451);
    expect(await blocked.json()).toMatchObject({ code: "LEDGER_UNAVAILABLE" });
    const grant = await api<{ error: { code: string } }>("POST", "/v1/consents/grant", signedGrant);
    expect(grant.status).toBe(503);
    expect(grant.json.error.code).toBe("LEDGER_UNAVAILABLE");
  });
});
