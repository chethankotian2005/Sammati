import type { AddressInfo } from "node:net";
import { createServer, type Server } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { purposeIdOf, type FiduciaryPurposesResponse, type RightsRequest, type RightsResponse } from "@sammati/shared";
import { createRealApp } from "../src/app";
import type { RealCore } from "../src/real/core";
import { createTestCore, realConfig, startTestChain, type TestChain } from "./harness";

import { TEST_CUSTOMER, TEST_COMPANIES } from "@sammati/test-fixtures";
const [QUICKLOAN, MEDICARE] = TEST_COMPANIES;
const QL = QUICKLOAN!.address;
const MC = MEDICARE!.address;
const ASHA = TEST_CUSTOMER;
const OTHER = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const UNKNOWN_COMPANY = "0x000000000000000000000000000000000000dEaD";

let chain: TestChain;
let dir: string;
let real: RealCore;
const servers: Server[] = [];
let realUrl: string;

async function serve(app: Parameters<typeof createServer>[1]): Promise<string> {
  const server = createServer(app);
  await new Promise<void>((r) => server.listen(0, r));
  servers.push(server);
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

beforeAll(async () => {
  chain = await startTestChain();
  dir = mkdtempSync(join(tmpdir(), "sammati-rights-"));
  real = await createTestCore(realConfig(chain, { dbPath: join(dir, "core.sqlite") }), () => {}, () => {});
  realUrl = await serve(createRealApp(real));
});

afterAll(async () => {
  for (const s of servers) await new Promise((r) => s.close(r));
  real?.stop();
  rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  await chain?.stop();
});

async function call<T = unknown>(base: string, method: string, path: string, body?: unknown): Promise<{ status: number; json: T }> {
  const res = await fetch(base + path, { method, headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, json: (await res.json()) as T };
}

describe("data rights", () => {
  const base = () => realUrl;
  const post = (body: unknown) => call<RightsRequest & { error?: { code: string } }>(base(), "POST", "/v1/rights", body);
  const list = (principal: string) => call<RightsResponse>(base(), "GET", `/v1/principals/${principal}/rights`);

  it("starts with nothing for a principal who has asked for nothing", async () => {
    const res = await list(OTHER);
    expect(res.status).toBe(200);
    expect(res.json).toEqual({ principal: OTHER, rights: [] });
  });

  it("records a request as an open status record with the fields the wallet parses", async () => {
    const res = await post({ principal: ASHA, fiduciary: QL, type: "erasure", note: "Please delete my marketing data" });
    expect(res.status).toBe(201);
    expect(res.json).toMatchObject({
      id: expect.stringMatching(/^rights_[0-9a-f]{8}$/),
      principal: ASHA,
      fiduciary: QL,
      type: "erasure",
      note: "Please delete my marketing data",
      status: "open",
      createdAt: expect.any(Number),
      updatedAt: expect.any(Number),
    });
    expect(res.json.createdAt).toBe(res.json.updatedAt);
  });

  it("lists them with the company's name, oldest first, and only for that principal", async () => {
    await new Promise((r) => setTimeout(r, 1100)); // distinct creation seconds make the order observable
    await post({ principal: ASHA, fiduciary: MC, type: "access" });
    await post({ principal: OTHER, fiduciary: QL, type: "grievance", note: "not asha's" });

    const { json } = await list(ASHA);
    expect(json.principal).toBe(ASHA);
    expect(json.rights.map((r) => [r.fiduciaryName, r.type, r.status])).toEqual([
      ["QuickLoan", "erasure", "open"],
      ["MediCare+", "access", "open"],
    ]);
    expect(json.rights[1]!.note).toBe(""); // no note: an empty string, never null (the wallet requires a string)
    expect((await list(OTHER)).json.rights.map((r) => r.note)).toEqual(["not asha's"]);
  });

  it("matches addresses regardless of letter case", async () => {
    const created = await post({ principal: ASHA.toLowerCase(), fiduciary: QL.toLowerCase(), type: "access", note: "lower case" });
    expect(created.status).toBe(201);
    expect(created.json.principal).toBe(ASHA); // stored and returned checksummed
    expect(created.json.fiduciary).toBe(QL);
    expect((await call<RightsResponse>(base(), "GET", `/v1/principals/${ASHA.toLowerCase()}/rights`)).json.rights.some((r) => r.note === "lower case")).toBe(true);
  });

  it.each([
    ["an unknown type", { principal: ASHA, fiduciary: QL, type: "delete-everything" }, 400],
    ["a missing type", { principal: ASHA, fiduciary: QL }, 400],
    ["a bad principal", { principal: "asha", fiduciary: QL, type: "access" }, 400],
    ["a missing fiduciary", { principal: ASHA, type: "access" }, 400],
    ["a note that is not text", { principal: ASHA, fiduciary: QL, type: "access", note: 42 }, 400],
    ["a company that does not exist", { principal: ASHA, fiduciary: UNKNOWN_COMPANY, type: "access" }, 404],
  ])("refuses %s, and records nothing", async (_label, body, status) => {
    const before = (await list(ASHA)).json.rights.length;
    const res = await post(body);
    expect(res.status).toBe(status);
    expect(res.json.error?.code).toBeDefined();
    expect((await list(ASHA)).json.rights).toHaveLength(before);
  });

  it("rejects a malformed principal address when listing", async () => {
    expect((await call(base(), "GET", "/v1/principals/not-an-address/rights")).status).toBe(400);
  });
});

describe("a company's purposes", () => {
  const base = () => realUrl;
  it("lists them with the ids, text and flags the console and the notice use", async () => {
    const { status, json } = await call<FiduciaryPurposesResponse>(base(), "GET", `/v1/fiduciaries/${QL}/purposes`);
    expect(status).toBe(200);
    expect(json.fiduciary).toBe(QL);
    expect(json.purposes.map((p) => p.code)).toEqual(["credit_check", "marketing", "bureau_share"]);
    for (const p of json.purposes) {
      expect(p.id).toBe(purposeIdOf(QL, p.code));
      expect(p.title.en).toBeTruthy();
      expect(p.description).toEqual(expect.objectContaining({ en: expect.any(String), hi: expect.any(String), kn: expect.any(String) }));
      expect(p.dataCategories.length).toBeGreaterThan(0);
      expect(p.retentionDays).toBeGreaterThan(0);
      expect(typeof p.sharesThirdParty).toBe("boolean");
      expect(typeof p.required).toBe("boolean");
    }
  });

  it("accepts the company address in any letter case, and 404s for an unknown company", async () => {
    expect((await call(base(), "GET", `/v1/fiduciaries/${MC.toLowerCase()}/purposes`)).status).toBe(200);
    expect((await call(base(), "GET", `/v1/fiduciaries/${UNKNOWN_COMPANY}/purposes`)).status).toBe(404);
  });
});

describe("persistence", () => {

  it("keeps rights requests across a restart on the same chain, and drops them when the chain is replaced", async () => {
    const dbPath = join(dir, "restart.sqlite");
    const first = await createTestCore(realConfig(chain, { dbPath }), () => {}, () => {});
    const url1 = await serve(createRealApp(first));
    await call(url1, "POST", "/v1/rights", { principal: ASHA, fiduciary: QL, type: "access", note: "persisted" });
    first.stop();

    const second = await createTestCore(realConfig(chain, { dbPath }), () => {}, () => {});
    const url2 = await serve(createRealApp(second));
    try {
      expect((await call<RightsResponse>(url2, "GET", `/v1/principals/${ASHA}/rights`)).json.rights.map((r) => r.note)).toEqual(["persisted"]);
      await second.reset();
      expect((await call<RightsResponse>(url2, "GET", `/v1/principals/${ASHA}/rights`)).json.rights).toEqual([]);
    } finally {
      second.stop();
    }
  });

  it("leaves registering purposes and processors at 501, as agreed", async () => {
    for (const path of [`/v1/fiduciaries/${QL}/purposes`, `/v1/fiduciaries/${QL}/processors`]) {
      const res = await call<{ error: { code: string } }>(realUrl, "POST", path, {});
      expect(res.status, path).toBe(501);
      expect(res.json.error.code).toBe("NOT_IMPLEMENTED");
    }
  });
});
