// Core as it runs hosted (trd.md §10.3 to §10.8), against a real chain: /healthz and /readyz, the logins production
// enforces, the surface of the HTTP API, the RPC-friendly indexer and the fee policy, and the refusal to wipe a
// production database on a chain mismatch.
import type { AddressInfo } from "node:net";
import { createServer, type Server } from "node:http";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { Network, Wallet, parseUnits } from "ethers";
import type { Express } from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { API_KEY_HEADER, GRANT_CONSENT_TYPE, REGULATOR_KEY_HEADER, purposeIdOf, type RequestNotice, type WsEvent } from "@sammati/shared";
import { TEST_COMPANIES, testApiKey } from "@sammati/test-fixtures";
import { createRealApp } from "../src/app";
import type { Config } from "../src/config";
import { TunedProvider } from "../src/real/chain";
import { createRealCore, type RealCore } from "../src/real/core";
import { createTestCore, realConfig, startTestChain, type TestChain } from "./harness";

const QL = TEST_COMPANIES[0]!;
const REGULATOR = "a-long-regulator-code";
const ORIGIN = "https://app.example.com";
const unix = () => Math.floor(Date.now() / 1000);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let chain: TestChain;
let dir: string;
let config: Config;
let core: RealCore;
let app: Express;
let server: Server;
let base: string;
const published: WsEvent[] = [];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function api<T = any>(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<{ status: number; json: T; headers: Headers }> {
  const res = await fetch(base + path, {
    method,
    headers: { ...(body ? { "content-type": "application/json" } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, json: (text ? JSON.parse(text) : null) as T, headers: res.headers };
}

/** Counts every JSON-RPC call Core's provider makes. */
function countRpc(): { calls: string[]; stop(): void } {
  const provider = core.chain.provider;
  const original = provider.send.bind(provider);
  const calls: string[] = [];
  provider.send = (method: string, params: unknown[] | Record<string, unknown>) => {
    calls.push(method);
    return original(method, params);
  };
  return { calls, stop: () => void (provider.send = original) };
}

beforeAll(async () => {
  chain = await startTestChain();
  dir = mkdtempSync(join(tmpdir(), "sammati-hosted-"));
  config = realConfig(chain, {
    dbPath: join(dir, "core.sqlite"),
    production: true,
    requireOperatorAuth: true,
    wipeOnChainChange: false,
    corsOrigins: [ORIGIN],
    regulatorKey: REGULATOR,
    processorEventKey: "test-processor-events",
  });
  core = await createTestCore(config, (e) => void published.push(e), () => {});
  app = createRealApp(core);
  server = createServer(app);
  await new Promise<void>((r) => server.listen(0, r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  core?.stop();
  await new Promise((r) => server?.close(r));
  await chain?.stop();
  rmSync(dir, { recursive: true, force: true });
});

describe("/healthz and /readyz", () => {
  it("/healthz answers ok and touches no chain, database, log, anchor or socket", async () => {
    const tables = ["access_logs", "ledger_events", "anchor_batches", "notifications", "indexer_state"];
    const count = () => tables.map((t) => (core.db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number }).n);
    const before = count();
    const events = published.length;
    const rpc = countRpc();
    for (let i = 0; i < 5; i++) {
      const plain = await fetch(`${base}/healthz`);
      expect(plain.status).toBe(200);
      expect(await plain.text()).toBe("ok");
    }
    rpc.stop();
    expect(rpc.calls).toEqual([]);
    expect(count()).toEqual(before);
    expect(published.length).toBe(events);
  });

  it("/readyz checks the database and the chain, and its failure never names the RPC address", async () => {
    const ok = await api("GET", "/readyz");
    expect(ok).toMatchObject({ status: 200, json: { ready: true } });

    const provider = core.chain.provider;
    const original = provider.getBlockNumber.bind(provider);
    provider.getBlockNumber = () => Promise.reject(new Error(`could not detect network (requestUrl=${chain.rpc})`));
    const down = await api("GET", "/readyz");
    provider.getBlockNumber = original;
    expect(down.status).toBe(503);
    expect(down.json).toEqual({ ready: false, reason: "the chain did not answer" });
  });
});

describe("the logins production enforces", () => {
  const company = (path = "") => `/v1/fiduciaries/${QL.address}${path}`;
  const email = "ops@quickloan.example";
  const password = "correct horse battery staple";

  beforeAll(() => {
    core.db.prepare("INSERT OR IGNORE INTO console_operators (email, password_hash, created_at) VALUES (?, ?, ?)").run(email, createHash("sha256").update(password).digest("hex"), unix());
    core.db.prepare("INSERT OR IGNORE INTO fiduciary_operators (fiduciary, operator_email) VALUES (?, ?)").run(QL.address, email);
  });

  it("the Auditor needs the regulator's code on every route", async () => {
    for (const [method, path] of [["GET", "/v1/audit/fiduciaries"], ["GET", "/v1/audit/ledger"], ["POST", `/v1/audit/verify/${QL.address}`], ["GET", `/v1/audit/report/${QL.address}`]] as const) {
      expect((await api(method, path)).status, `${method} ${path}`).toBe(401);
      expect((await api(method, path, undefined, { [REGULATOR_KEY_HEADER]: "wrong" })).status).toBe(401);
      expect((await api(method, path, undefined, { [REGULATOR_KEY_HEADER]: REGULATOR })).status, `${method} ${path}`).toBe(200);
    }
  });

  it("a company's customers and access log need its operator's token or its own API key", async () => {
    for (const path of [company("/consents"), company("/access")]) {
      expect((await api("GET", path)).status, path).toBe(403);
      expect((await api("GET", path, undefined, { [API_KEY_HEADER]: testApiKey(TEST_COMPANIES[1]!.slug) })).status, "another company's key").toBe(403);
      expect((await api("GET", path, undefined, { [API_KEY_HEADER]: testApiKey(QL.slug) })).status, path).toBe(200);
    }
    const token = (await api("POST", "/v1/console/login", { email, password })).json.token as string;
    expect((await api("GET", company("/consents"), undefined, { authorization: `Bearer ${token}` })).status).toBe(200);
    expect((await api("GET", `/v1/fiduciaries/${TEST_COMPANIES[1]!.address}/consents`, undefined, { authorization: `Bearer ${token}` })).status, "another company").toBe(403);
  });

  it("creating a request from the console needs the operator's token", async () => {
    const body = { purposes: ["credit_check"], customerAlias: "Customer #1" };
    expect((await api("POST", company("/requests"), body)).status).toBe(401);
    const token = (await api("POST", "/v1/console/login", { email, password })).json.token as string;
    expect((await api("POST", company("/requests"), body, { authorization: `Bearer ${token}` })).status).toBe(201);
  });

  it("sign-in is rate limited", async () => {
    let last = 0;
    for (let i = 0; i < 12; i++) last = (await api("POST", "/v1/console/login", { email, password: "wrong" })).status;
    expect(last).toBe(429);
  });

  it("the web's origin is allowed and a stranger's is not", async () => {
    const ok = await api("GET", "/v1/fiduciaries", undefined, { origin: ORIGIN });
    expect(ok.headers.get("access-control-allow-origin")).toBe(ORIGIN);
    const bad = await api("GET", "/v1/fiduciaries", undefined, { origin: "https://evil.example.net" });
    expect(bad.headers.get("access-control-allow-origin")).toBeNull();
  });
});

describe("the surface of the HTTP API", () => {
  /** Every "METHOD /path" Core registers. The routers all hang under /v1. */
  function routes(): string[] {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const walk = (stack: any[], prefix: string): string[] =>
      stack.flatMap((layer) => {
        if (layer.route) return Object.keys(layer.route.methods).map((m) => `${m.toUpperCase()} ${prefix}${layer.route.path}`);
        return layer.name === "router" ? walk(layer.handle.stack, "/v1") : [];
      });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return walk((app as any)._router.stack, "");
  }

  it("has no route that resets state, edits a log, or reaches a development tool", () => {
    const all = routes();
    expect(all.length).toBeGreaterThan(40);
    expect(all.filter((r) => /reset|tamper|wipe|clear|purge|truncate|erase|debug|demo|\/dev\b|seed/i.test(r))).toEqual([]);
  });

  it("has no PUT or PATCH, and one DELETE (the regulator's test-customer list)", () => {
    const all = routes();
    expect(all.filter((r) => /^(PUT|PATCH) /.test(r))).toEqual([]);
    expect(all.filter((r) => r.startsWith("DELETE "))).toEqual(["DELETE /v1/regulator/test-principals/:principal"]);
  });

  it("the log is append-only over HTTP: the only writer of access entries is the company's gateway endpoint", () => {
    const writers = routes().filter((r) => /access|\/log\b/i.test(r) && !r.startsWith("GET "));
    expect(writers).toEqual(["POST /v1/gateway/log"]);
  });

  it("every route that returns data from the vault is absent: Core has no vault read at all", () => {
    expect(routes().filter((r) => /vault/i.test(r))).toEqual(["POST /v1/events/vault"]);
  });
});

describe("RPC friendliness", () => {
  it("a poll with no new block makes one call, and re-checks the saved block only now and then", async () => {
    await core.indexer.syncOnce(); // catch up
    const rpc = countRpc();
    for (let i = 0; i < 10; i++) await core.indexer.syncOnce();
    rpc.stop();
    expect(rpc.calls.filter((m) => m === "eth_blockNumber")).toHaveLength(10);
    expect(rpc.calls.filter((m) => m === "eth_getBlockByNumber").length).toBeLessThanOrEqual(1);
    expect(rpc.calls.filter((m) => m === "eth_getLogs")).toHaveLength(0);
  });

  it("failed polls back off exponentially, then return to the normal pace after one success", async () => {
    const provider = core.chain.provider;
    const original = provider.getBlockNumber.bind(provider);
    const stamps: number[] = [];
    let failing = 4;
    provider.getBlockNumber = () => {
      stamps.push(Date.now());
      return failing-- > 0 ? Promise.reject(new Error("429 Too Many Requests")) : original();
    };
    const quiet = Object.create(core.indexer) as typeof core.indexer;
    quiet.start(40, 2000);
    await sleep(40 * (2 + 4 + 8 + 16) * 1.3 + 400);
    quiet.stop();
    provider.getBlockNumber = original;
    expect(stamps.length).toBeGreaterThanOrEqual(5);
    const gaps = stamps.slice(1).map((t, i) => t - stamps[i]!);
    expect(gaps[2]!).toBeGreaterThan(gaps[0]! * 1.5); // each wait is longer than the one before
  });

  it("a grant relayed by Core is in the cache when the response arrives, without waiting for a poll", async () => {
    const who = Wallet.createRandom();
    const created = (await api("POST", `/v1/fiduciaries/${QL.address}/requests`, { purposes: ["credit_check"], customerAlias: "Customer #2" }, { [API_KEY_HEADER]: testApiKey(QL.slug) })).json;
    const notice = (await api<RequestNotice>("GET", `/v1/requests/${created.requestId}?principal=${who.address}`)).json;
    const message = { principal: who.address, fiduciary: QL.address, purposeId: purposeIdOf(QL.address, "credit_check"), expiresAt: unix() + 3600, noticeHash: notice.noticeHash, nonce: notice.nonce, deadline: unix() + 600 };
    const signature = await who.signTypedData(notice.domain, { GrantConsent: [...GRANT_CONSENT_TYPE] }, message);
    const before = core.repo.getState("last_block");
    expect((await api("POST", "/v1/consents/grant", { request: message, signature })).status).toBe(200);
    expect(core.repo.cachedConsent(who.address, QL.address, purposeIdOf(QL.address, "credit_check"))?.status).toBe("Active");
    expect(core.repo.getState("last_block")).toBe(before); // the poller has not run: the receipt did it
  });

  it("one fee policy: Amoy's minimum priority fee is built in, and the environment overrides it", async () => {
    const network = Network.from(31337);
    const make = (gas: Config["gas"], chainId: number) => new TunedProvider(chain.rpc, network, { staticNetwork: network }, gas, chainId);
    const amoy = make({ priorityFeeGwei: null, maxFeeGwei: null, limitMultiplier: 1 }, 80002);
    const fees = await amoy.getFeeData();
    expect(fees.maxPriorityFeePerGas).toBe(parseUnits("25", "gwei"));
    expect(fees.maxFeePerGas!).toBeGreaterThanOrEqual(fees.maxPriorityFeePerGas!);
    const custom = await make({ priorityFeeGwei: 40, maxFeeGwei: 100, limitMultiplier: 1 }, 80002).getFeeData();
    expect([custom.maxPriorityFeePerGas, custom.maxFeePerGas]).toEqual([parseUnits("40", "gwei"), parseUnits("100", "gwei")]);
    const local = await make({ priorityFeeGwei: null, maxFeeGwei: null, limitMultiplier: 1 }, 31337).getFeeData();
    expect(local.maxPriorityFeePerGas).not.toBe(parseUnits("25", "gwei")); // no built-in floor on the local chain
    for (const p of [amoy]) p.destroy();
  });

  it("the gas estimate is multiplied", async () => {
    const network = Network.from(31337);
    const tx = { to: Wallet.createRandom().address, value: 1n, from: new Wallet(`0x${"33".repeat(32)}`).address };
    const plain = new TunedProvider(chain.rpc, network, { staticNetwork: network }, { priorityFeeGwei: null, maxFeeGwei: null, limitMultiplier: 1 }, 31337);
    const padded = new TunedProvider(chain.rpc, network, { staticNetwork: network }, { priorityFeeGwei: null, maxFeeGwei: null, limitMultiplier: 1.5 }, 31337);
    await chain.provider.send("hardhat_setBalance", [tx.from, "0x56BC75E2D63100000"]);
    expect(await padded.estimateGas(tx)).toBe((await plain.estimateGas(tx)) * 150n / 100n);
    plain.destroy();
    padded.destroy();
  });
});

describe("a different chain never erases a production database", () => {
  it("refuses to start on CHAIN_MISMATCH and leaves the data alone; the local rule still wipes", async () => {
    const file = config.dbPath;
    const hasData = (): number => {
      const db = new Database(file, { readonly: true });
      try {
        return (db.prepare("SELECT COUNT(*) AS n FROM fiduciaries").get() as { n: number }).n;
      } finally {
        db.close();
      }
    };
    expect(hasData()).toBeGreaterThan(0);
    await new Promise((r) => server.close(r));
    core.stop();

    await chain.reset(); // the RPC now reports a different chain from the one the database describes
    await expect(createRealCore(config, () => {}, () => {})).rejects.toThrow(/CHAIN_MISMATCH/);
    expect(hasData()).toBeGreaterThan(0);

    const local = await createRealCore({ ...config, production: false, wipeOnChainChange: true }, () => {}, () => {});
    local.stop();
    expect(hasData()).toBe(0);
  });
});
