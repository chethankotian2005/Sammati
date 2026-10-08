import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express from "express";
import { WebSocketServer } from "ws";
import type { ConsentStateResponse, StoredAccessLogEntry } from "@sammati/shared";

/** A stand-in for Core that speaks its real protocol (REST + WebSocket with subscribe ack) and can misbehave on demand. */
export class FakeCore {
  /** What /v1/gateway/consent-state answers. */
  verdict: Partial<ConsentStateResponse> & { valid: boolean } = { valid: true, status: "Active", expiresAt: null };
  /** Make consent-state answer 503. */
  stateDown = false;
  stateDelayMs = 0;
  logDelayMs = 0;
  /** Accept WebSocket connections (and ack subscriptions). */
  wsEnabled = true;

  stateCalls = 0;
  readonly logs: StoredAccessLogEntry[] = [];
  readonly subscribed: string[][] = [];

  private server!: Server;
  private wss!: WebSocketServer;
  url = "";

  async start(): Promise<this> {
    const app = express();
    app.use(express.json());
    app.get("/v1/gateway/consent-state", async (_req, res) => {
      this.stateCalls++;
      if (this.stateDelayMs) await new Promise((r) => setTimeout(r, this.stateDelayMs));
      if (this.stateDown) return void res.status(503).json({ error: { code: "LEDGER_UNAVAILABLE" } });
      res.json({ checkedAt: Math.floor(Date.now() / 1000), ...this.verdict });
    });
    app.get("/v1/fiduciaries/:fid/access", (_req, res) => res.json({ items: this.logs.slice(-1) }));
    app.post("/v1/gateway/log", async (req, res) => {
      if (this.logDelayMs) await new Promise((r) => setTimeout(r, this.logDelayMs));
      const row = req.body as StoredAccessLogEntry;
      const last = this.logs[this.logs.length - 1];
      if (row.seq !== (last?.seq ?? 0) + 1) return void res.status(409).json({});
      this.logs.push(row);
      res.status(201).json({ accepted: true, seq: row.seq });
    });

    this.server = app.listen(0);
    this.url = `http://127.0.0.1:${(this.server.address() as AddressInfo).port}`;
    this.wss = new WebSocketServer({ server: this.server, path: "/ws" });
    this.wss.on("connection", (socket) => {
      if (!this.wsEnabled) return void socket.terminate();
      socket.on("message", (raw) => {
        const { sub } = JSON.parse(raw.toString()) as { sub: string[] };
        this.subscribed.push(sub);
        socket.send(JSON.stringify({ event: "subscribed", topics: sub }));
      });
    });
    return this;
  }

  get connectedClients(): number {
    return this.wss.clients.size;
  }

  /** Pushes an event to every connected gateway, like Core's hub would. */
  push(event: Record<string, unknown>): void {
    for (const c of this.wss.clients) c.send(JSON.stringify(event));
  }

  /** Drops every WebSocket (the gateway will try to reconnect). */
  dropSockets(): void {
    for (const c of this.wss.clients) c.terminate();
  }

  async stop(): Promise<void> {
    this.dropSockets();
    await new Promise((r) => this.wss.close(r));
    await new Promise((r) => this.server.close(r));
  }
}
