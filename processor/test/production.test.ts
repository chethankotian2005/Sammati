// The Processor as it runs hosted (trd.md §10.2 to §10.4, §10.8): it never makes up a key in production, it checks its
// settings at start and /healthz is silent. Its route list is pinned in http.test.ts.
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { generateKeyPair } from "@sammati/shared/src/envelope";
import { hexlify } from "ethers";
import { createApp } from "../src/app";
import { readConfig } from "../src/config";
import { rig } from "./rig";

const KEY = hexlify(generateKeyPair().privateKey);

const production: NodeJS.ProcessEnv = {
  NODE_ENV: "production",
  PORT: "10000",
  PROCESSOR_KEY: KEY,
  CORE_URL: "https://core.example.com",
  CHAIN_RPC: "https://rpc.example.com/key",
  CHAIN_NETWORK: "amoy",
  PROCESSOR_EVENT_KEY: "another-long-secret",
  VAULT_PATH: "/var/data/processor.sqlite",
  CORS_ORIGINS: "https://app.example.com",
};

describe("the Processor's production configuration", () => {
  it("starts with exactly the documented variables, on PORT, with the key from the environment", () => {
    const c = readConfig(production);
    expect(c).toMatchObject({ production: true, port: 10000, host: "0.0.0.0", dbPath: "/var/data/processor.sqlite", coreUrl: "https://core.example.com", corsOrigins: ["https://app.example.com"] });
    expect(c.privateKey).toHaveLength(32);
  });

  it("never generates a key: without PROCESSOR_KEY it refuses to start, and says so", () => {
    const env = { ...production };
    delete env.PROCESSOR_KEY;
    expect(() => readConfig(env)).toThrow(/PROCESSOR_KEY \(missing\)/);
    expect(() => readConfig({ ...production, PROCESSOR_KEY: "0x1234" })).toThrow(/64 hex characters/);
  });

  it("an error about the key never prints the key", () => {
    try {
      readConfig({ ...production, PROCESSOR_KEY: "0xnot-hex-but-secret" });
    } catch (err) {
      expect(String(err)).not.toContain("secret");
    }
  });

  it("names every missing variable, refuses the default event key and a wildcard origin", () => {
    const env = { ...production };
    for (const name of ["CORE_URL", "VAULT_PATH", "CORS_ORIGINS"]) delete env[name];
    expect(() => readConfig(env)).toThrow(/CORE_URL \(missing\).*VAULT_PATH \(missing\).*CORS_ORIGINS \(missing\)/);
    expect(() => readConfig({ ...production, PROCESSOR_EVENT_KEY: "local-processor-events" })).toThrow(/PROCESSOR_EVENT_KEY/);
    expect(() => readConfig({ ...production, CORS_ORIGINS: "*" })).toThrow(/exact origins/);
    expect(() => readConfig({ ...production, DEV_TOOLS: "true" })).toThrow(/DEV_TOOLS=true is not allowed/);
  });

  it("outside production it still generates a key when none is given, and uses PROCESSOR_PORT, not the shared PORT", () => {
    expect(readConfig({ PORT: "4000" })).toMatchObject({ production: false, privateKey: null, port: 4200, corsOrigins: ["*"] });
  });
});

describe("the Processor's HTTP surface", () => {
  const r = rig();
  const lines: string[] = [];
  let server: Server;
  let url: string;
  let ready: () => Promise<void> = async () => {};

  beforeAll(() => {
    server = createApp(r.service, { ...r.config, production: true, corsOrigins: ["https://app.example.com"] }, (l) => lines.push(l), () => ready()).listen(0);
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise((res) => server.close(res)));

  it("/healthz answers ok and leaves no log line; /readyz reports the vault or the chain failing without naming anything", async () => {
    const before = lines.length;
    const res = await fetch(`${url}/healthz`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("ok");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(lines.length).toBe(before);

    expect(await (await fetch(`${url}/readyz`)).json()).toEqual({ ready: true });
    expect(lines.length).toBe(before); // a probe is not an access either
    ready = () => Promise.reject(new Error("the chain did not answer"));
    const down = await fetch(`${url}/readyz`);
    expect(down.status).toBe(503);
    expect(await down.json()).toEqual({ ready: false, reason: "the chain did not answer" });
  });

  it("allows only the listed browser origins", async () => {
    const ok = await fetch(`${url}/v1/processor/pubkey`, { headers: { origin: "https://app.example.com" } });
    expect(ok.headers.get("access-control-allow-origin")).toBe("https://app.example.com");
    const bad = await fetch(`${url}/v1/processor/pubkey`, { headers: { origin: "https://evil.example.net" } });
    expect(bad.headers.get("access-control-allow-origin")).toBeNull();
  });
});
