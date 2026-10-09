import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ZERO_HASH, hashEntry, purposeIdOf } from "@sammati/shared";
import { ENTRY_ID_HEADER, sammati, type SammatiGate, type SammatiOptions } from "../src/index";
import { ScriptedCore } from "./scriptedCore";

const FID = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const OTHER_FID = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC";
const USER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const CREDIT = purposeIdOf(FID, "credit_check");

let core: ScriptedCore;
let gate: SammatiGate | undefined;
let app: Server | undefined;
let appUrl: string;

/** A company endpoint guarded by the SDK. */
async function serve(options: Partial<SammatiOptions> = {}): Promise<SammatiGate> {
  gate = sammati({ coreUrl: core.url, fiduciary: FID, timeoutMs: 500, ...options });
  const company = express();
  company.get(
    "/customers/:id/credit-profile",
    gate.requireConsent({ purpose: "credit_check", principalFrom: (r) => r.header("x-sammati-principal") }),
    (_req, res) => res.json({ score: 742 }),
  );
  app = company.listen(0);
  appUrl = `http://127.0.0.1:${(app.address() as AddressInfo).port}`;
  if (options.liveCache !== false) {
    await vi.waitFor(() => expect(core.subscribed.length).toBeGreaterThan(0)); // the consent feed is live
    await new Promise((r) => setTimeout(r, 20)); // ...and the gateway has processed the acknowledgement
  }
  return gate;
}

const get = (principal?: string) => fetch(`${appUrl}/customers/1/credit-profile`, { headers: principal ? { "x-sammati-principal": principal } : {} });

const consentEvent = (status: "Active" | "Withdrawn", over: Record<string, unknown> = {}) => ({
  event: "consent.updated",
  principal: USER,
  fiduciary: FID,
  purposeId: CREDIT,
  purposeCode: "credit_check",
  status,
  expiresAt: Math.floor(Date.now() / 1000) + 3600,
  txHash: ZERO_HASH,
  at: Math.floor(Date.now() / 1000),
  ...over,
});

beforeEach(async () => {
  core = await new ScriptedCore().start();
});

afterEach(async () => {
  gate?.close();
  gate = undefined;
  await new Promise((r) => (app ? app.close(r) : r(null)));
  app = undefined;
  await core.stop();
});

describe("requireConsent", () => {
  it("allows a valid consent, tags the response with its log entry id, and logs ALLOWED", async () => {
    const g = await serve();
    const res = await get(USER);
    expect(res.status).toBe(200);
    const id = res.headers.get(ENTRY_ID_HEADER);
    expect(id).toMatch(/^[0-9a-f-]{36}$/);

    await g.flush();
    expect(core.logs).toHaveLength(1);
    expect(core.logs[0]).toMatchObject({ id, decision: "ALLOWED", reason: "OK", seq: 1, purposeCode: "credit_check", principal: USER, fiduciary: FID });
    expect(core.logs[0]!.endpoint).toBe("GET /customers/:id/credit-profile");
  });

  it.each([
    ["a missing principal", undefined],
    ["a malformed principal", "customer-4821"],
  ])("answers 451 NO_PRINCIPAL for %s without asking Core, and logs it", async (_label, principal) => {
    const g = await serve();
    const res = await get(principal);
    expect(res.status).toBe(451);
    expect(await res.json()).toMatchObject({ code: "NO_PRINCIPAL", message: expect.any(String) });
    expect(core.stateCalls).toBe(0);
    await g.flush();
    expect(core.logs[0]).toMatchObject({ decision: "BLOCKED", reason: "NO_PRINCIPAL", principal: "0x" + "00".repeat(20) });
  });

  it.each([
    ["CONSENT_WITHDRAWN", { status: "Withdrawn" }],
    ["CONSENT_EXPIRED", { status: "Active" }],
    ["NO_CONSENT", { status: "None" }],
  ] as const)("answers 451 %s with the reason in the body and logs it as BLOCKED", async (reason, extra) => {
    core.verdict = { valid: false, reason, expiresAt: null, ...extra };
    const g = await serve();
    const res = await get(USER);
    expect(res.status).toBe(451);
    expect(await res.json()).toMatchObject({ code: reason });
    expect(res.headers.get(ENTRY_ID_HEADER)).toBeTruthy();
    await g.flush();
    expect(core.logs[0]).toMatchObject({ decision: "BLOCKED", reason });
  });
});

