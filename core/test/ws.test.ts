import type { AddressInfo } from "node:net";
import { createServer, type Server } from "node:http";
import { WebSocket, type ClientOptions } from "ws";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { WsAck, WsEvent } from "@sammati/shared";
import { WsHub } from "../src/ws";

let server: Server;
let hub: WsHub;
let url: string;

beforeAll(async () => {
  server = createServer();
  hub = new WsHub(server);
  await new Promise<void>((r) => server.listen(0, r));
  url = `ws://127.0.0.1:${(server.address() as AddressInfo).port}/ws`;
});

afterAll(async () => {
  await hub.close();
  await new Promise((r) => server.close(r));
});

const PRINCIPAL = "0x0000000000000000000000000000000000000001";
const FIDUCIARY = "0x0000000000000000000000000000000000000002";
const OTHER = "0x0000000000000000000000000000000000000003";

/** Subscribes, waits for the acknowledgement, then publishes `events` and returns what the socket received. */
function publishTo(sub: string[], events: WsEvent[], expected: number): Promise<WsEvent[]> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const got: WsEvent[] = [];
    const timer = setTimeout(() => {
      ws.close();
      if (expected === 0) resolve(got);
      else reject(new Error(`only got ${got.length} events`));
    }, expected === 0 ? 300 : 3000);
    ws.on("open", () => ws.send(JSON.stringify({ sub })));
    ws.on("message", (raw) => {
      const msg = JSON.parse(raw.toString()) as WsEvent | WsAck;
      if (msg.event === "subscribed") {
        for (const e of events) hub.publish(e);
        return;
      }
      got.push(msg);
      if (got.length === expected) {
        clearTimeout(timer);
        ws.close();
        resolve(got);
      }
    });
  });
}

const consentUpdated = (principal: string): WsEvent =>
  ({ event: "consent.updated", principal, fiduciary: FIDUCIARY, purposeId: "0x" + "00".repeat(32), status: "Active", expiresAt: 1, at: 1, txHash: "0x" + "11".repeat(32) }) as unknown as WsEvent;

describe("/ws", () => {
  it("auditor subscribers see every customer's events", async () => {
    const events = await publishTo(["auditor"], [consentUpdated(PRINCIPAL), consentUpdated(OTHER)], 2);
    expect(events.map((e) => e.event)).toEqual(["consent.updated", "consent.updated"]);
  });

  it("acknowledges a subscription with the topics now active", async () => {
    const ack = await new Promise<WsAck>((resolve) => {
      const ws = new WebSocket(url);
      ws.on("open", () => ws.send(JSON.stringify({ sub: ["Auditor", "principal:0xABC"] })));
      ws.on("message", (raw) => {
        resolve(JSON.parse(raw.toString()) as WsAck);
        ws.close();
      });
    });
    expect(ack).toEqual({ event: "subscribed", topics: ["auditor", "principal:0xabc"] });
  });

  it("only delivers events for subscribed topics", async () => {
    const events = await publishTo([`principal:${PRINCIPAL}`], [consentUpdated(OTHER)], 0);
    expect(events).toEqual([]);
    expect(await publishTo([`principal:${PRINCIPAL}`], [consentUpdated(PRINCIPAL)], 1)).toHaveLength(1);
  });
});

describe("keep-alive (trd.md §10.6)", () => {
  it("pings every client on a timer, keeps one that answers and drops one that does not", async () => {
    const live = createServer();
    const fast = new WsHub(live, ["*"], 60);
    await new Promise<void>((r) => live.listen(0, r));
    const address = `ws://127.0.0.1:${(live.address() as AddressInfo).port}/ws`;

    const answering = new WebSocket(address); // the ws client answers pings by itself
    const silent = new WebSocket(address, { autoPong: false } as unknown as ClientOptions); // the option exists in ws 8.18, its typings lag
    let pings = 0;
    answering.on("ping", () => pings++);
    let silentClosed = false;
    silent.on("close", () => (silentClosed = true));
    await Promise.all([new Promise((r) => answering.once("open", r)), new Promise((r) => silent.once("open", r))]);

    await new Promise((r) => setTimeout(r, 400));
    expect(pings).toBeGreaterThanOrEqual(3);
    expect(answering.readyState).toBe(WebSocket.OPEN);
    expect(silentClosed).toBe(true);
    expect(fast.clientCount).toBe(1);

    answering.close();
    await fast.close();
    await new Promise((r) => live.close(r));
  });

  it("refuses a browser origin that is not on the allowlist, and lets a client with no Origin in", async () => {
    const live = createServer();
    const strict = new WsHub(live, ["https://app.example.com"], 60_000);
    await new Promise<void>((r) => live.listen(0, r));
    const address = `ws://127.0.0.1:${(live.address() as AddressInfo).port}/ws`;
    const attempt = (headers: Record<string, string>) =>
      new Promise<string>((resolve) => {
        const ws = new WebSocket(address, { headers });
        ws.once("open", () => {
          ws.close();
          resolve("open");
        });
        ws.once("error", () => resolve("refused"));
      });
    expect(await attempt({})).toBe("open");
    expect(await attempt({ origin: "https://app.example.com" })).toBe("open");
    expect(await attempt({ origin: "https://evil.example.net" })).toBe("refused");
    await strict.close();
    await new Promise((r) => live.close(r));
  });
});
