import type { AddressInfo } from "node:net";
import { createServer, type Server } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Contract, Wallet, id } from "ethers";
import { WebSocket } from "ws";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  GRANT_CONSENT_TYPE,
  SEED_FIDUCIARIES,
  WITHDRAW_CONSENT_TYPE,
  ZERO_HASH,
  notificationDigest,
  notificationSigner,
  purposeIdOf,
  signAck,
  signNotification,
  type CascadeNotification,
  type CascadeResponse,
  type WsEvent,
} from "@sammati/shared";
import { createRealApp } from "../src/app";
import type { Config } from "../src/config";
import { createRealCore, type RealCore } from "../src/real/core";
import { InProcessProcessor } from "../src/real/processors";
import { WsHub } from "../src/ws";
import { realConfig, startTestChain, type TestChain } from "./harness";

const wallet = new Wallet("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"); // Hardhat #0: the data principal
const PRINCIPAL = wallet.address;
const [QUICKLOAN, MEDICARE] = SEED_FIDUCIARIES;
const QL = QUICKLOAN!.address;
const MC = MEDICARE!.address;
const AD_PARTNER = QUICKLOAN!.processors.find((p) => p.name === "AdPartnerQ")!; // marketing
const CREDIT_BUREAU = QUICKLOAN!.processors.find((p) => p.name === "CreditBureauX")!; // bureau_share
const INSURE_CO = MEDICARE!.processors.find((p) => p.name === "InsureCo")!; // insurance_claim
const MARKETING = purposeIdOf(QL, "marketing");
const BUREAU_SHARE = purposeIdOf(QL, "bureau_share");
const CREDIT_CHECK = purposeIdOf(QL, "credit_check");
const INSURANCE = purposeIdOf(MC, "insurance_claim");

let chain: TestChain;
let core: RealCore;
let config: Config;
let server: Server;
let hub: WsHub;
let base: string;
let socket: WebSocket;
const events: WsEvent[] = [];
const cascadeEvents = () => events.filter((e): e is Extract<WsEvent, { event: "cascade.updated" }> => e.event === "cascade.updated");

async function api<T = unknown>(method: string, path: string, body?: unknown): Promise<{ status: number; json: T }> {
  const res = await fetch(base + path, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: (await res.json()) as T };
}

let nonce = 0;
const domain = () => ({ name: "Sammati", version: "1", chainId: 31337, verifyingContract: chain.deployment.consentRegistry });
const hourFromNow = () => Math.floor(Date.now() / 1000) + 3600;

async function grant(fiduciary: string, purposeId: string): Promise<void> {
  const m = { principal: PRINCIPAL, fiduciary, purposeId, expiresAt: hourFromNow() + 86_400, noticeHash: id("n"), nonce: String(nonce++), deadline: hourFromNow() };
  const signature = await wallet.signTypedData(domain(), { GrantConsent: [...GRANT_CONSENT_TYPE] }, m);
  expect((await api("POST", "/v1/consents/grant", { request: m, signature })).status).toBe(200);
}

async function withdraw(fiduciary: string, purposeId: string): Promise<string> {
  const m = { principal: PRINCIPAL, fiduciary, purposeId, nonce: String(nonce++), deadline: hourFromNow() };
  const signature = await wallet.signTypedData(domain(), { WithdrawConsent: [...WITHDRAW_CONSENT_TYPE] }, m);
  const res = await api<{ txHash: string }>("POST", "/v1/consents/withdraw", { request: m, signature });
  expect(res.status).toBe(200);
  return res.json.txHash;
}

