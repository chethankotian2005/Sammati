// X-01: a fresh deployment holds nothing but infrastructure, the dev switch cannot sit beside production, and
// the default keys are refused on a public network.
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createRealApp } from "../src/app";
import { devToolsOn, readConfig } from "../src/config";
import { createRealCore, guardLocalKeys, type RealCore } from "../src/real/core";
import { realConfig, startTestChain, type TestChain } from "./harness";

let chain: TestChain;

beforeAll(async () => {
  chain = await startTestChain();
});
afterAll(async () => {
  await chain?.stop();
});

describe("a fresh deployment (X-01)", () => {
  let core: RealCore;
  let base: string;
  let server: ReturnType<typeof createServer>;

  beforeAll(async () => {
    // not createTestCore: no test company is loaded, so what is left is what the app itself creates
    core = await createRealCore(realConfig(chain), () => {}, () => {});
    server = createServer(createRealApp(core));
    await new Promise<void>((r) => server.listen(0, r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    core?.stop();
    await new Promise((r) => server?.close(r));
  });

  it("has no company, purpose, processor, credential, key, request, customer or log", () => {
    for (const table of ["fiduciaries", "purposes", "processors", "fiduciary_credentials", "fiduciary_keys", "processor_keys", "requests", "request_targets", "identities", "access_logs", "notifications", "fiduciary_applications", "sandbox_testers"]) {
      expect((core.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n, table).toBe(0);
    }
  });

  it("serves an empty directory and no pre-made consent request", async () => {
    expect(await (await fetch(`${base}/v1/fiduciaries`)).json()).toEqual({ fiduciaries: [] });
    expect((await fetch(`${base}/v1/requests/req_demo_quickloan?principal=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266`)).status).toBe(404);
  });

  it("answers health without a mode, and has no route that resets state or fabricates a decision", async () => {
    expect(await (await fetch(`${base}/v1/health`)).json()).toMatchObject({ ok: true, service: "sammati-core" });
    for (const [method, path] of [
      ["POST", "/v1/demo/reset"],
      ["POST", "/v1/demo/tamper/anything"],
      ["POST", "/v1/demo/" + "fi" + "re"],
      ["POST", "/v1/demo/withdraw"],
      ["POST", "/v1/demo/anchor"],
      ["GET", "/v1/demo/reset"],
    ]) {
      const res = await fetch(base + path, { method, headers: { "content-type": "application/json" }, body: method === "POST" ? "{}" : undefined });
      expect(res.status, `${method} ${path}`).toBe(404);
    }
  });
});

describe("DEV_TOOLS", () => {
  it("is off unless it is exactly true", () => {
    expect(readConfig({}).devTools).toBe(false);
    expect(readConfig({ DEV_TOOLS: "1" }).devTools).toBe(false);
    expect(readConfig({ DEV_TOOLS: "true" }).devTools).toBe(true);
  });

  it("fails startup beside NODE_ENV=production", () => {
    expect(() => readConfig({ DEV_TOOLS: "true", NODE_ENV: "production" })).toThrow(/NODE_ENV=production/);
    expect(() => devToolsOn({ DEV_TOOLS: "true", NODE_ENV: "production" })).toThrow();
    expect(() => readConfig({ NODE_ENV: "production" })).toThrow(/Missing or unusable environment variables/); // production needs its settings (trd.md §10.2)
  });
});

describe("the public default keys", () => {
  it("are refused on any chain but the local one, and allowed on it", () => {
    const config = realConfig(chain);
    const onChain = (chainId: number) => ({ deployment: { ...chain.deployment, chainId } }) as never;
    expect(() => guardLocalKeys(config, onChain(31337))).not.toThrow();
    expect(() => guardLocalKeys(config, onChain(80002))).toThrow(/must be your own keys/);
    expect(() => guardLocalKeys({ ...config, relayerKey: "0x" + "11".repeat(32), adminKey: "0x" + "22".repeat(32) }, onChain(80002))).not.toThrow();
  });
});
