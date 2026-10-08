// The Processor's connections to the rest of the system. Every one of them is best effort and none can carry
// plaintext: events and webhooks are built from handles, hashes and codes (trd.md §6.5, §6.7).
import { sammati, type SammatiGate } from "@sammati/gateway";
import { WebSocket } from "ws";
import type { Hex, VaultEvent } from "@sammati/shared";
import type { ProcessorConfig } from "./config";
import type { AccessLogger, CompanyNotifier, EventSink, ProcessorService } from "./service";

const POST_TIMEOUT_MS = 3000;

/** Reports events to Core, which fans them out. A failure is a warning: events never block a response. */
export class CoreEventSink implements EventSink {
  constructor(private readonly config: ProcessorConfig) {}

  emit(event: VaultEvent): void {
    void fetch(`${this.config.coreUrl}/v1/events/vault`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-sammati-processor-key": this.config.eventKey },
      body: JSON.stringify(event),
      signal: AbortSignal.timeout(POST_TIMEOUT_MS),
    })
      .then((res) => {
        if (!res.ok) console.warn(`[processor] Core refused an event (${res.status})`);
      })
      .catch(() => console.warn("[processor] could not reach Core to report an event"));
  }
}

/** Tells a company's backend which handle it now holds (or no longer holds). */
export class WebhookNotifier implements CompanyNotifier {
  constructor(private readonly config: ProcessorConfig) {}

  notify(fiduciary: Hex, payload: Parameters<CompanyNotifier["notify"]>[1]): void {
    const url = this.config.callbacks[fiduciary.toLowerCase()];
    const key = [...this.config.apiKeys].find(([, address]) => address === fiduciary.toLowerCase())?.[0];
    if (!url || !key) return;
    void fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-sammati-api-key": key },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(POST_TIMEOUT_MS),
    }).catch(() => console.warn("[processor] could not reach a company's callback"));
  }
}

/** Writes each use of data into the company's hash-chained log through the gateway SDK, the normal path. */
export class SdkAccessLogger implements AccessLogger {
  private readonly gates = new Map<string, SammatiGate>();

  constructor(private readonly config: ProcessorConfig) {}

  private gate(fiduciary: Hex): SammatiGate {
    let gate = this.gates.get(fiduciary);
    if (!gate) {
      // liveCache off: this gate only writes log entries, it never decides consent (the chain read in consent.ts does).
      gate = sammati({ coreUrl: this.config.coreUrl, fiduciary, liveCache: false });
      this.gates.set(fiduciary, gate);
    }
    return gate;
  }

  logAccess(fiduciary: Hex, entry: Parameters<AccessLogger["logAccess"]>[1]): string {
    return this.gate(fiduciary).logAccess({ ...entry, endpoint: "POST /v1/processor/evaluate" });
  }

  async flush(): Promise<void> {
    await Promise.all([...this.gates.values()].map((g) => g.flush()));
  }

  close(): void {
    for (const g of this.gates.values()) g.close();
  }
}

/**
 * Watches Core's consent events so a withdrawal erases the ciphertext at once instead of at the next sweep. The
 * event is only a prompt: the service re-reads the chain before erasing anything, so a lying Core can at worst
 * make the Processor look, never make it erase or decrypt.
 */
export function watchConsent(config: ProcessorConfig, service: ProcessorService): () => void {
  const topics = [...new Set(config.apiKeys.values())].map((f) => `fiduciary:${f}`);
  const url = config.coreUrl.replace(/^http/, "ws") + "/ws";
  let stopped = false;
  let socket: WebSocket | null = null;
  let attempt = 0;

  const connect = (): void => {
    if (stopped) return;
    socket = new WebSocket(url);
    socket.on("open", () => {
      attempt = 0;
      socket?.send(JSON.stringify({ sub: topics }));
    });
    socket.on("message", (raw) => {
      try {
        const e = JSON.parse(raw.toString()) as { event?: string; principal?: string; fiduciary?: string; purposeCode?: string };
        if (e.event === "consent.updated" && e.principal && e.fiduciary && e.purposeCode) {
          void service.recheckFor(e.principal, e.fiduciary, e.purposeCode);
        }
      } catch {
        // a malformed frame is ignored
      }
    });
    const retry = (): void => {
      socket = null;
      if (!stopped) setTimeout(connect, Math.min(1000 * 2 ** attempt++, 8000));
    };
    socket.on("close", retry);
    socket.on("error", () => socket?.close());
  };
  connect();
  return () => {
    stopped = true;
    socket?.close();
  };
}