const cascade = async (purposeId: string) => (await api<CascadeResponse>("GET", `/v1/principals/${PRINCIPAL}/cascade/${purposeId}`)).json;
const count = (sql: string) => (core.db.prepare(sql).get() as { c: number }).c;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Acknowledgements on chain, as the contract recorded them (not Core's tables). */
async function acksOnChain(purposeId: string): Promise<string[]> {
  const registry = new Contract(chain.deployment.consentRegistry, core.chain.registryInterface, chain.provider);
  const logs = await registry.queryFilter(registry.filters.WithdrawalAcknowledged!(null, purposeId));
  return logs.map((l) => (l as unknown as { args: { processor: string } }).args.processor);
}

beforeAll(async () => {
  chain = await startTestChain();
  config = realConfig(chain);
  server = createServer();
  hub = new WsHub(server);
  core = await createRealCore(config, (e) => hub.publish(e), () => {});
  server.on("request", createRealApp(core));
  core.start();
  await new Promise<void>((r) => server.listen(0, r));
  const port = (server.address() as AddressInfo).port;
  base = `http://127.0.0.1:${port}`;

  socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  socket.on("message", (raw) => events.push(JSON.parse(raw.toString()) as WsEvent));
  await new Promise((r) => socket.once("open", r));
  socket.send(JSON.stringify({ sub: [`principal:${PRINCIPAL}`] }));
});

afterAll(async () => {
  socket?.close();
  await core?.cascade.idle();
  core?.stop();
  await hub?.close();
  await new Promise((r) => server?.close(r));
  await chain?.stop();
});

describe("cascade after a withdrawal", () => {
  it("tells the purpose's processor, collects its signed acknowledgement, and records it on chain", async () => {
    await grant(QL, MARKETING);
    expect((await cascade(MARKETING)).processors).toEqual([
      { processor: AD_PARTNER.address, name: "AdPartnerQ", notifiedAt: null, ackedAt: null, txHash: null }, // nothing to wait for before a withdrawal
    ]);

    const withdrawalTx = await withdraw(QL, MARKETING);
    await vi.waitFor(async () => expect((await cascade(MARKETING)).processors[0]!.ackedAt).not.toBeNull(), { timeout: 10_000 });

    const [entry] = (await cascade(MARKETING)).processors;
    expect(entry).toMatchObject({ processor: AD_PARTNER.address, name: "AdPartnerQ", notifiedAt: expect.any(Number), ackedAt: expect.any(Number), txHash: expect.stringMatching(/^0x[0-9a-f]{64}$/) });
    // notifiedAt is Core's clock and ackedAt the chain's block time: they may differ by a second or so, but not by much
    expect(entry!.ackedAt!).toBeGreaterThanOrEqual(entry!.notifiedAt! - 2);
    expect(await acksOnChain(MARKETING)).toEqual([AD_PARTNER.address]); // the contract itself recorded it, from the processor's key

    // and the ledger explorer shows it, tied to the withdrawal
    const ledger = (await api<{ events: { type: string; txHash: string; payload: { processor: string } | null }[] }>("GET", `/v1/audit/ledger?type=ack&principal=${PRINCIPAL}`)).json.events;
    expect(ledger).toHaveLength(1);
    expect(ledger[0]!.payload).toEqual({ processor: AD_PARTNER.address });
    expect(ledger[0]!.txHash).toBe(entry!.txHash);
    expect(withdrawalTx).not.toBe(entry!.txHash);
  });

  it("pushes cascade.updated twice: first 'told, waiting', then 'acknowledged'", async () => {
    await vi.waitFor(() => expect(cascadeEvents().filter((e) => e.purposeId === MARKETING)).toHaveLength(2));
    await sleep(500); // a few polling rounds: the indexer must not announce the acknowledgement again
    const mine = cascadeEvents().filter((e) => e.purposeId === MARKETING);
    expect(mine).toHaveLength(2);
    expect(mine[0]).toMatchObject({ principal: PRINCIPAL, processor: AD_PARTNER.address, processorName: "AdPartnerQ", notifiedAt: expect.any(Number), ackedAt: null, txHash: null });
    expect(mine[1]).toMatchObject({ processor: AD_PARTNER.address, ackedAt: expect.any(Number), txHash: expect.stringMatching(/^0x/), notifiedAt: mine[0]!.notifiedAt });
  });

  it("acknowledges only after the processor's delay (1 to 3 s by default, configurable)", async () => {
    config.cascadeDelayMs = [400, 500];
    // the engine caches its processor stubs, so use a processor it has not built yet: InsureCo
    await grant(MC, INSURANCE);
    await withdraw(MC, INSURANCE);
    await vi.waitFor(() => expect(cascadeEvents().filter((e) => e.purposeId === INSURANCE)).toHaveLength(1)); // told
    const toldAt = Date.now();
    await vi.waitFor(() => expect(cascadeEvents().filter((e) => e.purposeId === INSURANCE)).toHaveLength(2), { timeout: 10_000 });
    expect(Date.now() - toldAt).toBeGreaterThanOrEqual(350);
    expect(await acksOnChain(INSURANCE)).toEqual([INSURE_CO.address]);
  });

  it("does nothing for a purpose that has no processors", async () => {
    const before = cascadeEvents().length;
    await grant(QL, CREDIT_CHECK);
    await withdraw(QL, CREDIT_CHECK);
    await core.cascade.idle();
    await sleep(300);
    expect(cascadeEvents().length).toBe(before);
    expect((await cascade(CREDIT_CHECK)).processors).toEqual([]);
  });

  it("answers 404 for an unknown purpose and 400 for a malformed address", async () => {
    expect((await api("GET", `/v1/principals/${PRINCIPAL}/cascade/0x${"ab".repeat(32)}`)).status).toBe(404);
    expect((await api("GET", `/v1/principals/nope/cascade/${MARKETING}`)).status).toBe(400);
  });
});

describe("a cascade is moot or already done", () => {
  it("does not acknowledge if the consent was granted again while the processor was thinking", async () => {
    config.cascadeDelayMs = [500, 600];
    await grant(QL, BUREAU_SHARE);
    await withdraw(QL, BUREAU_SHARE);
    await vi.waitFor(async () => expect((await cascade(BUREAU_SHARE)).processors[0]!.notifiedAt).not.toBeNull()); // CreditBureauX was told
    await grant(QL, BUREAU_SHARE); // ...but the user changed their mind

    await core.cascade.idle();
    expect(await acksOnChain(BUREAU_SHARE)).toEqual([]); // nothing was acknowledged: there was no withdrawal left to acknowledge
    // the new grant starts clean: no stale "waiting" for a consent that is active again
    expect((await cascade(BUREAU_SHARE)).processors).toEqual([{ processor: CREDIT_BUREAU.address, name: "CreditBureauX", notifiedAt: null, ackedAt: null, txHash: null }]);
  });

  it("re-reading the chain from scratch neither re-notifies nor acknowledges twice", async () => {
    config.cascadeDelayMs = [20, 60];
    const acksBefore = count("SELECT COUNT(*) AS c FROM ledger_events WHERE type = 'ack'");
    const announced = cascadeEvents().length;
    expect(acksBefore).toBeGreaterThanOrEqual(2);

    await core.reset(); // wipes Core's database and replays every event, withdrawals included
    await core.cascade.idle();
    await sleep(300);

    expect(count("SELECT COUNT(*) AS c FROM ledger_events WHERE type = 'ack'")).toBe(acksBefore); // no extra transactions
    expect((await cascade(MARKETING)).processors[0]).toMatchObject({ ackedAt: expect.any(Number), txHash: expect.stringMatching(/^0x/) }); // history restored from the chain
    // The replay announces the restored acknowledgements once each, but never says "told, waiting" again.
    const replayed = cascadeEvents().slice(announced);
    expect(replayed.every((e) => e.ackedAt !== null)).toBe(true);
  });

  it("runs a cascade again for a second withdrawal of the same consent", async () => {
    config.cascadeDelayMs = [20, 60];
    await grant(QL, MARKETING); // clears the first cascade
    expect((await cascade(MARKETING)).processors[0]).toMatchObject({ notifiedAt: null, ackedAt: null });
    await withdraw(QL, MARKETING);
    await vi.waitFor(async () => expect((await cascade(MARKETING)).processors[0]!.ackedAt).not.toBeNull(), { timeout: 10_000 });
    expect(await acksOnChain(MARKETING)).toEqual([AD_PARTNER.address, AD_PARTNER.address]); // two withdrawals, two acknowledgements
  });
});

describe("catching up after a restart", () => {
  it("a restarted Core finishes cascades the previous one never completed", async () => {
    const dir = mkdtempSync(join(tmpdir(), "sammati-cascade-"));
    const dbPath = join(dir, "core.sqlite");
    const opened: RealCore[] = [];
    // The main test Core shares this chain and would acknowledge the withdrawal itself; only the two Cores under test may act.
    const mainHook = core.indexer.onWithdrawn;
    core.indexer.onWithdrawn = null;
    try {
      // Core 1 sees the withdrawal and tells the processor, which takes 30 s to answer; Core 1 stops first.
      const first = await createRealCore(realConfig(chain, { dbPath, cascadeDelayMs: [30_000, 30_000] }), () => {}, () => {});
      opened.push(first);
      await first.indexer.syncOnce();
      await grant(QL, MARKETING);
      await first.indexer.syncOnce(); // the grant is on chain and now in first's cache
      const acksBefore = (await acksOnChain(MARKETING)).length;
      await withdraw(QL, MARKETING);
      await first.indexer.syncOnce();
      await vi.waitFor(() => expect(first.repo.cascadeFor(PRINCIPAL, MARKETING)[0]!.notifiedAt).not.toBeNull());
      expect((await acksOnChain(MARKETING)).length).toBe(acksBefore); // still waiting
      first.stop();

      // Core 2 starts on the same database with a normal delay and picks the cascade up.
      const second = await createRealCore(realConfig(chain, { dbPath, cascadeDelayMs: [20, 60] }), () => {}, () => {});
      opened.push(second);
      second.start();
      await vi.waitFor(async () => expect((await acksOnChain(MARKETING)).length).toBe(acksBefore + 1), { timeout: 10_000 });
      await second.cascade.idle();
      await second.indexer.syncOnce();
      expect(second.repo.cascadeFor(PRINCIPAL, MARKETING)[0]!.ackedAt).not.toBeNull();
    } finally {
      core.indexer.onWithdrawn = mainHook;
      // close every database before deleting its directory, so a failed assertion above is not hidden by a file-lock error
      for (const c of opened) {
        try {
          c.stop();
        } catch {
          // already stopped
        }
      }
      rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); // Windows can hold SQLite's WAL files a moment after close
    }
  });
});
describe("the processor stub and the signed messages", () => {
  const processorWallet = new Wallet(AD_PARTNER.demoKey);
  const stub = new InProcessProcessor("AdPartnerQ", processorWallet, async () => {}, () => 0);
  const notification: CascadeNotification = {
    principal: PRINCIPAL,
    fiduciary: QL,
    purposeId: MARKETING,
    purposeCode: "marketing",
    processor: AD_PARTNER.address,
    withdrawalTx: "0x" + "ab".repeat(32),
    withdrawnAt: 1760000000,
  };

  it("acknowledges a notification signed by the company, bound to exactly that notification", async () => {
    const answer = await stub.receive(await signNotification(notification, new Wallet(QUICKLOAN!.demoKey)));
    expect(answer.ack).toMatchObject({ principal: PRINCIPAL, purposeId: MARKETING, processor: AD_PARTNER.address, notificationDigest: notificationDigest(notification) });
    // signed by the processor, verifiable by anyone
    const { ackSigner } = await import("@sammati/shared");
    expect(ackSigner(answer)).toBe(AD_PARTNER.address);
  });

  it("refuses a notification that the company did not sign, or that was meant for someone else", async () => {
    await expect(stub.receive(await signNotification(notification, Wallet.createRandom()))).rejects.toThrow(/not signed by/);
    await expect(stub.receive(await signNotification(notification, new Wallet(MEDICARE!.demoKey)))).rejects.toThrow(/not signed by/); // another company
    const tampered = await signNotification(notification, new Wallet(QUICKLOAN!.demoKey));
    await expect(stub.receive({ ...tampered, notification: { ...notification, withdrawnAt: 1 } })).rejects.toThrow(/not signed by/);
    await expect(stub.receive(await signNotification({ ...notification, processor: INSURE_CO.address }, new Wallet(QUICKLOAN!.demoKey)))).rejects.toThrow(/addressed to/);
    expect(notificationSigner(await signNotification(notification, new Wallet(QUICKLOAN!.demoKey)))).toBe(QL);
  });

  it("waits for its delay before answering", async () => {
    const waits: number[] = [];
    const slow = new InProcessProcessor("AdPartnerQ", processorWallet, async (ms) => void waits.push(ms), () => 2500);
    await slow.receive(await signNotification(notification, new Wallet(QUICKLOAN!.demoKey)));
    expect(waits).toEqual([2500]);
  });

});

