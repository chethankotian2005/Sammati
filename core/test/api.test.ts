import type { AddressInfo } from "node:net";
import { createServer, type Server } from "node:http";
import { SigningKey } from "ethers";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  DEMO_PRINCIPAL,
  buildDomain,
  eip712Digest,
  grantTypedData,
  verifyMerkleProof,
  withdrawTypedData,
  type AccessProofResponse,
  type ConsentStateResponse,
  type PrincipalConsentsResponse,
  type RequestNotice,
  type VerifyResponse,
} from "@sammati/shared";
import { createApp } from "../src/app";
import { readConfig } from "../src/config";
import { StubStore } from "../src/store";
import { WsHub } from "../src/ws";

// Hardhat account #0: the seeded demo principal's key (public, test only).
const KEY = new SigningKey("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");
const FAR = Math.floor(Date.now() / 1000) + 86_400;

let server: Server;
let hub: WsHub;
let base: string;
let store: StubStore;

beforeAll(async () => {
  const config = readConfig({ PORT: "0" });
  store = new StubStore(config);
  server = createServer();
  hub = new WsHub(server);
  server.on("request", createApp({ store, config, publish: (e) => hub.publish(e) }));
  await new Promise<void>((r) => server.listen(0, r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await hub.close();
  await new Promise((r) => server.close(r));
});

beforeEach(() => store.reset());

async function call<T = unknown>(method: string, path: string, body?: unknown): Promise<{ status: number; json: T }> {
  const res = await fetch(base + path, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: (await res.json()) as T };
}

function ids() {
  const f = store.fiduciaries[0]!;
  return { f, marketing: f.purposes.find((p) => p.code === "marketing")!.id, credit: f.purposes.find((p) => p.code === "credit_check")!.id };
}

async function state(purposeId: string): Promise<ConsentStateResponse> {
  const { f } = ids();
  return (await call<ConsentStateResponse>("GET", `/v1/gateway/consent-state?principal=${DEMO_PRINCIPAL}&fid=${f.address}&purpose=${purposeId}`)).json;
}

describe("health and errors", () => {
  it("serves /v1/health", async () => {
    const { status, json } = await call<{ ok: boolean; mode: string }>("GET", "/v1/health");
    expect(status).toBe(200);
    expect(json).toMatchObject({ ok: true, service: "sammati-core", mode: "stub" });
  });

  it("uses the spec error shape for unknown routes and bad input", async () => {
    const missing = await call<{ error: { code: string; message: string } }>("GET", "/v1/nope");
    expect(missing.status).toBe(404);
    expect(missing.json.error.code).toBe("NOT_FOUND");
    const bad = await call<{ error: { code: string } }>("POST", "/v1/consents/grant", { request: {} });
    expect(bad.status).toBe(400);
    expect(bad.json.error.code).toBe("BAD_REQUEST");
  });
});

describe("golden path against the stub", () => {
  it("request → notice → grant → ALLOWED → withdraw → BLOCKED", async () => {
    const { f, marketing } = ids();

    // marketing is seeded as Withdrawn
    expect((await state(marketing)).reason).toBe("CONSENT_WITHDRAWN");

    const created = await call<{ requestId: string; qrPayload: { v: number; fiduciary: string } }>(
      "POST",
      `/v1/fiduciaries/${f.address}/requests`,
      { purposes: ["marketing"], customerAlias: "Customer #4821" },
    );
    expect(created.status).toBe(201);
    expect(created.json.qrPayload).toMatchObject({ v: 1, fiduciary: f.address });

    const notice = (await call<RequestNotice>("GET", `/v1/requests/${created.json.requestId}?principal=${DEMO_PRINCIPAL}`)).json;
    expect(notice.nonce).toBe("0");
    expect(notice.purposes[0]!.id).toBe(marketing);

    const domain = buildDomain(notice.domain.chainId, notice.domain.verifyingContract);
    const grant = {
      principal: DEMO_PRINCIPAL,
      fiduciary: f.address,
      purposeId: marketing,
      expiresAt: FAR,
      noticeHash: notice.noticeHash,
      nonce: notice.nonce,
      deadline: FAR,
    };
    const forged = await call<{ error: { code: string } }>("POST", "/v1/consents/grant", {
      request: grant,
      signature: KEY.sign(eip712Digest(grantTypedData(domain, { ...grant, expiresAt: FAR + 1 }))).serialized,
    });
    expect(forged.status).toBe(400);
    expect(forged.json.error.code).toBe("BAD_SIGNATURE");

    const granted = await call<{ txHash: string; status: string }>("POST", "/v1/consents/grant", {
      request: grant,
      signature: KEY.sign(eip712Digest(grantTypedData(domain, grant))).serialized,
    });
    expect(granted.status).toBe(200);
    expect(await state(marketing)).toMatchObject({ valid: true, status: "Active" });

    const replay = await call<{ error: { code: string } }>("POST", "/v1/consents/grant", {
      request: grant,
      signature: KEY.sign(eip712Digest(grantTypedData(domain, grant))).serialized,
    });
    expect(replay.json.error.code).toBe("BAD_NONCE");

    const fired = await call<{ decision: string }>("POST", "/v1/demo/fire", {
      fiduciary: f.address,
      purposeCode: "marketing",
      principal: DEMO_PRINCIPAL,
    });
    expect(fired.json.decision).toBe("ALLOWED");

    // The wallet has no request to read a nonce from, so the consents response carries it.
    const { json: consentsAfterGrant } = await call<PrincipalConsentsResponse>("GET", `/v1/principals/${DEMO_PRINCIPAL}/consents`);
    expect(consentsAfterGrant.nonce).toBe("1");

    const w = { principal: DEMO_PRINCIPAL, fiduciary: f.address, purposeId: marketing, nonce: consentsAfterGrant.nonce, deadline: FAR };
    const withdrawn = await call("POST", "/v1/consents/withdraw", {
      request: w,
      signature: KEY.sign(eip712Digest(withdrawTypedData(domain, w))).serialized,
    });
    expect(withdrawn.status).toBe(200);
    expect(await state(marketing)).toMatchObject({ valid: false, reason: "CONSENT_WITHDRAWN" });

    const blocked = await call<{ decision: string; reason: string }>("POST", "/v1/demo/fire", {
      fiduciary: f.address,
      purposeCode: "marketing",
      principal: DEMO_PRINCIPAL,
    });
    expect(blocked.json).toMatchObject({ decision: "BLOCKED", reason: "CONSENT_WITHDRAWN" });

    const cascade = await call<{ processors: { name: string; notifiedAt: number | null }[] }>(
      "GET",
      `/v1/principals/${DEMO_PRINCIPAL}/cascade/${marketing}`,
    );
    expect(cascade.json.processors.map((p) => p.name)).toEqual(["AdPartnerQ"]);
    expect(cascade.json.processors[0]!.notifiedAt).not.toBeNull();
  });

  it("reports consent state reasons", async () => {
    const { f, credit } = ids();
    expect(await state(credit)).toMatchObject({ valid: true });
    const unknown = (
      await call<ConsentStateResponse>(
        "GET",
        `/v1/gateway/consent-state?principal=0x70997970C51812dc3A010C7d01b50e0d17dc79C8&fid=${f.address}&purpose=credit_check`,
      )
    ).json;
    expect(unknown).toMatchObject({ valid: false, reason: "NO_CONSENT", status: "None" });
  });
});

describe("tamper detection", () => {
  it("verify passes, then fails after a tamper, pointing at the row", async () => {
    const { f } = ids();
    const clean = (await call<VerifyResponse>("POST", `/v1/audit/verify/${f.address}`)).json;
    expect(clean).toMatchObject({ ok: true, chainOk: true, gaps: [] });

    const t = await call<{ seq: number; before: string; after: string }>("POST", `/v1/demo/tamper/${f.address}`);
    expect(t.json.before).not.toBe(t.json.after);

    const dirty = (await call<VerifyResponse>("POST", `/v1/audit/verify/${f.address}`)).json;
    expect(dirty.ok).toBe(false);
    expect(dirty.batches[0]!.ok).toBe(false);
    expect(dirty.batches[0]!.firstBadSeq).toBe(t.json.seq);

    await call("POST", "/v1/demo/reset");
    expect((await call<VerifyResponse>("POST", `/v1/audit/verify/${f.address}`)).json.ok).toBe(true);
  });

  it("access proofs verify against the anchored root", async () => {
    const { f } = ids();
    const entry = store.accessFor(f.address)[0]!;
    const proof = (await call<AccessProofResponse>("GET", `/v1/proof/access/${entry.id}`)).json;
    expect(verifyMerkleProof(entry.hash, proof.merklePath, proof.merkleRoot)).toBe(true);
  });
});

describe("gateway log", () => {
  it("rejects a hash that does not match the entry", async () => {
    const { f } = ids();
    const { seq, prevHash } = store.nextLogPosition(f.address);
    const res = await call<{ error: { code: string } }>("POST", "/v1/gateway/log", {
      at: 1, decision: "ALLOWED", endpoint: "GET /x", fiduciary: f.address, id: "x", latencyMs: 1,
      principal: DEMO_PRINCIPAL, purposeCode: "credit_check", reason: "OK", seq, prevHash,
      hash: "0x" + "11".repeat(32), batchIndex: null,
    });
    expect(res.status).toBe(400);
    expect(res.json.error.code).toBe("BAD_HASH");
  });
});

describe("remaining routes", () => {
  it.each([
    ["GET", `/v1/principals/${DEMO_PRINCIPAL}/consents`],
    ["GET", `/v1/principals/${DEMO_PRINCIPAL}/activity?limit=3`],
    ["GET", `/v1/audit/fiduciaries`],
    ["GET", `/v1/audit/ledger`],
  ])("%s %s returns 200", async (method, path) => {
    expect((await call(method, path)).status).toBe(200);
  });

  it("returns the seeded consents with the typed shape", async () => {
    const { json } = await call<PrincipalConsentsResponse>("GET", `/v1/principals/${DEMO_PRINCIPAL}/consents`);
    expect(json.fiduciaries.map((x) => x.fiduciary.name)).toEqual(["QuickLoan", "MediCare+", "FoodRush"]);
    expect(json.nonce).toMatch(/^\d+$/);
    expect(json.domain).toMatchObject({ name: "Sammati", version: "1", chainId: 31337 });
  });

  it("guards demo controls with DEMO_MODE", async () => {
    const config = readConfig({ DEMO_MODE: "false" });
    const app = createApp({ store: new StubStore(config), config, publish: () => {} });
    const s = createServer(app);
    await new Promise<void>((r) => s.listen(0, r));
    const res = await fetch(`http://127.0.0.1:${(s.address() as AddressInfo).port}/v1/demo/reset`, { method: "POST" });
    expect(res.status).toBe(403);
    await new Promise((r) => s.close(r));
  });
});
