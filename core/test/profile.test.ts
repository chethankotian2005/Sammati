// Account creation and the profile (W-15 to W-17; trd.md §6.1, §4.6; drd.md §1 hard rule): against the real Core, with
// a real chain. Core must answer only what an ID picker and a consent list need, and must never hold a profile value.
import type { AddressInfo } from "node:net";
import { createServer, type Server } from "node:http";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Wallet } from "ethers";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { GRANT_CONSENT_TYPE, purposeIdOf, type PrincipalConsentsResponse, type RequestNotice, type WsEvent } from "@sammati/shared";
import { createRealApp } from "../src/app";
import type { Config } from "../src/config";
import type { RealCore } from "../src/real/core";
import { RollingLimiter } from "../src/real/onboarding";
import { createTestCore, realConfig, startTestChain, type TestChain } from "./harness";
import { TEST_COMPANIES } from "@sammati/test-fixtures";

const QL = TEST_COMPANIES[0]!.address;
const unix = () => Math.floor(Date.now() / 1000);

// A profile of values that appear nowhere else in the repository. None of them may be found in anything Core holds.
const PROFILE = {
  fullName: "Zebulon Quillfeather",
  dob: "1987-03-14",
  mobile: "9123456780",
  email: "zebulon.quillfeather@profile-test.example",
  address: "77 Marigold Lane, Quillford",
  pan: "QZXWV9876K",
  employer: "Quillfeather Holdings",
  bloodGroup: "AB-",
  allergies: "Quillfeather pollen",
  insurancePolicy: "QFH-2087-4410",
  deliveryAddress: "9 Tamarind Court, Quillford",
};