describe("a processor that misbehaves", () => {
  const FR = SEED_FIDUCIARIES[2]!.address;
  const AD_NETWORK = SEED_FIDUCIARIES[2]!.processors[0]!; // AdNetworkZ, ad_targeting
  const AD_TARGETING = purposeIdOf(FR, "ad_targeting");

  /** A one-off engine standing in for the real one while a consent is withdrawn. */
  async function withEngine(resolve: (stubKey: string) => import("../src/real/cascade").ProcessorTransport, run: () => Promise<void>): Promise<string[]> {
    const { CascadeEngine } = await import("../src/real/cascade");
    const warnings: string[] = [];
    const engine = new CascadeEngine(config, core.repo, core.chain, core.indexer, () => {}, (m) => warnings.push(m));
    engine.resolveProcessor = (p) => resolve(config.processorKeys[p.address.toLowerCase()]!);
    const original = core.indexer.onWithdrawn;
    core.indexer.onWithdrawn = (w) => engine.onWithdrawn(w);
    try {
      await run();
      await engine.idle();
    } finally {
      core.indexer.onWithdrawn = original;
    }
    return warnings;
  }

  it("never records an acknowledgement that the processor did not sign", async () => {
    const warnings = await withEngine(
      (key) => ({
        wallet: new Wallet(key, chain.provider),
        // answers instantly, but the signature is a stranger's
        receive: async ({ notification }) =>
          signAck({ principal: notification.principal, purposeId: notification.purposeId, processor: notification.processor, notificationDigest: notificationDigest(notification), ackedAt: 1 }, Wallet.createRandom()),
      }),
      async () => {
        await grant(FR, AD_TARGETING);
        await withdraw(FR, AD_TARGETING);
      },
    );
    expect(warnings.some((m) => m.includes("not signed by the processor"))).toBe(true);
    expect(await acksOnChain(AD_TARGETING)).toEqual([]);
    expect((await cascade(AD_TARGETING)).processors[0]).toMatchObject({ processor: AD_NETWORK.address, notifiedAt: expect.any(Number), ackedAt: null }); // told, still waiting
  });

  it("never records an acknowledgement for a different notification", async () => {
    // Withdraw again so there is a fresh cascade to answer wrongly: the previous one is still outstanding.
    const warnings = await withEngine(
      (key) => ({
        wallet: new Wallet(key, chain.provider),
        receive: async ({ notification }) =>
          signAck({ principal: notification.principal, purposeId: notification.purposeId, processor: notification.processor, notificationDigest: notificationDigest({ ...notification, withdrawnAt: 1 }), ackedAt: 1 }, new Wallet(key)),
      }),
      async () => {
        await grant(FR, AD_TARGETING);
        await withdraw(FR, AD_TARGETING);
      },
    );
    expect(warnings.some((m) => m.includes("not signed by the processor for this notification"))).toBe(true);
    expect(await acksOnChain(AD_TARGETING)).toEqual([]);
  });

  it("logs a processor that refuses or crashes and leaves the cascade outstanding for the next catch-up", async () => {
    const warnings = await withEngine(
      (key) => ({ wallet: new Wallet(key, chain.provider), receive: async () => Promise.reject(new Error("AdNetworkZ is down")) }),
      async () => {
        await grant(FR, AD_TARGETING);
        await withdraw(FR, AD_TARGETING);
      },
    );
    expect(warnings.some((m) => m.includes("AdNetworkZ is down"))).toBe(true);
    expect(await acksOnChain(AD_TARGETING)).toEqual([]);

    // The real engine's catch-up finds the outstanding withdrawal and completes it.
    core.cascade.catchUp();
    await core.cascade.idle();
    await vi.waitFor(async () => expect(await acksOnChain(AD_TARGETING)).toEqual([AD_NETWORK.address]), { timeout: 10_000 });
    await vi.waitFor(async () => expect((await cascade(AD_TARGETING)).processors[0]!.ackedAt).not.toBeNull());
  });

  it("skips, with a warning, a processor Core holds no key for", async () => {
    const { CascadeEngine } = await import("../src/real/cascade");
    const warnings: string[] = [];
    const engine = new CascadeEngine({ ...config, processorKeys: {} }, core.repo, core.chain, core.indexer, () => {}, (m) => warnings.push(m));
    engine.onWithdrawn({ principal: PRINCIPAL, fiduciary: QL, purposeId: MARKETING, txHash: ZERO_HASH, at: 1 });
    await engine.idle();
    expect(warnings.some((m) => m.includes("no way to reach AdPartnerQ"))).toBe(true);
  });
});