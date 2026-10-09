import type { Server } from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import type { Hex, WsAck, WsEvent, WsSubscribe, WsTopic } from "@sammati/shared";
import { originAllowed } from "@sammati/shared/src/server";

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
    case "consent.expiring":
    case "consent.expired":
    case "consent.renewal_requested":
    case "data.erased":
    case "rights.updated":
    case "cascade.acknowledged":
      return [principalTopic(e.principal)];
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
  /** False between a ping and its pong: a client still false at the next ping is gone (trd.md §10.6). */
  alive: boolean;
}

/** Render's proxy drops a connection idle for about a minute; a ping every 25 s keeps live ones open. */
export const PING_INTERVAL_MS = 25_000;

export class WsHub {
  private readonly wss: WebSocketServer;
  private readonly clients = new Set<Client>();

  private readonly pinger: NodeJS.Timeout;

  /** `origins`: browser origins allowed to open a socket (a missing Origin, as from the wallet and the SDK, is allowed). */
  constructor(server: Server, origins: string[] = ["*"], pingIntervalMs = PING_INTERVAL_MS) {
    this.wss = new WebSocketServer({ server, path: "/ws", verifyClient: ({ origin }: { origin?: string }) => originAllowed(origins, origin) });
    this.pinger = setInterval(() => this.ping(), pingIntervalMs);
    this.pinger.unref();
    this.wss.on("connection", (socket) => {
      const client: Client = { socket, topics: new Set(), alive: true };
      socket.on("pong", () => {
        client.alive = true;
      });
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

  private ping(): void {
    for (const c of this.clients) {
      if (!c.alive) {
        c.socket.terminate();
        this.clients.delete(c);
        continue;
      }
      c.alive = false;
      c.socket.ping();
    }
  }

  close(): Promise<void> {
    clearInterval(this.pinger);
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
