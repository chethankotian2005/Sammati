import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ZERO_HASH, hashEntry, type ConsentStateResponse, type StoredAccessLogEntry } from "@sammati/shared";
import { sammati } from "../src/index";

const FID = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const USER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

// A minimal fake Core: a consent table plus the log endpoints the SDK uses.
let consent: Partial<ConsentStateResponse> & { valid: boolean } = { valid: true };
let coreDown = false;
const logged: StoredAccessLogEntry[] = [];

let coreServer: Server;
let appServer: Server;
let appUrl: string;

beforeAll(async () => {
  const core = express();
  core.use(express.json());
  core.get("/v1/gateway/consent-state", (_req, res) => {
    if (coreDown) return void res.status(503).json({});
    res.json(consent);
  });
  core.get("/v1/fiduciaries/:fid/access", (_req, res) => res.json({ items: logged.slice(-1) }));
  core.post("/v1/gateway/log", (req, res) => {
    const row = req.body as StoredAccessLogEntry;
    const last = logged[logged.length - 1];
    if (row.seq !== (last?.seq ?? 0) + 1) return void res.status(409).json({});
    logged.push(row);
    res.status(201).json({ accepted: true, seq: row.seq });
  });
  coreServer = core.listen(0);
  const coreUrl = `http://127.0.0.1:${(coreServer.address() as AddressInfo).port}`;

  const gate = sammati({ coreUrl, fiduciary: FID, timeoutMs: 500 });
  const app = express();
  app.get(
    "/customers/:id/credit-profile",
    gate.requireConsent({ purpose: "credit_check", principalFrom: (r) => r.header("x-sammati-principal") }),
    (_req, res) => res.json({ score: 742 }),
  );
  appServer = app.listen(0);
  appUrl = `http://127.0.0.1:${(appServer.address() as AddressInfo).port}`;
});

afterAll(() => {
  coreServer.close();
  appServer.close();
});

const get = (principal?: string) =>
  fetch(`${appUrl}/customers/1/credit-profile`, { headers: principal ? { "x-sammati-principal": principal } : {} });

async function logsReach(count: number): Promise<void> {
  for (let i = 0; i < 100 && logged.length < count; i++) await new Promise((r) => setTimeout(r, 10));
  expect(logged.length).toBe(count);
}

describe("requireConsent", () => {
  it("allows when Core says the consent is valid, and logs ALLOWED", async () => {
    consent = { valid: true };
    const res = await get(USER);
    expect(res.status).toBe(200);
    await logsReach(1);
    expect(logged[0]).toMatchObject({ decision: "ALLOWED", reason: "OK", seq: 1, purposeCode: "credit_check", principal: USER });
    expect(logged[0]!.endpoint).toBe("GET /customers/:id/credit-profile");
  });

  it("returns 451 with the reason code when consent is withdrawn", async () => {
    consent = { valid: false, reason: "CONSENT_WITHDRAWN" };
    const res = await get(USER);
    expect(res.status).toBe(451);
    expect(await res.json()).toMatchObject({ code: "CONSENT_WITHDRAWN" });
    await logsReach(2);
    expect(logged[1]).toMatchObject({ decision: "BLOCKED", reason: "CONSENT_WITHDRAWN", seq: 2 });
  });

  it("returns 451 NO_PRINCIPAL when the request names nobody", async () => {
    const res = await get();
    expect(res.status).toBe(451);
    expect(await res.json()).toMatchObject({ code: "NO_PRINCIPAL" });
    await logsReach(3);
  });

  it("fails closed with LEDGER_UNAVAILABLE when Core is down", async () => {
    coreDown = true;
    const res = await get(USER);
    expect(res.status).toBe(451);
    expect(await res.json()).toMatchObject({ code: "LEDGER_UNAVAILABLE" });
    coreDown = false;
    await logsReach(4);
  });

  it("hash-chains the entries it posts", () => {
    let prev = ZERO_HASH;
    for (const row of logged) {
      const { prevHash, hash, batchIndex, ...entry } = row;
      void batchIndex;
      expect(prevHash).toBe(prev);
      expect(hash).toBe(hashEntry(prev, entry));
      prev = hash;
    }
  });
});
