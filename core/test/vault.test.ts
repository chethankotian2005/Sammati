import type { AddressInfo } from "node:net";
import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { WsEvent } from "@sammati/shared";
import { createApp } from "../src/app";
import { readConfig } from "../src/config";
import { StubStore } from "../src/store";
import { sanitiseResult } from "../src/routes/vault";
import { topicsFor } from "../src/ws";

const KEY = "test-event-key";
const PRINCIPAL = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const FIDUCIARY = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const HANDLE = "0x" + "ab".repeat(32);
const HASH = "0x" + "cd".repeat(32);

const published: WsEvent[] = [];
let server: Server;
let url: string;

beforeAll(async () => {
  const config = readConfig({ PROCESSOR_EVENT_KEY: KEY, PROCESSOR_PUBLIC_URL: "http://192.168.1.5:4200" });
  server = createServer(createApp({ store: new StubStore(config), config, publish: (e) => published.push(e) }));
  await new Promise<void>((r) => server.listen(0, r));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
});
afterAll(() => new Promise((r) => server.close(r)));

const base = { principal: PRINCIPAL.toLowerCase(), fiduciary: FIDUCIARY.toLowerCase(), purposeCode: "credit_check", handle: HANDLE, at: 1760000000, atMs: 1760000000123 };
const post = (body: unknown, key: string | null = KEY) =>
  fetch(`${url}/events/vault`, { method: "POST", headers: { "content-type": "application/json", ...(key ? { "x-sammati-processor-key": key } : {}) }, body: JSON.stringify(body) });

const valid: Record<string, Record<string, unknown>> = {
  "vault.encrypted": { ciphertextHash: HASH, sizeBytes: 300 },
  "vault.stored": { ciphertextHash: HASH, sizeBytes: 300 },
  "processor.requested": { action: "loan_decision", requestedAt: 1760000000123 },
  "processor.decrypting": { decryptingAt: 1760000000150 },
  "processor.decided": { decision: "approved", limit: 300000, reasonCodes: ["SCORE_FAIR"], entryId: "0b4e6c3a-1111-4222-8333-444455556666", durationMs: 9 },
  "vault.erased": { cause: "withdrawn" },
};

describe("GET /v1/processor", () => {
  it("tells the wallet where the Processor is", async () => {
    const res = await fetch(`${url}/processor`);
    expect(await res.json()).toEqual({ url: "http://192.168.1.5:4200" });
  });
});

describe("POST /v1/events/vault", () => {
  it("refuses a missing or wrong key", async () => {
    expect((await post({ event: "vault.erased", ...base, cause: "withdrawn" }, null)).status).toBe(401);
    expect((await post({ event: "vault.erased", ...base, cause: "withdrawn" }, "nope")).status).toBe(401);
    expect(published).toHaveLength(0);
  });

  for (const [name, extra] of Object.entries(valid)) {
    it(`accepts ${name} and publishes exactly its fields`, async () => {
      published.length = 0;
      const res = await post({ event: name, ...base, ...extra });
      expect(res.status).toBe(202);
      expect(published).toHaveLength(1);
      expect(published[0]).toEqual({ event: name, ...base, principal: PRINCIPAL, fiduciary: FIDUCIARY, ...extra });
    });
  }

  it("drops any field that is not on the allow-list, so nothing can ride along", async () => {
    published.length = 0;
    await post({ event: "vault.stored", ...base, ...valid["vault.stored"], plaintext: "ABCDE1234F", envelope: { ciphertext: "0x00" }, pan: "ABCDE1234F" });
    expect(JSON.stringify(published)).not.toContain("ABCDE1234F");
    expect(Object.keys(published[0]!).sort()).toEqual(["at", "atMs", "ciphertextHash", "event", "fiduciary", "handle", "principal", "purposeCode", "sizeBytes"]);
  });

  it.each([
    ["an unknown event", { event: "vault.leaked", ...base }],
    ["a missing field", { event: "vault.stored", ...base, ciphertextHash: HASH }],
    ["free text where a hash belongs", { event: "vault.stored", ...base, ciphertextHash: "ABCDE1234F", sizeBytes: 1 }],
    ["free text as an entry id", { event: "processor.decided", ...base, ...valid["processor.decided"], entryId: "ABCDE1234F" }],
    ["free text as a decision code", { event: "processor.decided", ...base, ...valid["processor.decided"], reasonCodes: ["PAN is ABCDE1234F"] }],
    ["an unknown erase cause", { event: "vault.erased", ...base, cause: "because" }],
    ["a bad purpose code", { event: "vault.erased", ...base, cause: "withdrawn", purposeCode: "ABCDE1234F" }],
    ["a missing millisecond time", { event: "vault.erased", ...base, cause: "withdrawn", atMs: undefined }],
    ["a bad address", { event: "vault.erased", ...base, cause: "withdrawn", principal: "asha" }],
  ])("rejects %s", async (_name, body) => {
    published.length = 0;
    const res = await post(body);
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("BAD_EVENT");
    expect(published).toHaveLength(0);
  });
});

describe("who receives vault events", () => {
  it("the customer, the company and the auditor, never anyone else", () => {
    for (const [name, extra] of Object.entries(valid)) {
      const topics = topicsFor({ event: name, ...base, principal: PRINCIPAL, fiduciary: FIDUCIARY, ...extra } as unknown as WsEvent);
      expect(topics.sort()).toEqual(["auditor", `fiduciary:${FIDUCIARY.toLowerCase()}`, `principal:${PRINCIPAL.toLowerCase()}`]);
    }
  });
});

describe("sanitiseResult (what /v1/demo/fire relays from a company)", () => {
  it("passes a loan decision and a vault view, rebuilt field by field", () => {
    expect(sanitiseResult({ decision: "approved", limit: 300000, reasonCodes: ["SCORE_FAIR"], pan: "ABCDE1234F" })).toEqual({ decision: "approved", limit: 300000, reasonCodes: ["SCORE_FAIR"] });
    expect(sanitiseResult({ handle: HANDLE, ciphertextHash: HASH, status: "stored", extra: "x" })).toEqual({ handle: HANDLE, ciphertextHash: HASH, status: "stored" });
    expect(sanitiseResult({ handle: null, ciphertextHash: null, status: "none" })).toEqual({ handle: null, ciphertextHash: null, status: "none" });
  });

  it("drops everything else, in particular a raw credit profile", () => {
    expect(sanitiseResult({ pan: "ABCDE1234F", incomeBand: "6-9 LPA", score: 742 })).toBeUndefined();
    expect(sanitiseResult({ decision: "approved", limit: 1.5, reasonCodes: [] })).toBeUndefined();
    expect(sanitiseResult({ decision: "approved", limit: 1, reasonCodes: ["PAN ABCDE1234F"] })).toBeUndefined();
    expect(sanitiseResult({ status: "stored", handle: "ABCDE1234F", ciphertextHash: null })).toBeUndefined();
    expect(sanitiseResult("ABCDE1234F")).toBeUndefined();
  });
});
