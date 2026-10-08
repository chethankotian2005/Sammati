import type { AddressInfo } from "node:net";
import { createServer, type Server } from "node:http";
import { WebSocket } from "ws";
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