let chain: TestChain;
let core: RealCore;
let server: Server;
let base: string;
let config: Config;
let dir: string;
const published: WsEvent[] = [];
const logged: string[] = [];
const bodies: string[] = [];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function api<T = any>(method: string, path: string, body?: unknown): Promise<{ status: number; json: T; headers: Headers }> {
  const res = await fetch(base + path, { method, headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  bodies.push(text);
  return { status: res.status, json: (text ? JSON.parse(text) : null) as T, headers: res.headers };
}

beforeAll(async () => {
  chain = await startTestChain();
  dir = mkdtempSync(join(tmpdir(), "sammati-profile-"));
  config = realConfig(chain, { dbPath: join(dir, "core.sqlite"), handleChecksPerMinute: 8 });
  core = await createTestCore(config, (e) => void published.push(e), (m) => void logged.push(m));
  server = createServer(createRealApp(core));
  await new Promise<void>((r) => server.listen(0, r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  core?.stop();
  await new Promise((r) => server?.close(r));
  await chain?.stop();
  rmSync(dir, { recursive: true, force: true });
});

beforeEach(() => {
  (core.targeted as unknown as { handleChecks: RollingLimiter }).handleChecks = new RollingLimiter();
});

async function registerHandle(wallet: ReturnType<typeof import("ethers").Wallet.createRandom>, handle: string): Promise<number> {
  const issuedAt = unix();
  const signature = await wallet.signMessage(`sammati-id:v1:${handle}:${wallet.address.toLowerCase()}:${issuedAt}`);
  return (await api("POST", "/v1/identities", { handle, principal: wallet.address, issuedAt, signature })).status;
}

describe("GET /v1/identities/availability (W-15 step 1)", () => {
  it("says whether an ID is free, lower-cased, and nothing more", async () => {
    const free = await api("GET", "/v1/identities/availability?handle=Fresh.Name@sammati");
    expect([free.status, free.json]).toEqual([200, { handle: "fresh.name@sammati", available: true }]);

    const asha = Wallet.createRandom();
    expect(await registerHandle(asha, "ashaprofile@sammati")).toBe(201);
    const taken = await api("GET", "/v1/identities/availability?handle=ashaprofile@sammati");
    expect(taken.json).toEqual({ handle: "ashaprofile@sammati", available: false });
  });

  it("tells the wallet that already holds an ID that it is available to it, and nobody else", async () => {
    const owner = Wallet.createRandom();
    await registerHandle(owner, "ownedprofile@sammati");
    const mine = await api("GET", `/v1/identities/availability?handle=ownedprofile@sammati&principal=${owner.address}`);
    expect(mine.json.available).toBe(true);
    const other = await api("GET", `/v1/identities/availability?handle=ownedprofile@sammati&principal=${Wallet.createRandom().address}`);
    expect(other.json.available).toBe(false);
  });

  it("refuses a badly shaped ID", async () => {
    for (const h of ["", "ab@sammati", "has space@sammati", "x".repeat(31) + "@sammati", "asha@elsewhere"]) {
      const res = await api("GET", `/v1/identities/availability?handle=${encodeURIComponent(h)}`);
      expect([res.status, res.json.error.code], h).toEqual([400, "BAD_HANDLE"]);
    }
    expect((await api("GET", "/v1/identities/availability")).status).toBe(400);
  });

  it("is rate limited per client, with Retry-After", async () => {
    const limit = config.handleChecksPerMinute;
    for (let i = 0; i < limit; i++) expect((await api("GET", `/v1/identities/availability?handle=probe${i}@sammati`)).status).toBe(200);
    const over = await api("GET", "/v1/identities/availability?handle=probeover@sammati");
    expect([over.status, over.json.error.code]).toEqual([429, "RATE_LIMITED"]);
    expect(Number(over.headers.get("retry-after"))).toBeGreaterThan(0);
  });
});

describe("the consent view carries what each purpose uses (W-13)", () => {
  it("lists registry ids per consent, in registry order", async () => {
    const who = Wallet.createRandom();
    const created = await api("POST", `/v1/fiduciaries/${QL}/requests`, { purposes: ["credit_check"], customerAlias: "Customer #4821" });
    const notice = (await api<RequestNotice>("GET", `/v1/requests/${created.json.requestId}?principal=${who.address}`)).json;
    const message = { principal: who.address, fiduciary: QL, purposeId: purposeIdOf(QL, "credit_check"), expiresAt: unix() + 86_400, noticeHash: notice.noticeHash, nonce: notice.nonce, deadline: unix() + 3600 };
    const signature = await who.signTypedData(notice.domain, { GrantConsent: [...GRANT_CONSENT_TYPE] }, message);
    expect((await api("POST", "/v1/consents/grant", { request: message, signature })).status).toBe(200);

    const view = (await api<PrincipalConsentsResponse>("GET", `/v1/principals/${who.address}/consents`)).json;
    const consent = view.fiduciaries[0]!.consents.find((c) => c.code === "credit_check")!;
    expect(consent.dataCategories).toEqual(["financial.pan", "financial.income_band", "financial.employment"]);
    // the notice the customer signed shows the very same list
    expect(notice.purposes[0]!.dataCategories).toEqual(consent.dataCategories);
  });
});

describe("Core never holds a profile (drd.md §1 hard rule)", () => {
  it("has no profile value in its database file, logs, events or responses after an account and a consent", async () => {
    const wallet = Wallet.createRandom();
    expect((await api("GET", "/v1/identities/availability?handle=zebulonprofile@sammati")).json.available).toBe(true);
    expect(await registerHandle(wallet, "zebulonprofile@sammati")).toBe(201);
    await api("GET", `/v1/principals/${wallet.address}/identity`);
    await api("GET", `/v1/principals/${wallet.address}/consents`);
    await api("GET", `/v1/principals/${wallet.address}/notifications`);

    // The profile is on the phone. Everything a wallet may send Core has now been sent; look for the values anywhere.
    core.db.pragma("wal_checkpoint(TRUNCATE)");
    const files = [config.dbPath, `${config.dbPath}-wal`].filter((f) => existsSync(f));
    const haystack = [
      ...files.map((f) => readFileSync(f).toString("latin1") + readFileSync(f).toString("utf8")),
      logged.join("\n"),
      JSON.stringify(published),
      bodies.join("\n"),
    ].join("\n").toLowerCase();
    for (const [field, value] of Object.entries(PROFILE)) {
      for (const form of [value, Buffer.from(value).toString("hex"), Buffer.from(value).toString("base64")]) {
        expect(haystack.includes(form.toLowerCase()), `${field} found as ${form.slice(0, 12)}…`).toBe(false);
      }
    }
  });

  it("has no table or column that could hold one", () => {
    const tables = core.db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all() as Array<{ name: string }>;
    const columns = tables.flatMap((t) => (core.db.prepare(`PRAGMA table_info(${t.name})`).all() as Array<{ name: string }>).map((c) => `${t.name}.${c.name}`));
    const forbidden = /(^|[._])(full_?name|dob|birth|mobile|phone|email|pan|income|employer|blood|allerg|insurance|profile|(home|postal|delivery|street)_?address)([._]|$)/i;
    // contact_email is the company applicant's address (drd.md §1, "Contact email"): company data, erased at decision
    expect(columns.filter((c) => forbidden.test(c) && c !== "fiduciary_applications.contact_email")).toEqual([]);
  });
});
