// N-05: a company moves a customer's rights request along and the wallet is told (rights.updated), once per change.
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { Wallet } from "ethers";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TEST_COMPANIES, testApiKey } from "@sammati/test-fixtures";
import type { NotificationsResponse, RightsRequest, WsEvent } from "@sammati/shared";
import { createRealApp } from "../src/app";
import type { RealCore } from "../src/real/core";
import { createTestCore, realConfig, startTestChain, type TestChain } from "./harness";

const [QL, MC] = TEST_COMPANIES;
let chain: TestChain;
let core: RealCore;
let server: ReturnType<typeof createServer>;
let base: string;
const published: WsEvent[] = [];

beforeAll(async () => {
  chain = await startTestChain();
  core = await createTestCore(realConfig(chain), (e) => void published.push(e as WsEvent), () => {});
  server = createServer(createRealApp(core));
  await new Promise<void>((r) => server.listen(0, r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  core?.stop();
  await new Promise((r) => server?.close(r));
  await chain?.stop();
});

const call = async (method: string, path: string, body?: unknown, key?: string) => {
  const res = await fetch(base + path, { method, headers: { "content-type": "application/json", ...(key ? { "x-sammati-api-key": key } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, json: (await res.json()) as never as Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any
};

describe("rights requests: the company answers, the wallet is told", () => {
  const who = Wallet.createRandom();

  it("tells the customer when their request is in progress and when it is resolved, with the company's reply", async () => {
    const filed = (await call("POST", "/v1/rights", { principal: who.address, fiduciary: QL!.address, type: "grievance", note: "Late reply" })).json as unknown as RightsRequest;
    published.length = 0;
    const a = await call("POST", `/v1/fiduciaries/${QL!.address}/rights/${filed.id}`, { status: "in_progress" }, testApiKey(QL!.slug));
    expect(a.status).toBe(200);
    const b = await call("POST", `/v1/fiduciaries/${QL!.address}/rights/${filed.id}`, { status: "resolved", reply: "We have fixed this.\u0000" }, testApiKey(QL!.slug));
    expect(b.json.reply).toBe("We have fixed this.");

    const list = (await call("GET", `/v1/principals/${who.address}/notifications`)).json as unknown as NotificationsResponse;
    const mine = list.notifications.filter((n) => n.type === "rights.updated");
    expect(mine.map((n) => n.payload.rightsStatus)).toEqual(["resolved", "in_progress"]);
    expect(mine[0]!.payload).toMatchObject({ rightsId: filed.id, rightsType: "grievance", reply: "We have fixed this." });
    expect(published.filter((e) => e.event === "rights.updated")).toHaveLength(2);

    const rights = (await call("GET", `/v1/principals/${who.address}/rights`)).json as unknown as { rights: RightsRequest[] };
    expect(rights.rights[0]!.status).toBe("resolved");
  });

  it("is refused for another company's request, a bad status or a missing key", async () => {
    const filed = (await call("POST", "/v1/rights", { principal: who.address, fiduciary: QL!.address, type: "access", note: "" })).json as unknown as RightsRequest;
    expect((await call("POST", `/v1/fiduciaries/${MC!.address}/rights/${filed.id}`, { status: "resolved" }, testApiKey(MC!.slug))).status).toBe(404);
    expect((await call("POST", `/v1/fiduciaries/${QL!.address}/rights/${filed.id}`, { status: "resolved" }, testApiKey(MC!.slug))).status).toBe(403);
    expect((await call("POST", `/v1/fiduciaries/${QL!.address}/rights/${filed.id}`, { status: "open" }, testApiKey(QL!.slug))).status).toBe(400);
    expect((await call("POST", `/v1/fiduciaries/${QL!.address}/rights/${filed.id}`, { status: "resolved" })).status).toBe(401);
  });
});