describe("consent cache fed by the WebSocket", () => {
  it("answers repeat requests from the cache instead of asking Core each time", async () => {
    await serve();
    for (let i = 0; i < 5; i++) expect((await get(USER)).status).toBe(200);
    expect(core.stateCalls).toBe(1);
  });

  it("enforces a withdrawal pushed over the WebSocket on the very next request, without asking Core", async () => {
    await serve();
    expect((await get(USER)).status).toBe(200); // cached as valid
    expect(core.stateCalls).toBe(1);

    // Core's own consent-state would still say valid here: only the push can block the next request.
    core.push(consentEvent("Withdrawn"));
    await vi.waitFor(async () => expect((await get(USER)).status).toBe(451));
    const blocked = await get(USER);
    expect(await blocked.json()).toMatchObject({ code: "CONSENT_WITHDRAWN" });
    expect(core.stateCalls).toBe(1);
  });

  it("lets a pushed re-grant through again", async () => {
    core.verdict = { valid: false, reason: "CONSENT_WITHDRAWN", status: "Withdrawn", expiresAt: null };
    await serve();
    expect((await get(USER)).status).toBe(451);
    core.push(consentEvent("Active"));
    await vi.waitFor(async () => expect((await get(USER)).status).toBe(200));
  });

  it("ignores events about other companies, other people and other purposes", async () => {
    await serve();
    expect((await get(USER)).status).toBe(200);
    core.push(consentEvent("Withdrawn", { fiduciary: OTHER_FID }));
    core.push(consentEvent("Withdrawn", { principal: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" }));
    core.push(consentEvent("Withdrawn", { purposeId: purposeIdOf(FID, "marketing") }));
    await new Promise((r) => setTimeout(r, 100));
    expect((await get(USER)).status).toBe(200);
  });

  it("re-checks with Core once an entry is older than the TTL", async () => {
    await serve({ cacheTtlMs: 150 });
    await get(USER);
    await get(USER);
    expect(core.stateCalls).toBe(1);
    await new Promise((r) => setTimeout(r, 250));
    await get(USER);
    expect(core.stateCalls).toBe(2);
  });

  it("stops honouring a cached consent the moment its expiry passes", async () => {
    const soon = Math.floor(Date.now() / 1000) + 1;
    core.verdict = { valid: true, status: "Active", expiresAt: soon };
    await serve({ cacheTtlMs: 60_000 });
    expect((await get(USER)).status).toBe(200);
    await new Promise((r) => setTimeout(r, 1200));
    const res = await get(USER);
    expect(res.status).toBe(451);
    expect(await res.json()).toMatchObject({ code: "CONSENT_EXPIRED" });
    expect(core.stateCalls).toBe(1);
  });

  it("does not cache an answer that an event overtook while it was in flight", async () => {
    core.stateDelayMs = 250; // Core answers "valid" slowly...
    await serve();
    const first = get(USER);
    await new Promise((r) => setTimeout(r, 60));
    core.push(consentEvent("Withdrawn")); // ...and the withdrawal lands while it is on the way
    await first;

    core.stateDelayMs = 0;
    const next = await get(USER); // Core would still say valid; the pushed withdrawal must win
    expect(next.status).toBe(451);
    expect(await next.json()).toMatchObject({ code: "CONSENT_WITHDRAWN" });
  });

  it("does not trust the cache while the WebSocket is down, and rebuilds it after reconnecting", async () => {
    await serve();
    await get(USER);
    expect(core.stateCalls).toBe(1);

    core.wsEnabled = false;
    core.dropSockets();
    await vi.waitFor(async () => {
      await get(USER);
      await get(USER);
      expect(core.stateCalls).toBeGreaterThanOrEqual(3); // every request asks Core while the feed is down
    });

    // A withdrawal happens during the outage (no event reaches the gateway)...
    core.verdict = { valid: false, reason: "CONSENT_WITHDRAWN", status: "Withdrawn", expiresAt: null };
    expect((await get(USER)).status).toBe(451);

    // ...and when the feed returns, nothing from before the outage is believed.
    core.wsEnabled = true;
    await vi.waitFor(() => expect(core.connectedClients).toBe(1), { timeout: 5000 });
    await new Promise((r) => setTimeout(r, 50));
    const calls = core.stateCalls;
    expect((await get(USER)).status).toBe(451);
    expect(core.stateCalls).toBe(calls + 1);
    await get(USER);
    expect(core.stateCalls).toBe(calls + 1); // and it caches again
  });

  it("works without a live feed (liveCache: false) by asking Core every time", async () => {
    gate = sammati({ coreUrl: core.url, fiduciary: FID, liveCache: false });
    const company = express();
    company.get("/x", gate.requireConsent({ purpose: "credit_check", principalFrom: (r) => r.header("x-sammati-principal") }), (_req, res) => res.json({}));
    app = company.listen(0);
    appUrl = `http://127.0.0.1:${(app.address() as AddressInfo).port}`;
    for (let i = 0; i < 3; i++) await fetch(`${appUrl}/x`, { headers: { "x-sammati-principal": USER } });
    expect(core.stateCalls).toBe(3);
    expect(core.connectedClients).toBe(0);
  });
});

describe("failing closed", () => {
  it("answers 451 LEDGER_UNAVAILABLE when Core cannot verify, and does not cache that", async () => {
    core.stateDown = true;
    const g = await serve();
    const res = await get(USER);
    expect(res.status).toBe(451);
    expect(await res.json()).toMatchObject({ code: "LEDGER_UNAVAILABLE" });

    core.stateDown = false; // Core recovers: the very next request is let through again
    expect((await get(USER)).status).toBe(200);
    await g.flush();
    expect(core.logs.map((l) => l.reason)).toEqual(["LEDGER_UNAVAILABLE", "OK"]);
  });

  it("answers 451 LEDGER_UNAVAILABLE when Core is too slow", async () => {
    core.stateDelayMs = 1500;
    await serve({ timeoutMs: 200 });
    const res = await get(USER);
    expect(res.status).toBe(451);
    expect(await res.json()).toMatchObject({ code: "LEDGER_UNAVAILABLE" });
  });

  it("answers 451 LEDGER_UNAVAILABLE when Core is gone entirely, and still responds", async () => {
    await serve({ liveCache: false });
    await core.stop();
    const res = await get(USER);
    expect(res.status).toBe(451);
    expect(await res.json()).toMatchObject({ code: "LEDGER_UNAVAILABLE" });
    core = await new ScriptedCore().start(); // so afterEach has something to stop
  });
});

describe("access log", () => {
  it("hash-chains the entries it posts with a per-company seq", async () => {
    const g = await serve();
    for (let i = 0; i < 4; i++) await get(i % 2 ? undefined : USER);
    await g.flush();

    expect(core.logs.map((l) => l.seq)).toEqual([1, 2, 3, 4]);
    let prev = ZERO_HASH;
    for (const row of core.logs) {
      const { prevHash, hash, batchIndex, ...entry } = row;
      void batchIndex;
      expect(prevHash).toBe(prev);
      expect(hash).toBe(hashEntry(prev, entry));
      prev = hash;
    }
  });

  it("never holds the response back for the log write", async () => {
    core.logDelayMs = 400;
    const g = await serve();
    const started = Date.now();
    const res = await get(USER);
    expect(res.status).toBe(200);
    expect(Date.now() - started).toBeLessThan(300);
    expect(core.logs).toHaveLength(0); // not delivered yet...
    await g.flush();
    expect(core.logs).toHaveLength(1); // ...but it gets there
  });

  it("resumes seq and prevHash from Core, including after Core was reset under it", async () => {
    const g = await serve();
    await get(USER);
    await g.flush();
    core.logs.length = 0; // Core restarted with an empty log
    await get(USER);
    await g.flush();
    expect(core.logs.map((l) => l.seq)).toEqual([1]);
    expect(core.logs[0]!.prevHash).toBe(ZERO_HASH);

    // a second gateway process for the same company picks up where the first left off
    const second = sammati({ coreUrl: core.url, fiduciary: FID, liveCache: false, timeoutMs: 500 });
    const other = express();
    other.get("/y", second.requireConsent({ purpose: "credit_check", principalFrom: () => USER }), (_req, res) => res.json({}));
    const srv = other.listen(0);
    await fetch(`http://127.0.0.1:${(srv.address() as AddressInfo).port}/y`);
    await second.flush();
    expect(core.logs.map((l) => l.seq)).toEqual([1, 2]);
    srv.close();
  });

  it("drops new entries, with a warning, instead of growing without bound while Core is slow", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    core.logDelayMs = 100;
    const g = await serve({ maxQueuedLogs: 3 });
    await Promise.all(Array.from({ length: 10 }, () => get(USER)));
    await g.flush();
    expect(core.logs).toHaveLength(3);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("queue full"));
    warn.mockRestore();
  });
});

describe("logAccess (an access decided elsewhere, e.g. by the Processor)", () => {
  it("appends to the same hash chain as requireConsent and returns the entry id", async () => {
    const g = await serve();
    await get(USER); // seq 1, written by requireConsent
    const id = g.logAccess({ purpose: "credit_check", principal: USER, decision: "ALLOWED", reason: "OK", endpoint: "POST /v1/processor/evaluate", latencyMs: 7 });
    await g.flush();
    expect(core.logs.map((l) => l.seq)).toEqual([1, 2]);
    expect(core.logs[1]).toMatchObject({ id, decision: "ALLOWED", reason: "OK", endpoint: "POST /v1/processor/evaluate", principal: USER, purposeCode: "credit_check", latencyMs: 7 });
    expect(core.logs[1]!.prevHash).toBe(core.logs[0]!.hash);
  });

  it("records a block with its reason code", async () => {
    const g = await serve();
    g.logAccess({ purpose: "credit_check", principal: USER, decision: "BLOCKED", reason: "CONSENT_WITHDRAWN", endpoint: "POST /v1/processor/evaluate", latencyMs: 3 });
    await g.flush();
    expect(core.logs[0]).toMatchObject({ decision: "BLOCKED", reason: "CONSENT_WITHDRAWN" });
  });

  it("two writers on one company's chain both land, in order, after a sequence collision", async () => {
    const first = await serve({ liveCache: false });
    const second = sammati({ coreUrl: core.url, fiduciary: FID, liveCache: false, timeoutMs: 500 });
    const entry = { purpose: "credit_check", principal: USER, decision: "ALLOWED" as const, reason: "OK" as const, endpoint: "x", latencyMs: 1 };
    first.logAccess(entry);
    await first.flush();
    second.logAccess(entry); // knows nothing of the first entry: seq 1 is rejected, then it resumes
    first.logAccess(entry); // its cached head is now stale too
    await Promise.all([first.flush(), second.flush()]);
    expect(core.logs.map((l) => l.seq)).toEqual([1, 2, 3]);
    second.close();
  });

  it("writes addresses in EIP-55 form whatever case the caller used, because Core re-derives the hash from them", async () => {
    const g = await serve();
    expect((await get(USER.toLowerCase())).status).toBe(200); // requireConsent, lower-case header
    g.logAccess({ purpose: "credit_check", principal: USER.toLowerCase(), decision: "ALLOWED", reason: "OK", endpoint: "x", latencyMs: 1 }); // logAccess, lower-case
    await g.flush();
    expect(core.logs.map((l) => [l.principal, l.fiduciary])).toEqual([[USER, FID], [USER, FID]]);
    // the hash Core will recompute from the stored (EIP-55) row is the one the SDK chained
    for (const { prevHash, hash, batchIndex: _batch, ...entry } of core.logs) expect(hashEntry(prevHash, entry)).toBe(hash);
  });

  it("turns a malformed principal into the zero address instead of failing", async () => {
    const g = await serve();
    g.logAccess({ purpose: "credit_check", principal: "customer-4821", decision: "BLOCKED", reason: "NO_PRINCIPAL", endpoint: "x", latencyMs: 1 });
    await g.flush();
    expect(core.logs[0]!.principal).toBe("0x" + "00".repeat(20));
  });
});

describe("company API key (R-03)", () => {
  it("sends the key on the consent check and on the log, and works when Core accepts it", async () => {
    core.requireKey = "sk_test_key";
    await serve({ apiKey: "sk_test_key", liveCache: false });
    const res = await get(USER);
    expect(res.status).toBe(200);
    await gate!.flush();
    expect(core.logs).toHaveLength(1);
    expect(core.keysSeen.every((k) => k === "sk_test_key")).toBe(true);
  });

  it("fails closed with a clear 451 when Core does not know the key, and warns once", async () => {
    core.requireKey = "sk_right";
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await serve({ apiKey: "sk_wrong", liveCache: false });
    for (let i = 0; i < 3; i++) {
      const res = await get(USER);
      expect(res.status).toBe(451);
      const body = (await res.json()) as { code: string; message: string };
      expect(body.code).toBe("LEDGER_UNAVAILABLE");
      expect(body.message).toMatch(/API key/);
      expect(body.message).toMatch(/regulator approves/);
    }
    const keyWarnings = warn.mock.calls.filter((c) => String(c[0]).includes("INVALID_API_KEY"));
    expect(keyWarnings).toHaveLength(1);
    warn.mockRestore();
  });

  it("fails closed when no key is configured at all", async () => {
    core.requireKey = "sk_right";
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await serve({ liveCache: false });
    const res = await get(USER);
    expect(res.status).toBe(451);
    expect(((await res.json()) as { message: string }).message).toMatch(/API key/);
    expect(core.keysSeen[0]).toBeUndefined();
    warn.mockRestore();
  });

  it("says when the key belongs to another company", async () => {
    core.keyIsForSomeoneElse = true;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await serve({ apiKey: "sk_other", liveCache: false });
    const res = await get(USER);
    expect(res.status).toBe(451);
    expect(((await res.json()) as { message: string }).message).toMatch(/another company/);
    warn.mockRestore();
  });

  it("recovers once Core accepts the key again", async () => {
    core.requireKey = "sk_right";
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await serve({ apiKey: "sk_right", liveCache: false });
    core.requireKey = "sk_rotated";
    expect((await get(USER)).status).toBe(451);
    core.requireKey = "sk_right";
    expect((await get(USER)).status).toBe(200);
    warn.mockRestore();
  });
});
