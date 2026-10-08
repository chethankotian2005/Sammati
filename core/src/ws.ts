import type { Server } from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import type { Hex, WsAck, WsEvent, WsSubscribe, WsTopic } from "@sammati/shared";

const lc = (s: string): string => s.toLowerCase();

export const principalTopic = (a: Hex): WsTopic => `principal:${lc(a)}`;
export const fiduciaryTopic = (a: Hex): WsTopic => `fiduciary:${lc(a)}`;
export const AUDITOR_TOPIC: WsTopic = "auditor";

/** Topics that should receive each event (trd.md §6.5). */
export function topicsFor(e: WsEvent): WsTopic[] {
  switch (e.event) {
    case "consent.updated":
    case "access.logged":
      return [principalTopic(e.principal), fiduciaryTopic(e.fiduciary), AUDITOR_TOPIC];
    case "cascade.updated":
      return [principalTopic(e.principal), AUDITOR_TOPIC];
    case "anchor.posted":
    case "tamper.alert":
      return [fiduciaryTopic(e.fiduciary), AUDITOR_TOPIC];
    case "consent.requested":
      return [principalTopic(e.principal)];
    case "request.updated":
      return [fiduciaryTopic(e.fiduciary)];
    case "fiduciary.registered":
    case "fiduciary.updated":
      return [fiduciaryTopic(e.fiduciary), AUDITOR_TOPIC];
    case "vault.encrypted":
    case "vault.stored":
    case "vault.erased":
    case "processor.requested":
    case "processor.decrypting":
    case "processor.decided":
      return [principalTopic(e.principal), fiduciaryTopic(e.fiduciary), AUDITOR_TOPIC];
  }
}

interface Client {
  socket: WebSocket;
  topics: Set<WsTopic>;
}

export class WsHub {
  private readonly wss: WebSocketServer;
  private readonly clients = new Set<Client>();

  constructor(server: Server) {
    this.wss = new WebSocketServer({ server, path: "/ws" });
    this.wss.on("connection", (socket) => {
      const client: Client = { socket, topics: new Set() };
      this.clients.add(client);
      socket.on("message", (raw) => this.subscribe(client, raw.toString()));
      socket.on("close", () => this.clients.delete(client));
      socket.on("error", () => this.clients.delete(client));
    });
  }

  get clientCount(): number {
    return this.clients.size;
  }

  publish(event: WsEvent): void {
    const topics = topicsFor(event);
    const payload = JSON.stringify(event);
    for (const c of this.clients) {
      if (c.socket.readyState === WebSocket.OPEN && topics.some((t) => c.topics.has(t))) {
        c.socket.send(payload);
      }
    }
  }

  close(): Promise<void> {
    for (const c of this.clients) c.socket.terminate();
    return new Promise((resolve) => this.wss.close(() => resolve()));
  }

  private subscribe(client: Client, raw: string): void {
    try {
      const msg = JSON.parse(raw) as Partial<WsSubscribe>;
      if (!Array.isArray(msg.sub)) return;
      for (const t of msg.sub) {
        if (typeof t === "string") client.topics.add(lc(t));
      }
      client.socket.send(JSON.stringify({ event: "subscribed", topics: [...client.topics] } satisfies WsAck));
    } catch {
      // ignore malformed frames; the socket stays usable
    }
  }
}
