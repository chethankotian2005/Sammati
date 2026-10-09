// Restart safety (trd.md §10.5): Core is stopped in the middle of the flow, the chain moves on while it is away, and
// a new Core on the same database and chain must come back with the same state: the indexer resumes from its cursor
// (no event applied or announced twice), no notification is sent a second time, a withdrawal nobody acknowledged is
// still acted on, and the anchor job continues from where the chain says it stopped.
import type { AddressInfo } from "node:net";
import { createServer, type Server } from "node:http";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Contract, Wallet, id, type HDNodeWallet } from "ethers";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GRANT_CONSENT_TYPE, LOCAL_RELAYER_KEY, WITHDRAW_CONSENT_TYPE, ZERO_HASH, buildDomain, chainEntry, purposeIdOf, type AccessLogEntry, type NotificationsResponse, type VerifyResponse, type WsEvent } from "@sammati/shared";
import { TEST_COMPANIES } from "@sammati/test-fixtures";
import { createRealApp } from "../src/app";
import type { Config } from "../src/config";
import type { RealCore } from "../src/real/core";
import { ExpiryScheduler } from "../src/real/expiry";
import { gatewayHeaders } from "./gatewayKey";
import { createTestCore, realConfig, startTestChain, type TestChain } from "./harness";

const QL = TEST_COMPANIES[0]!.address;
const DAY = 86_400;
const unix = () => Math.floor(Date.now() / 1000);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let chain: TestChain;
let dir: string;
let config: Config;
let core: RealCore;
let server: Server;
let base: string;
let events: WsEvent[] = [];

