import type { AddressInfo } from "node:net";
import { createServer, type Server } from "node:http";
import { WebSocket } from "ws";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { WsAck, WsEvent } from "@sammati/shared";
import { readConfig } from "../src/config";
import { StubStore } from "../src/store";
import { startStubEmitter } from "../src/stub-events";
import { WsHub } from "../src/ws";

let server: Server;
let hub: WsHub;
let url: string;
let stop: () => void;

beforeAll(async () => {
  server = createServer();
  hub = new WsHub(server);
  stop = startStubEmitter(hub, new StubStore(readConfig({})), 20);
  await new Promise<void>((r) => server.listen(0, r));
  url = `ws://127.0.0.1:${(server.address() as AddressInfo).port}/ws`;
});

afterAll(async () => {
  stop();
  await hub.close();
  await new Promise((r) => server.close(r));
});

function collect(sub: string[], count: number): Promise<WsEvent[]> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const got: WsEvent[] = [];
    const timer = setTimeout(() => reject(new Error(`only got ${got.length} events`)), 3000);
    ws.on("open", () => ws.send(JSON.stringify({ sub })));
    ws.on("message", (raw) => {
      const msg = JSON.parse(raw.toString()) as WsEvent | WsAck;
      if (msg.event === "subscribed") return; // the acknowledgement is not an event
      got.push(msg);
      if (got.length === count) {
        clearTimeout(timer);
        ws.close();
        resolve(got);
      }
    });
  });
}

describe("/ws stub emitter", () => {
  it("auditor subscribers see all five event types", async () => {
    const events = await collect(["auditor"], 5);
    expect(new Set(events.map((e) => e.event))).toEqual(
      new Set(["consent.updated", "access.logged", "cascade.updated", "anchor.posted", "tamper.alert"]),
    );
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
    const events = await collect(["principal:0x0000000000000000000000000000000000000001"], 1).catch(() => []);
    expect(events).toEqual([]);
  });
});
