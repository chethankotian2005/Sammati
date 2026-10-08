// What the Processor says over HTTP, and everywhere else it can speak (logs, events, errors), searched for the data
// it holds (V-02, V-05): the demo PAN, the income band and the private key must appear nowhere.
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getBytes, hexlify } from "ethers";
import { generateKeyPair } from "@sammati/shared/src/envelope";
import { createApp } from "../src/app";
import { PAN, QL_KEY, QUICKLOAN, rig } from "./rig";

const KEY = generateKeyPair();
const KEY_HEX = hexlify(KEY.privateKey);

const r = rig({}, KEY.privateKey);
const logLines: string[] = [];
const spoken: string[] = []; // every response, whole, in order
let server: Server;
let url: string;

const consoleSpies = ["log", "info", "warn", "error", "debug"].map((m) => vi.spyOn(console, m as "log").mockImplementation(() => {}));

beforeAll(async () => {
  server = createApp(r.service, r.config, (line) => logLines.push(line)).listen(0);
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise((res) => server.close(res)));

/** What the Processor answers with, as the tests read it (every field they look at, typed once). */
interface Answer {
  error: { code: string };
  code: string;
  entryId: string;
  handle: string;
  [key: string]: unknown;
}

async function call(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<{ status: number; json: Answer; headers: Headers }> {
  const res = await fetch(url + path, {
    method,
    headers: { ...(body !== undefined ? { "content-type": "application/json" } : {}), ...headers },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
  const text = await res.text();
  spoken.push(`${method} ${path} -> ${res.status} ${[...res.headers].map(([k, v]) => `${k}: ${v}`).join("; ")} ${text}`);
  return { status: res.status, json: (text ? JSON.parse(text) : {}) as Answer, headers: res.headers };
}

const evaluate = (handle: string) =>
  call("POST", "/v1/processor/evaluate", { handle, fiduciary: QUICKLOAN, purposeCode: "credit_check", action: "loan_decision" }, { "x-sammati-api-key": QL_KEY });

describe("HTTP surface", () => {
  it("serves the public key, labelled as a simulated enclave", async () => {
    const res = await call("GET", "/v1/processor/pubkey");
    expect(res.json).toEqual({ v: 1, alg: "X25519", publicKey: r.enclave.publicKey, mode: "simulated-enclave" });
    expect((await call("GET", "/health")).json).toMatchObject({ ok: true, service: "processor", mode: "simulated-enclave" });
  });

  it("runs the whole story over HTTP: submit, evaluate, view, withdraw, evaluate, erased", async () => {
    r.consent.allow(r.principal, QUICKLOAN, "credit_check");
    const body = await r.walletSubmission();
    const submitted = await call("POST", "/v1/vault/submit", body);
    expect(submitted.status).toBe(201);
    const { handle } = submitted.json as { handle: string };
    expect((await call("POST", "/v1/vault/submit", body)).status).toBe(200); // replay: same answer

    const view = await call("GET", `/v1/vault/${handle}`);
    expect(view.json).toMatchObject({ status: "stored", purposeCode: "credit_check", envelope: body.envelope });
    expect(Object.keys(view.json).sort()).toEqual(["ciphertextHash", "createdAt", "envelope", "erasedAt", "fiduciary", "handle", "principal", "purposeCode", "status"]);

    const decision = await evaluate(handle);
    expect(decision.status).toBe(200);
    expect(decision.json).toMatchObject({ decision: "approved", limit: 300000, reasonCodes: ["SCORE_FAIR"] });
    expect(decision.headers.get("x-sammati-entry-id")).toBe(decision.json.entryId);

    r.consent.deny(r.principal, QUICKLOAN, "credit_check", "CONSENT_WITHDRAWN");
    const blocked = await evaluate(handle);
    expect(blocked.status).toBe(451);
    expect(blocked.json).toEqual({ code: "CONSENT_WITHDRAWN", message: expect.any(String) });
    expect(blocked.headers.get("x-sammati-entry-id")).toMatch(/^[0-9a-f-]{36}$/);
    expect((await call("GET", `/v1/vault/${handle}`)).json).toMatchObject({ status: "erased", envelope: null });
  });

  it("answers errors in the documented shapes", async () => {
    expect((await call("POST", "/v1/processor/evaluate", {}, {})).json).toEqual({ error: { code: "UNAUTHORIZED", message: expect.any(String) } });
    expect((await call("GET", "/v1/vault/not-a-handle")).status).toBe(404);
    expect((await call("GET", "/nope")).json.error.code).toBe("NOT_FOUND");
    expect((await call("POST", "/v1/vault/submit", { principal: "x" })).status).toBe(400);
  });

  it("a malformed body that happens to contain the data is not echoed back or logged", async () => {
    const res = await call("POST", "/v1/vault/submit", `{"pan": "${PAN}", oops`);
    expect(res.status).toBe(400);
    expect(res.json.error.code).toBe("BAD_JSON");
    const big = await call("POST", "/v1/vault/submit", { pad: `${PAN}${"x".repeat(20_000)}` });
    expect(big.status).toBe(413);
  });

  it("the demo tamper control makes the next evaluate an error", async () => {
    r.consent.allow(r.principal, QUICKLOAN, "credit_check");
    const { handle } = (await call("POST", "/v1/vault/submit", await r.walletSubmission())).json as { handle: string };
    expect((await call("POST", `/v1/demo/tamper/${handle}`)).status).toBe(200);
    const res = await evaluate(handle);
    expect([res.status, res.json.error.code]).toEqual([422, "CIPHERTEXT_INVALID"]);
    expect((await call("POST", "/v1/demo/tamper/0x" + "00".repeat(32))).status).toBe(404);
    expect((await call("POST", "/v1/demo/reset")).status).toBe(200);
    expect(r.vault.allLive()).toHaveLength(0);
  });
});

describe("no plaintext anywhere (V-05)", () => {
  it("the data and the key appear in no response, log line, event, console output or stored row", () => {
    const consoleOutput = consoleSpies.flatMap((s) => s.mock.calls.map((c) => c.map(String).join(" ")));
    const everything = JSON.stringify({ spoken, logLines, events: r.events, webhooks: r.webhooks, logs: r.logs, consoleOutput });
    // controls: the search covers real traffic, so an empty capture cannot pass for a clean one
    expect(spoken.length).toBeGreaterThan(10);
    expect(logLines.length).toBeGreaterThan(10);
    expect(everything).toContain("approved");
    expect(everything).toContain("CIPHERTEXT_INVALID");
    expect(JSON.stringify({ leaked: PAN })).toContain(PAN);
    for (const secret of [PAN, "6-9 LPA", KEY_HEX, KEY_HEX.slice(2), Buffer.from(getBytes(KEY_HEX)).toString("base64")]) {
      expect(everything).not.toContain(secret);
    }
    const stored = r.vault.allLive().map((row) => row.ciphertext!.toString("latin1")).join("");
    expect(stored).not.toContain(PAN);
  });

  it("there is no route that could return plaintext: the app registers exactly the documented ones", () => {
    const app = createApp(r.service, r.config, () => {});
    const routes: string[] = [];
    // express keeps its router stack on a private property; this is a test-only look at it
    for (const layer of (app as unknown as { _router: { stack: Array<{ route?: { path: string; methods: Record<string, boolean> } }> } })._router.stack) {
      if (layer.route) routes.push(`${Object.keys(layer.route.methods).join(",").toUpperCase()} ${layer.route.path}`);
    }
    expect(routes.sort()).toEqual([
      "GET /health",
      "GET /v1/processor/pubkey",
      "GET /v1/vault/:handle",
      "POST /v1/demo/reset",
      "POST /v1/demo/tamper/:handle",
      "POST /v1/processor/evaluate",
      "POST /v1/vault/submit",
    ]);
  });
});