/** Brings a Core up on the shared database file, as a process start would. */
async function boot(): Promise<void> {
  events = [];
  core = await createTestCore(config, (e) => void events.push(e), () => {});
  server = createServer(createRealApp(core));
  await new Promise<void>((r) => server.listen(0, r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  core.start();
}

/** What SIGTERM does: stop accepting, stop the jobs, close the database. */
async function shutDown(): Promise<void> {
  await new Promise((r) => server.close(r));
  core.stop();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function api<T = any>(method: string, path: string, body?: unknown): Promise<{ status: number; json: T }> {
  const res = await fetch(base + path, {
    method,
    headers: { ...(body ? { "content-type": "application/json" } : {}), ...gatewayHeaders(path, body) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: (await res.json()) as T };
}

// --- consents: relayed through Core while it is up, sent straight to the chain while it is down ---

const registry = (): Contract => new Contract(chain.deployment.consentRegistry, core.chain.registryInterface, new Wallet(LOCAL_RELAYER_KEY, chain.provider));
const domain = () => buildDomain(chain.deployment.chainId, chain.deployment.consentRegistry);

type Signer = Wallet | HDNodeWallet;

async function grantMessage(who: Signer, nonce: number, code = "credit_check") {
  const message = { principal: who.address, fiduciary: QL, purposeId: purposeIdOf(QL, code), expiresAt: unix() + 2 * DAY, noticeHash: id(`notice-${who.address}`), nonce: String(nonce), deadline: unix() + 3600 };
  return { message, signature: await who.signTypedData(domain(), { GrantConsent: [...GRANT_CONSENT_TYPE] }, message) };
}

async function withdrawMessage(who: Signer, nonce: number, code = "credit_check") {
  const message = { principal: who.address, fiduciary: QL, purposeId: purposeIdOf(QL, code), nonce: String(nonce), deadline: unix() + 3600 };
  return { message, signature: await who.signTypedData(domain(), { WithdrawConsent: [...WITHDRAW_CONSENT_TYPE] }, message) };
}

// --- the access log, as the SDK writes it ---

let head: { seq: number; hash: string } = { seq: 0, hash: ZERO_HASH };
async function appendLog(principal: string): Promise<void> {
  const entry: AccessLogEntry = {
    at: unix(), decision: "ALLOWED", endpoint: "GET /customers/:id/credit-profile", fiduciary: QL, id: randomUUID(), latencyMs: 3,
    principal, purposeCode: "credit_check", reason: "OK", seq: head.seq + 1,
  };
  const chained = chainEntry(head.hash, entry);
  const res = await api("POST", "/v1/gateway/log", { ...entry, prevHash: chained.prevHash, hash: chained.hash, batchIndex: null });
  expect(res.status).toBe(201);
  head = { seq: entry.seq, hash: chained.hash };
}

const ledgerRows = () => core.db.prepare("SELECT tx_hash, log_index FROM ledger_events").all() as Array<{ tx_hash: string; log_index: number }>;
const distinctLedger = () => new Set(ledgerRows().map((r) => `${r.tx_hash}:${r.log_index}`)).size;
const cached = (who: Signer, code = "credit_check") => core.repo.cachedConsent(who.address, QL, purposeIdOf(QL, code))?.status;
const notificationsOf = async (who: Signer) => (await api<NotificationsResponse>("GET", `/v1/principals/${who.address}/notifications`)).json.notifications;

beforeAll(async () => {
  chain = await startTestChain();
  dir = mkdtempSync(join(tmpdir(), "sammati-restart-"));
  config = realConfig(chain, { dbPath: join(dir, "core.sqlite"), anchorIntervalMs: 0 });
  await boot();
});

afterAll(async () => {
  core?.stop();
  await new Promise((r) => server?.close(r));
  await chain?.stop();
  rmSync(dir, { recursive: true, force: true });
});

describe("Core restarted in the middle of the flow", () => {
  const steady = Wallet.createRandom(); // granted before, untouched by the outage
  const leaver = Wallet.createRandom(); // granted "marketing" (it has a processor) before, withdraws while Core is away
  const newcomer = Wallet.createRandom(); // grants while Core is away
  let ledgerBefore = 0;
  let cursorBefore = "";
  let notificationsBefore = 0;

  it("before the stop: two grants, an expiry reminder, three log entries anchored, two more waiting", async () => {
    for (const [who, code] of [[steady, "credit_check"], [leaver, "marketing"]] as const) {
      const { message, signature } = await grantMessage(who, 0, code);
      expect((await api("POST", "/v1/consents/grant", { request: message, signature })).status).toBe(200);
    }
    const early = new ExpiryScheduler(core.db, core.notifications, config, () => unix() + 1.5 * DAY);
    expect(early.tick()).toBe(2); // the 3-day reminder, once for each customer
    expect(events.filter((e) => e.event === "consent.expiring")).toHaveLength(2);

    for (let i = 0; i < 3; i++) await appendLog(steady.address);
    expect(await core.anchors.runOnce(QL)).toHaveLength(1);
    for (let i = 0; i < 2; i++) await appendLog(steady.address); // seq 4 and 5: pending when Core stops

    ledgerBefore = ledgerRows().length;
    cursorBefore = core.repo.getState("last_block")!;
    notificationsBefore = (await notificationsOf(steady)).length;
    expect(ledgerBefore).toBeGreaterThan(0);
    expect(notificationsBefore).toBe(1);
  });

  it("while Core is down the chain moves on: a new grant and a withdrawal", async () => {
    await shutDown();
    const grant = await grantMessage(newcomer, 0);
    await (await registry().getFunction("grantConsent")(grant.message, grant.signature)).wait();
    const withdraw = await withdrawMessage(leaver, 1, "marketing");
    await (await registry().getFunction("withdrawConsent")(withdraw.message, withdraw.signature)).wait();
  });

  it("the new Core resumes from the saved block: both changes arrive once, nothing before them is replayed", async () => {
    await boot();
    expect(core.repo.getState("last_block")).toBe(cursorBefore); // nothing has been read yet
    await core.indexer.syncOnce();

    expect(cached(steady)).toBe("Active");
    expect(cached(newcomer)).toBe("Active");
    expect(cached(leaver, "marketing")).toBe("Withdrawn");

    const updates = events.filter((e) => e.event === "consent.updated");
    expect(updates.map((e) => [e.principal.toLowerCase(), e.status]).sort()).toEqual(
      [[newcomer.address.toLowerCase(), "Active"], [leaver.address.toLowerCase(), "Withdrawn"]].sort(),
    );
    await core.indexer.syncOnce();
    expect(events.filter((e) => e.event === "consent.updated")).toHaveLength(2); // a second poll announces nothing
  });

  it("the withdrawal nobody had acknowledged is still carried out", async () => {
    const purposeId = purposeIdOf(QL, "marketing");
    for (let i = 0; i < 100 && !core.repo.cascadeFor(leaver.address, purposeId).every((c) => c.ackedAt); i++) await sleep(100);
    const rows = core.repo.cascadeFor(leaver.address, purposeId);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((c) => c.ackedAt !== null)).toBe(true);
    await core.indexer.syncOnce();
  });

  it("the ledger has each event once: the three new ones (grant, withdrawal, acknowledgement) and no duplicates", () => {
    expect(distinctLedger()).toBe(ledgerRows().length);
    expect(ledgerRows().length).toBe(ledgerBefore + 3);
  });

  it("no notification is sent a second time, and only what is new is raised", async () => {
    const scheduler = new ExpiryScheduler(core.db, core.notifications, config, () => unix() + 1.5 * DAY);
    expect(scheduler.tick()).toBe(1); // the newcomer's 3-day reminder; the steady customer's was sent before the restart
    expect(scheduler.tick()).toBe(0);
    expect((await notificationsOf(steady)).length).toBe(notificationsBefore);
    expect(events.filter((e) => e.event === "consent.expiring").map((e) => "principal" in e && e.principal)).toEqual([newcomer.address.toLowerCase()]);
  });

  it("the anchor job continues from where the chain stopped: the waiting entries form the next batch, with no gap", async () => {
    const done = await core.anchors.runOnce(QL);
    expect(done).toEqual([expect.objectContaining({ index: 1, fromSeq: 4, toSeq: 5, count: 2 })]);
    await appendLog(newcomer.address); // seq 6, written by the new process
    expect(await core.anchors.runOnce(QL)).toEqual([expect.objectContaining({ index: 2, fromSeq: 6, toSeq: 6 })]);

    const batches = core.repo.anchorsFor(QL).map((b) => [b.fromSeq, b.toSeq]);
    expect(batches).toEqual([[1, 3], [4, 5], [6, 6]]);
    const verified = (await api<VerifyResponse>("POST", `/v1/audit/verify/${QL}`)).json;
    expect(verified.ok).toBe(true);
  });
});
