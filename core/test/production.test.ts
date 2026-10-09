// Production configuration and the boot-time app (trd.md §10.2, §10.3, §10.6): no chain needed.
import type { AddressInfo } from "node:net";
import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LOCAL_ADMIN_KEY, LOCAL_RELAYER_KEY } from "@sammati/shared";
import { createBootApp } from "../src/app";
import { readConfig } from "../src/config";

const RELAYER = `0x${"11".repeat(32)}`;
const ADMIN = `0x${"22".repeat(32)}`;

const production: NodeJS.ProcessEnv = {
  NODE_ENV: "production",
  PORT: "10000",
  PUBLIC_CORE_URL: "https://core.example.com",
  PROCESSOR_PUBLIC_URL: "https://processor.example.com",
  CHAIN_RPC: "https://rpc.example.com/key",
  CHAIN_NETWORK: "amoy",
  RELAYER_KEY: RELAYER,
  ADMIN_KEY: ADMIN,
  REGULATOR_KEY: "a-long-secret-code",
  PROCESSOR_EVENT_KEY: "another-long-secret",
  CORS_ORIGINS: "https://app.example.com, https://sammati.example.org/",
  DB_PATH: "/var/data/sammati.sqlite",
};

describe("Core's production configuration", () => {
  it("starts with exactly the documented variables", () => {
    const c = readConfig(production);
    expect(c).toMatchObject({
      production: true,
      port: 10000,
      host: "0.0.0.0",
      publicUrl: "https://core.example.com",
      dbPath: "/var/data/sammati.sqlite",
      corsOrigins: ["https://app.example.com", "https://sammati.example.org"],
      requireOperatorAuth: true,
      wipeOnChainChange: false,
    });
  });

  it("names every missing variable in one message", () => {
    const env = { ...production };
    for (const name of ["PUBLIC_CORE_URL", "RELAYER_KEY", "CORS_ORIGINS", "DB_PATH"]) delete env[name];
    expect(() => readConfig(env)).toThrow(/PUBLIC_CORE_URL \(missing\).*RELAYER_KEY \(missing\).*CORS_ORIGINS \(missing\).*DB_PATH \(missing\)/);
  });

  it("refuses the published defaults and a public URL that is not https", () => {
    expect(() => readConfig({ ...production, RELAYER_KEY: LOCAL_RELAYER_KEY })).toThrow(/RELAYER_KEY \(it is a published default\)/);
    expect(() => readConfig({ ...production, ADMIN_KEY: LOCAL_ADMIN_KEY })).toThrow(/ADMIN_KEY/);
    expect(() => readConfig({ ...production, REGULATOR_KEY: "demo-regulator-key" })).toThrow(/REGULATOR_KEY/);
    expect(() => readConfig({ ...production, PROCESSOR_EVENT_KEY: "local-processor-events" })).toThrow(/PROCESSOR_EVENT_KEY/);
    expect(() => readConfig({ ...production, PUBLIC_CORE_URL: "http://192.168.1.5:4000" })).toThrow(/PUBLIC_CORE_URL \(must be an https/);
  });

  it("accepts no wildcard origin, and no DEV_TOOLS", () => {
    expect(() => readConfig({ ...production, CORS_ORIGINS: "*" })).toThrow(/exact origins/);
    expect(() => readConfig({ ...production, DEV_TOOLS: "true" })).toThrow(/DEV_TOOLS=true is not allowed/);
  });

  it("changes nothing outside production: local defaults, any origin, nothing enforced", () => {
    expect(readConfig({})).toMatchObject({ production: false, publicUrl: "http://localhost:4000", corsOrigins: ["*"], requireOperatorAuth: false, wipeOnChainChange: true });
  });

  it("takes the RPC and fee settings from the environment, with Amoy's priority fee built in", () => {
    const c = readConfig({ ...production, INDEXER_INTERVAL_MS: "4000", RECEIPT_POLL_MS: "2000", LOG_CHUNK_BLOCKS: "500", RPC_BACKOFF_MAX_MS: "30000", GAS_PRIORITY_FEE_GWEI: "40", GAS_LIMIT_MULTIPLIER: "1.5" });
    expect(c).toMatchObject({ indexerIntervalMs: 4000, receiptPollMs: 2000, logChunkBlocks: 500, rpcBackoffMaxMs: 30000, gas: { priorityFeeGwei: 40, maxFeeGwei: null, limitMultiplier: 1.5 } });
  });
});

describe("the app that answers while Core boots", () => {
  let server: Server;
  let base: string;
  beforeAll(async () => {
    server = createServer(createBootApp({ ...readConfig(production) }));
    await new Promise<void>((r) => server.listen(0, r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    await new Promise((r) => server.close(r));
  });

  it("answers /healthz at once with a bare ok, and nothing else is ready yet", async () => {
    const health = await fetch(`${base}/healthz`);
    expect(health.status).toBe(200);
    expect(await health.text()).toBe("ok");
    const other = await fetch(`${base}/v1/fiduciaries`);
    expect(other.status).toBe(503);
    expect(other.headers.get("retry-after")).toBe("2");
    expect(await other.json()).toMatchObject({ error: { code: "STARTING" } });
  });

  it("sends the security headers and never X-Powered-By", async () => {
    const res = await fetch(`${base}/healthz`);
    expect(res.headers.get("x-powered-by")).toBeNull();
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("x-frame-options")).toBe("DENY");
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
    expect(res.headers.get("strict-transport-security")).toMatch(/max-age/);
    expect(res.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
  });

  it("allows only listed browser origins; a client with no Origin is untouched", async () => {
    const allowed = await fetch(`${base}/v1/fiduciaries`, { headers: { origin: "https://app.example.com" } });
    expect(allowed.headers.get("access-control-allow-origin")).toBe("https://app.example.com");
    expect(allowed.headers.get("vary")).toContain("Origin");
    const stranger = await fetch(`${base}/v1/fiduciaries`, { headers: { origin: "https://evil.example.net" } });
    expect(stranger.headers.get("access-control-allow-origin")).toBeNull();
    const none = await fetch(`${base}/v1/fiduciaries`);
    expect(none.headers.get("access-control-allow-origin")).toBeNull();
    const preflight = await fetch(`${base}/v1/consents/grant`, { method: "OPTIONS", headers: { origin: "https://app.example.com", "access-control-request-method": "POST" } });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-origin")).toBe("https://app.example.com");
  });
});
