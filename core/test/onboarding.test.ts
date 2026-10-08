// Company onboarding (R-01 to R-03; trd.md §6.2a, §6.12) against the real Core and a real chain: apply, the regulator's
// decision with its chain steps, API keys, the sandbox and the company's own server using the gateway SDK.
import type { AddressInfo } from "node:net";
import { createServer, type Server } from "node:http";
import { createHash, randomUUID } from "node:crypto";
import { Wallet } from "ethers";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { startSampleApp } from "../examples/quickstart";
import {
  API_KEY_HEADER,
  GRANT_CONSENT_TYPE,
  REGULATOR_KEY_HEADER,
  SEED_FIDUCIARIES,
  WITHDRAW_CONSENT_TYPE,
  ZERO_HASH,
  chainEntry,
  demoApiKey,
  purposeIdOf,
  type ApplicationInput,
  type RequestNotice,
  type WsEvent,
} from "@sammati/shared";
import { createApp, createRealApp } from "../src/app";
import { readConfig, type Config } from "../src/config";
import { createRealCore, type RealCore } from "../src/real/core";
import { StubStore } from "../src/store";
import { realConfig, startTestChain, type TestChain } from "./harness";

const QUICKLOAN = SEED_FIDUCIARIES[0]!;
const REGULATOR = { [REGULATOR_KEY_HEADER]: "demo-regulator-key" };
const unix = () => Math.floor(Date.now() / 1000);

let chain: TestChain;
let core: RealCore;
let config: Config;
let server: Server;
let base: string;
let stubServer: Server;
let stubBase: string;
const published: WsEvent[] = [];

// Responses are asserted field by field, so they are read loosely.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function api<T = any>(method: string, path: string, body?: unknown, headers: Record<string, string> = {}, root = base): Promise<{ status: number; json: T; headers: Headers }> {
  const res = await fetch(root + path, {
    method,
    headers: { ...(body === undefined ? {} : { "content-type": "application/json" }), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, json: (text ? JSON.parse(text) : null) as T, headers: res.headers };
}

beforeAll(async () => {
  chain = await startTestChain();
  config = realConfig(chain, { registrationsPerHour: 1000 });
  core = await createRealCore(config, (e) => void published.push(e), () => {});
  server = createServer(createRealApp(core));
  await new Promise<void>((r) => server.listen(0, r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const stubConfig = readConfig({});
  stubServer = createServer(createApp({ store: new StubStore(stubConfig), config: stubConfig, publish: () => {} }));
  await new Promise<void>((r) => stubServer.listen(0, r));
  stubBase = `http://127.0.0.1:${(stubServer.address() as AddressInfo).port}`;
});

afterAll(async () => {
  core?.stop();
  await new Promise((r) => server?.close(r));
  await new Promise((r) => stubServer?.close(r));
  await chain?.stop();
});

beforeEach(() => {
  published.length = 0;
  config.gatewayRatePerMinute = 600;
  config.registrationFundingEth = "1";
});

let n = 0;
const uniqueName = (prefix: string) => `${prefix}${Date.now() % 1_000_000}${++n}`;

const text = (en: string) => ({ en, hi: `${en} (hi)`, kn: `${en} (kn)` });
function application(name = uniqueName("DemoBank")): ApplicationInput {
  return {
    name,
    sector: "Banking",
    contactEmail: "ops@demobank.example",
    purposes: [
      { code: "loan_offers", title: text("Loan offers"), description: text("Send you loan offers"), dataCategories: ["phone"], retentionDays: 90, sharesThirdParty: false, required: false },
      { code: "partner_share", title: text("Partner sharing"), description: text("Share with our partner"), dataCategories: ["repayment history"], retentionDays: 365, sharesThirdParty: true, required: false },
    ],
    processors: [{ name: "PartnerOne", purposeCode: "partner_share" }],
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const apply = (input: unknown = application()) => api<any>("POST", "/v1/registrations", input);
const status = (id: string) => api("GET", `/v1/registrations/${id}`);

/** Applies and approves; returns the company and its API key (read once, as the applicant would). */
async function joined(opts: { sandbox?: boolean; name?: string } = {}) {
  const name = opts.name ?? uniqueName("DemoBank");
  const { json } = await apply(application(name));
  const approved = await api("POST", `/v1/regulator/registrations/${json.applicationId}/approve`, { sandbox: opts.sandbox ?? true, note: "ok" }, REGULATOR);
  expect(approved.status).toBe(200);
  const result = (await status(json.applicationId)).json.result;
  return { id: json.applicationId, name, address: result.fiduciary as string, slug: result.slug as string, apiKey: result.apiKey as string, txHashes: approved.json.txHashes as string[] };
}

let customerN = 0;
/** A customer with a Sammati ID. */
async function customer() {
  const wallet = Wallet.createRandom();
  const handle = `cust${Date.now() % 100000}${++customerN}@sammati`;
  const issuedAt = unix();
  const signature = await wallet.signMessage(`sammati-id:v1:${handle}:${wallet.address.toLowerCase()}:${issuedAt}`);
  expect((await api("POST", "/v1/identities", { handle, principal: wallet.address, issuedAt, signature })).status).toBe(201);
  return { wallet, handle, address: wallet.address };
}

async function grant(who: ReturnType<typeof Wallet.createRandom>, fid: string, requestId: string, purposeCode: string) {
  const notice = (await api<RequestNotice>("GET", `/v1/requests/${requestId}?principal=${who.address}`)).json;
  const message = { principal: who.address, fiduciary: fid, purposeId: purposeIdOf(fid, purposeCode), expiresAt: unix() + 86_400, noticeHash: notice.noticeHash, nonce: notice.nonce, deadline: unix() + 3600 };
  const signature = await who.signTypedData(notice.domain, { GrantConsent: [...GRANT_CONSENT_TYPE] }, message);
  return api("POST", "/v1/consents/grant", { request: message, signature });
}

async function withdraw(who: ReturnType<typeof Wallet.createRandom>, fid: string, purposeCode: string) {
  const current = (await api("GET", `/v1/principals/${who.address}/consents`)).json;
  const message = { principal: who.address, fiduciary: fid, purposeId: purposeIdOf(fid, purposeCode), nonce: current.nonce, deadline: unix() + 3600 };
  const signature = await who.signTypedData(current.domain, { WithdrawConsent: [...WITHDRAW_CONSENT_TYPE] }, message);
  return api("POST", "/v1/consents/withdraw", { request: message, signature });
}

describe("the directory (R-04)", () => {
  it("lists the seed companies as live demo companies, with the slug the console route uses", async () => {
    const { status: s, json } = await api("GET", "/v1/fiduciaries");
    expect(s).toBe(200);
    expect(json.fiduciaries.slice(0, 3).map((f: { slug: string }) => f.slug)).toEqual(["quickloan", "medicare", "foodrush"]);
    expect(json.fiduciaries[0]).toMatchObject({ address: QUICKLOAN.address, name: "QuickLoan", sandbox: false, demo: true, color: "#2F5BEA" });
  });

  it("is served in the stub too, and the stub refuses registration", async () => {
    const list = await api("GET", "/v1/fiduciaries", undefined, {}, stubBase);
    expect(list.json.fiduciaries).toHaveLength(3);
    expect(list.json.fiduciaries.every((f: { demo: boolean }) => f.demo)).toBe(true);
    expect((await api("POST", "/v1/registrations", application(), {}, stubBase)).status).toBe(501);
    expect((await api("GET", "/v1/regulator/registrations", undefined, REGULATOR, stubBase)).status).toBe(501);
  });
});

describe("applying (R-01)", () => {
  it("creates a pending application and nothing else: no company, no key, nothing on chain", async () => {
    const input = application();
    const before = (await api("GET", "/v1/fiduciaries")).json.fiduciaries.length;
    const { status: s, json } = await apply(input);
    expect([s, json.status]).toEqual([201, "pending"]);
    expect(json.applicationId).toMatch(/^[0-9a-f]{32}$/);

    const st = (await status(json.applicationId)).json;
    expect(st).toMatchObject({ name: input.name, status: "pending", note: null, result: null });
    expect((await api("GET", "/v1/fiduciaries")).json.fiduciaries).toHaveLength(before);
    expect((await api("GET", "/v1/regulator/registrations?status=pending", undefined, REGULATOR)).json.applications.find((a: { id: string }) => a.id === json.applicationId)).toMatchObject({ contactEmail: "ops@demobank.example" });
  });

  it.each([
    ["a body that is not an object", [], "body"],
    ["short name", { ...application(), name: "A" }, "name"],
    ["bad email", { ...application(), contactEmail: "not-an-email" }, "contactEmail"],
    ["no purposes", { ...application(), purposes: [] }, "purposes"],
    ["bad purpose code", (() => { const a = application(); a.purposes[0]!.code = "Loan Offers"; return a; })(), "purposes[0].code"],
    ["duplicate purpose code", (() => { const a = application(); a.purposes[1]!.code = a.purposes[0]!.code; return a; })(), "purposes[1].code"],
    ["missing Kannada title", (() => { const a = application(); a.purposes[0]!.title.kn = ""; return a; })(), "purposes[0].title.kn"],
    ["description too long", (() => { const a = application(); a.purposes[0]!.description.en = "x".repeat(201); return a; })(), "purposes[0].description.en"],
    ["retention out of range", (() => { const a = application(); a.purposes[0]!.retentionDays = 0; return a; })(), "purposes[0].retentionDays"],
    ["processor for a purpose that is not declared", { ...application(), processors: [{ name: "Ghost", purposeCode: "nope" }] }, "processors[0].purposeCode"],
  ])("refuses %s and names the field", async (_label, input, field) => {
    const res = await apply(input);
    expect([res.status, res.json.error.code]).toEqual([400, "BAD_APPLICATION"]);
    expect(res.json.error.message).toContain(field);
  });

  it("refuses a name already taken by a company or by an application still in the queue, and lets a rejected name be tried again", async () => {
    expect((await apply({ ...application(), name: "QuickLoan" })).json.error.code).toBe("NAME_TAKEN");
    expect((await apply({ ...application(), name: "Medicare" })).json.error.code).toBe("NAME_TAKEN"); // the slug of "MediCare+" is "medicare" too
    const first = application();
    const { json } = await apply(first);
    expect((await apply(first)).json.error.code).toBe("NAME_TAKEN");
    await api("POST", `/v1/regulator/registrations/${json.applicationId}/reject`, { note: "No." }, REGULATOR);
    expect((await apply(first)).status).toBe(201);
  });

  it("limits how many applications one address may send per hour, and how many may wait", async () => {
    config.registrationsPerHour = 2;
    (core.onboarding as unknown as { applyLimiter: { hits: Map<string, number[]> } }).applyLimiter.hits.clear();
    expect((await apply()).status).toBe(201);
    expect((await apply()).status).toBe(201);
    const third = await apply();
    expect([third.status, third.json.error.code]).toEqual([429, "RATE_LIMITED"]);
    expect(Number(third.headers.get("retry-after"))).toBeGreaterThan(0);
    config.registrationsPerHour = 1000;

    config.maxPendingApplications = 0;
    const full = await apply();
    expect([full.status, full.json.error.code]).toEqual([429, "TOO_MANY_PENDING"]);
    config.maxPendingApplications = 50;
  });

  it("an unknown application id is 404", async () => {
    expect((await status("0".repeat(32))).status).toBe(404);
  });
});

describe("the regulator's door (R-02)", () => {
  it.each([
    ["no code", {}],
    ["a wrong code", { [REGULATOR_KEY_HEADER]: "guess" }],
  ])("refuses %s on every regulator route", async (_label, headers) => {
    for (const [method, path] of [
      ["GET", "/v1/regulator/registrations"],
      ["POST", "/v1/regulator/registrations/abc/approve"],
      ["POST", "/v1/regulator/registrations/abc/reject"],
      ["POST", "/v1/regulator/fiduciaries/0x0/sandbox"],
      ["POST", "/v1/regulator/fiduciaries/0x0/reissue-key"],
      ["GET", "/v1/regulator/test-principals"],
    ] as const) {
      const res = await api(method, path, method === "POST" ? {} : undefined, headers);
      expect([res.status, res.json.error.code]).toEqual([401, "UNAUTHORIZED"]);
    }
  });
});

describe("rejecting (R-02)", () => {
  it("needs a note, erases the contact email, and leaves the company with nothing: no id, no key, no requests", async () => {
    const { json } = await apply();
    const noNote = await api("POST", `/v1/regulator/registrations/${json.applicationId}/reject`, {}, REGULATOR);
    expect([noNote.status, noNote.json.error.code]).toEqual([400, "BAD_NOTE"]);

    const rejected = await api("POST", `/v1/regulator/registrations/${json.applicationId}/reject`, { note: "Purposes are too broad." }, REGULATOR);
    expect(rejected.json.application).toMatchObject({ status: "rejected", note: "Purposes are too broad.", contactEmail: null, fiduciary: null });
    expect((await status(json.applicationId)).json).toMatchObject({ status: "rejected", note: "Purposes are too broad.", result: null });

    expect((await api("POST", `/v1/regulator/registrations/${json.applicationId}/reject`, { note: "again" }, REGULATOR)).json.error.code).toBe("ALREADY_DECIDED");
    expect((await api("POST", `/v1/regulator/registrations/${json.applicationId}/approve`, {}, REGULATOR)).json.error.code).toBe("ALREADY_DECIDED");

    // The company never got an id, so every way of creating a request finds no company.
    const stranger = Wallet.createRandom().address;
    for (const path of [`/v1/fiduciaries/${stranger}/requests`, `/v1/fiduciaries/${stranger}/requests/targeted`]) {
      const res = await api("POST", path, { purposes: ["loan_offers"], customerAlias: "x", handle: "asha@sammati" });
      expect([res.status, res.json.error.code]).toEqual([404, "FIDUCIARY_NOT_FOUND"]);
    }
    expect((await api("GET", "/v1/fiduciaries")).json.fiduciaries.some((f: { name: string }) => f.name === application().name)).toBe(false);
  });
});

describe("approving (R-02)", () => {
  it("registers the company, its purposes and processors on chain, lists it in the sandbox, and shows the key once", async () => {
    const co = await joined();
    // on chain
    const reg = core.chain.registryContract;
    expect(await reg.getFunction("isFiduciary")(co.address)).toBe(true);
    const pid = purposeIdOf(co.address, "loan_offers");
    expect((await reg.getFunction("getPurpose")(pid)).fiduciary).toBe(co.address);
    const processor = core.repo.processorsFor(purposeIdOf(co.address, "partner_share"))[0]!;
    expect(processor.name).toBe("PartnerOne");
    expect(await reg.getFunction("isProcessor")(purposeIdOf(co.address, "partner_share"), processor.address)).toBe(true);
    expect(co.txHashes.length).toBeGreaterThanOrEqual(4);

    // in the directory, with ink for a colour, in the sandbox, and not a demo company
    const entry = (await api("GET", "/v1/fiduciaries")).json.fiduciaries.find((f: { address: string }) => f.address === co.address);
    expect(entry).toMatchObject({ name: co.name, slug: co.slug, sandbox: true, demo: false, color: "#16173F" });
    expect((await api("GET", `/v1/fiduciaries/${co.address}/purposes`)).json.purposes.map((p: { code: string }) => p.code)).toEqual(["loan_offers", "partner_share"]);

    // in the ledger explorer: the registration events, like any other ledger event
    const kinds = (await api("GET", `/v1/audit/ledger?fid=${co.address}&type=purpose`)).json.events.map((e: { payload: { kind: string } }) => e.payload.kind);
    expect(kinds).toEqual(expect.arrayContaining(["fiduciary", "purpose"]));

    // announced to the consoles
    expect(published).toContainEqual(expect.objectContaining({ event: "fiduciary.registered", fiduciary: co.address, sandbox: true, slug: co.slug }));

    // the application: approved, the email gone, the regulator's view never holds the key
    const view = (await api("GET", "/v1/regulator/registrations?status=approved", undefined, REGULATOR)).json.applications.find((a: { id: string }) => a.id === co.id);
    expect(view).toMatchObject({ status: "approved", contactEmail: null, fiduciary: co.address, sandbox: true });
    expect(JSON.stringify(view)).not.toContain(co.apiKey);
  });

  it("shows the API key to the applicant once, and keeps only a hash of it", async () => {
    const { json } = await apply();
    const approved = await api("POST", `/v1/regulator/registrations/${json.applicationId}/approve`, {}, REGULATOR);
    expect(JSON.stringify(approved.json)).not.toMatch(/sk_/);

    const first = (await status(json.applicationId)).json.result;
    expect(first.apiKey).toMatch(/^sk_[A-Za-z0-9_-]{43}$/);
    expect(first).toMatchObject({ apiKeyShown: false, sandbox: true });
    const second = (await status(json.applicationId)).json.result;
    expect(second).toMatchObject({ apiKey: null, apiKeyShown: true, fiduciary: first.fiduciary });

    // at rest: the hash, never the key
    const row = (core.db.prepare("SELECT api_key_hash FROM fiduciary_credentials WHERE fiduciary = ?").get(first.fiduciary) as { api_key_hash: string });
    expect(row.api_key_hash).toBe(createHash("sha256").update(first.apiKey).digest("hex"));
    for (const table of ["fiduciary_credentials", "fiduciary_applications"]) {
      expect(JSON.stringify(core.db.prepare(`SELECT * FROM ${table}`).all())).not.toContain(first.apiKey);
    }
  });

  it("can start a company live instead of in the sandbox", async () => {
    const co = await joined({ sandbox: false });
    const entry = (await api("GET", "/v1/fiduciaries")).json.fiduciaries.find((f: { address: string }) => f.address === co.address);
    expect(entry.sandbox).toBe(false);
  });

  it("is safe to repeat after a failure half-way: nothing becomes visible, then the same address is registered", async () => {
    const name = uniqueName("Retry");
    const { json } = await apply(application(name));
    config.registrationFundingEth = "999999999999"; // more test ether than the admin has: the first step fails
    const failed = await api("POST", `/v1/regulator/registrations/${json.applicationId}/approve`, {}, REGULATOR);
    expect([failed.status, failed.json.error.code]).toEqual([502, "REGISTRATION_FAILED"]);
    expect((await api("GET", "/v1/fiduciaries")).json.fiduciaries.some((f: { name: string }) => f.name === name)).toBe(false);
    expect((await status(json.applicationId)).json.status).toBe("pending");
    const kept = (core.db.prepare("SELECT fiduciary FROM fiduciary_applications WHERE id = ?").get(json.applicationId) as { fiduciary: string }).fiduciary;
    expect(kept).toMatch(/^0x/);

    config.registrationFundingEth = "1";
    const ok = await api("POST", `/v1/regulator/registrations/${json.applicationId}/approve`, {}, REGULATOR);
    expect(ok.status).toBe(200);
    expect(ok.json.fiduciary.address).toBe(kept);
  });
});

describe("API keys (R-03)", () => {
  it("whoami says who a key is; seed companies have keys too", async () => {
    const co = await joined();
    expect((await api("GET", "/v1/gateway/whoami", undefined, { [API_KEY_HEADER]: co.apiKey })).json).toEqual({ fiduciary: co.address, slug: co.slug, name: co.name, sandbox: true });
    expect((await api("GET", "/v1/gateway/whoami", undefined, { [API_KEY_HEADER]: demoApiKey("quickloan") })).json).toMatchObject({ fiduciary: QUICKLOAN.address, sandbox: false });
  });

  it("fails closed, clearly, with no key, an unknown key, a pending applicant's id used as a key", async () => {
    const pending = await apply();
    for (const headers of [{}, { [API_KEY_HEADER]: "sk_made_up" }, { [API_KEY_HEADER]: pending.json.applicationId as string }] as Array<Record<string, string>>) {
      const res = await api("GET", `/v1/gateway/consent-state?principal=${Wallet.createRandom().address}&fid=${QUICKLOAN.address}&purpose=credit_check`, undefined, headers);
      expect([res.status, res.json.error.code]).toEqual([401, "INVALID_API_KEY"]);
      expect(res.json.error.message).toMatch(/regulator approves/);
    }
    const log = await api("POST", "/v1/gateway/log", { seq: 1 });
    expect([log.status, log.json.error.code]).toEqual([401, "INVALID_API_KEY"]);
  });

  it("a key works for one company only", async () => {
    const co = await joined();
    const key = { [API_KEY_HEADER]: co.apiKey };
    const mismatch = await api("GET", `/v1/gateway/consent-state?principal=${Wallet.createRandom().address}&fid=${QUICKLOAN.address}&purpose=credit_check`, undefined, key);
    expect([mismatch.status, mismatch.json.error.code]).toEqual([403, "FIDUCIARY_MISMATCH"]);
    // and cannot send another company's customers a request, or read its sent requests
    const post = await api("POST", `/v1/fiduciaries/${QUICKLOAN.address}/requests/targeted`, { handle: "asha@sammati", purposes: ["credit_check"] }, key);
    expect([post.status, post.json.error.code]).toEqual([403, "FIDUCIARY_MISMATCH"]);
    expect((await api("GET", `/v1/fiduciaries/${QUICKLOAN.address}/requests/targeted`, undefined, key)).json.error.code).toBe("FIDUCIARY_MISMATCH");
    expect((await api("POST", `/v1/fiduciaries/${QUICKLOAN.address}/requests`, { purposes: ["credit_check"], customerAlias: "x" }, key)).json.error.code).toBe("FIDUCIARY_MISMATCH");
    // ...and a log entry that names another company is refused
    const entry = { at: unix(), decision: "ALLOWED", endpoint: "GET /x", fiduciary: QUICKLOAN.address, id: randomUUID(), latencyMs: 1, principal: Wallet.createRandom().address, purposeCode: "credit_check", reason: "OK", seq: 9999 };
    const chained = chainEntry(ZERO_HASH, entry as never);
    const forged = await api("POST", "/v1/gateway/log", { ...entry, prevHash: chained.prevHash, hash: chained.hash, batchIndex: null }, key);
    expect([forged.status, forged.json.error.code]).toEqual([403, "FIDUCIARY_MISMATCH"]);
    // its own id is fine
    expect((await api("GET", `/v1/fiduciaries/${co.address}/requests/targeted`, undefined, key)).status).toBe(200);
  });

  it("limits each company's calls per minute, with Retry-After, without touching other companies", async () => {
    const a = await joined();
    const b = await joined();
    config.gatewayRatePerMinute = 3;
    const call = (key: string) => api("GET", "/v1/gateway/whoami", undefined, { [API_KEY_HEADER]: key });
    for (let i = 0; i < 3; i++) expect((await call(a.apiKey)).status).toBe(200);
    const over = await call(a.apiKey);
    expect([over.status, over.json.error.code]).toEqual([429, "RATE_LIMITED"]);
    expect(Number(over.headers.get("retry-after"))).toBeGreaterThan(0);
    expect((await call(b.apiKey)).status).toBe(200);
  });

  it("reissuing replaces the key at once, shows the new one once, and never to the regulator", async () => {
    const co = await joined();
    const reissued = await api("POST", `/v1/regulator/fiduciaries/${co.address}/reissue-key`, {}, REGULATOR);
    expect(reissued.json).toEqual({ ok: true });
    expect((await api("GET", "/v1/gateway/whoami", undefined, { [API_KEY_HEADER]: co.apiKey })).status).toBe(401);

    const fresh = (await status(co.id)).json.result;
    expect(fresh.apiKey).toMatch(/^sk_/);
    expect(fresh.apiKey).not.toBe(co.apiKey);
    expect((await api("GET", "/v1/gateway/whoami", undefined, { [API_KEY_HEADER]: fresh.apiKey })).status).toBe(200);
    expect((await status(co.id)).json.result.apiKey).toBeNull();
    expect((await api("POST", `/v1/regulator/fiduciaries/${QUICKLOAN.address}/reissue-key`, {}, REGULATOR)).json.error.code).toBe("DEMO_COMPANY");
  });
});

describe("the sandbox (R-03)", () => {
  it("lets a sandbox company reach only test customers, and says nothing different to the company", async () => {
    const co = await joined();
    const key = { [API_KEY_HEADER]: co.apiKey };
    const stranger = await customer();
    const tester = await customer();
    expect((await api("POST", "/v1/regulator/test-principals", { handle: tester.handle }, REGULATOR)).status).toBe(201);

    const send = (handle: string) => api("POST", `/v1/fiduciaries/${co.address}/requests/targeted`, { handle, purposes: ["loan_offers"] }, key);
    published.length = 0;
    const toStranger = await send(stranger.handle);
    const toTester = await send(tester.handle);
    // identical answer, different delivery
    expect([toStranger.status, toStranger.json.status]).toEqual([201, "sent"]);
    expect([toTester.status, toTester.json.status]).toEqual([201, "sent"]);
    expect(published.filter((e) => e.event === "consent.requested").map((e) => (e as { principal: string }).principal.toLowerCase())).toEqual([tester.address.toLowerCase()]);

    // a QR request cannot be opened or granted by a non-test customer either
    const qr = (await api("POST", `/v1/fiduciaries/${co.address}/requests`, { purposes: ["loan_offers"], customerAlias: "walk-in" }, key)).json;
    const opened = await api("GET", `/v1/requests/${qr.requestId}?principal=${stranger.address}`);
    expect([opened.status, opened.json.error.code]).toEqual([403, "SANDBOX_COMPANY"]);
    const refused = await grant(stranger.wallet, co.address, qr.requestId, "loan_offers").catch(() => null);
    expect(refused).toBeNull(); // the notice was refused, so there is nothing to sign

    // a hand-made grant is refused before anything is relayed
    const message = { principal: stranger.address, fiduciary: co.address, purposeId: purposeIdOf(co.address, "loan_offers"), expiresAt: unix() + 86_400, noticeHash: "0x" + "00".repeat(32), nonce: "0", deadline: unix() + 3600 };
    const signature = await stranger.wallet.signTypedData({ name: "Sammati", version: "1", chainId: chain.deployment.chainId, verifyingContract: chain.deployment.consentRegistry }, { GrantConsent: [...GRANT_CONSENT_TYPE] }, message);
    const direct = await api("POST", "/v1/consents/grant", { request: message, signature });
    expect([direct.status, direct.json.error.code]).toEqual([403, "SANDBOX_COMPANY"]);

    // the test customer can grant, and withdraw
    const qr2 = (await api("POST", `/v1/fiduciaries/${co.address}/requests`, { purposes: ["loan_offers"], customerAlias: "tester" }, key)).json;
    expect((await grant(tester.wallet, co.address, qr2.requestId, "loan_offers")).status).toBe(200);
    expect((await withdraw(tester.wallet, co.address, "loan_offers")).status).toBe(200);
  });

  it("promotion lifts the limits, demotion restores them, and both are announced", async () => {
    const co = await joined();
    const stranger = await customer();
    const qr = (await api("POST", `/v1/fiduciaries/${co.address}/requests`, { purposes: ["loan_offers"], customerAlias: "x" })).json;
    expect((await api("GET", `/v1/requests/${qr.requestId}?principal=${stranger.address}`)).status).toBe(403);

    published.length = 0;
    expect((await api("POST", `/v1/regulator/fiduciaries/${co.address}/sandbox`, { sandbox: false }, REGULATOR)).json).toEqual({ fiduciary: co.address, sandbox: false });
    expect(published).toContainEqual(expect.objectContaining({ event: "fiduciary.updated", fiduciary: co.address, sandbox: false }));
    expect((await api("GET", `/v1/requests/${qr.requestId}?principal=${stranger.address}`)).status).toBe(200);
    expect((await grant(stranger.wallet, co.address, qr.requestId, "loan_offers")).status).toBe(200);

    await api("POST", `/v1/regulator/fiduciaries/${co.address}/sandbox`, { sandbox: true }, REGULATOR);
    expect((await api("GET", `/v1/requests/${qr.requestId}?principal=${Wallet.createRandom().address}`)).status).toBe(403);
    expect((await api("POST", `/v1/regulator/fiduciaries/${QUICKLOAN.address}/sandbox`, { sandbox: true }, REGULATOR)).json.error.code).toBe("DEMO_COMPANY");
    expect((await api("POST", `/v1/regulator/fiduciaries/${co.address}/sandbox`, { sandbox: "yes" }, REGULATOR)).status).toBe(400);
  });

  it("manages the test customers: by Sammati ID or address, unknown IDs refused, removable", async () => {
    const a = await customer();
    expect((await api("POST", "/v1/regulator/test-principals", { handle: "nobody-here@sammati" }, REGULATOR)).json.error.code).toBe("HANDLE_NOT_FOUND");
    expect((await api("POST", "/v1/regulator/test-principals", {}, REGULATOR)).status).toBe(400);
    const added = await api("POST", "/v1/regulator/test-principals", { handle: a.handle }, REGULATOR);
    expect(added.json.added).toMatchObject({ handle: a.handle });
    const byAddress = Wallet.createRandom().address;
    await api("POST", "/v1/regulator/test-principals", { principal: byAddress }, REGULATOR);
    const list = (await api("GET", "/v1/regulator/test-principals", undefined, REGULATOR)).json.principals as Array<{ principal: string; handle: string | null }>;
    expect(list.map((p) => p.principal.toLowerCase())).toEqual(expect.arrayContaining([a.address.toLowerCase(), byAddress.toLowerCase()]));
    await api("DELETE", `/v1/regulator/test-principals/${byAddress}`, undefined, REGULATOR);
    expect(((await api("GET", "/v1/regulator/test-principals", undefined, REGULATOR)).json.principals as Array<{ principal: string }>).some((p) => p.principal.toLowerCase() === byAddress.toLowerCase())).toBe(false);
  });
});

describe("a joined company runs the quickstart sample app end to end (R-03)", () => {
  let sample: { close(): Promise<void> } | undefined;
  afterAll(async () => {
    await sample?.close().catch(() => undefined);
  });

  it("grant → ALLOWED → withdraw → BLOCKED, logged, anchored with the generated key, processor acknowledges", async () => {
    const co = await joined();
    const tester = await customer();
    await api("POST", "/v1/regulator/test-principals", { handle: tester.handle }, REGULATOR);

    // the quickstart, as docs/integration.md §4 runs it
    const app = await startSampleApp({ coreUrl: base, fiduciary: co.address, apiKey: co.apiKey, purpose: "partner_share" });
    sample = app;
    const call = () => fetch(`${app.url}/customers/1/profile`, { headers: { "x-sammati-principal": tester.address } });
    await new Promise((r) => setTimeout(r, 300)); // the SDK's live feed is subscribed

    expect((await call()).status).toBe(451); // nobody has consented yet

    const sent = await api("POST", `/v1/fiduciaries/${co.address}/requests/targeted`, { handle: tester.handle, purposes: ["partner_share"] }, { [API_KEY_HEADER]: co.apiKey });
    expect(sent.status).toBe(201);
    expect((await grant(tester.wallet, co.address, sent.json.requestId, "partner_share")).status).toBe(200);
    expect((await call()).status).toBe(200);

    expect((await withdraw(tester.wallet, co.address, "partner_share")).status).toBe(200);
    const blocked = await call();
    expect([blocked.status, ((await blocked.json()) as { code: string }).code]).toEqual([451, "CONSENT_WITHDRAWN"]);
    await app.close(); // flushes its log entries to Core

    // the decisions are in the company's hash-chained log, and anchor with the key Core generated for it
    const log = (await api("GET", `/v1/fiduciaries/${co.address}/access`)).json.items as Array<{ decision: string; reason: string }>;
    expect(log.map((e) => `${e.decision}:${e.reason}`).reverse()).toEqual(["BLOCKED:NO_CONSENT", "ALLOWED:OK", "BLOCKED:CONSENT_WITHDRAWN"]);
    const anchored = await core.anchors.runOnce(co.address as `0x${string}`);
    expect(anchored).toHaveLength(1);
    expect(anchored[0]).toMatchObject({ fiduciary: co.address, count: 3 });

    // and the processor it declared, whose key Core generated, acknowledges the withdrawal on chain
    await core.cascade.idle();
    const acks = (await api("GET", `/v1/principals/${tester.address}/cascade/${purposeIdOf(co.address, "partner_share")}`)).json.processors as Array<{ name: string; ackedAt: number | null }>;
    expect(acks).toEqual([expect.objectContaining({ name: "PartnerOne", ackedAt: expect.any(Number) })]);
  });
});

describe("reset", () => {
  it("removes registered companies, their keys and the applications, and keeps the seed companies and their keys", async () => {
    const co = await joined();
    expect((await api("POST", "/v1/demo/reset", {})).status).toBe(200);
    const list = (await api("GET", "/v1/fiduciaries")).json.fiduciaries as Array<{ address: string }>;
    expect(list).toHaveLength(3);
    expect((await api("GET", "/v1/gateway/whoami", undefined, { [API_KEY_HEADER]: co.apiKey })).status).toBe(401);
    expect((await api("GET", "/v1/gateway/whoami", undefined, { [API_KEY_HEADER]: demoApiKey("quickloan") })).status).toBe(200);
    expect((await status(co.id)).status).toBe(404);
  });
});
