import { keccakUtf8, type WsEvent } from "@sammati/shared";
import { now, type StubStore } from "./store";
import type { WsHub } from "./ws";

const INTERVAL_MS = 3000;

/** One sample payload per event type, built from the seeded directory. */
function sampleEvents(store: StubStore, tick: number): WsEvent[] {
  const f = store.fiduciaries[tick % store.fiduciaries.length]!;
  const purpose = f.purposes[tick % f.purposes.length]!;
  const principal = store.fx.directory.demoPrincipal;
  const processor = f.processors[0];
  const txHash = keccakUtf8(`sample:${tick}`);
  const at = now();
  const allowed = tick % 3 !== 0;

  const events: WsEvent[] = [
    {
      event: "consent.updated",
      principal,
      fiduciary: f.address,
      purposeId: purpose.id,
      purposeCode: purpose.code,
      status: allowed ? "Active" : "Withdrawn",
      expiresAt: 1893456000,
      txHash,
      at,
    },
    {
      event: "access.logged",
      principal,
      fiduciary: f.address,
      fiduciaryName: f.name,
      entryId: `sample-${tick}`,
      seq: 100 + tick,
      purposeCode: purpose.code,
      decision: allowed ? "ALLOWED" : "BLOCKED",
      reason: allowed ? "OK" : "CONSENT_WITHDRAWN",
      endpoint: "GET /customers/:id/profile",
      at,
    },
    {
      event: "anchor.posted",
      fiduciary: f.address,
      batchIndex: 1 + tick,
      merkleRoot: keccakUtf8(`root:${tick}`),
      fromSeq: 1,
      toSeq: 20,
      count: 20,
      txHash,
    },
    {
      event: "tamper.alert",
      fiduciary: f.address,
      batchIndex: 0,
      firstBadSeq: 4,
      detectedAt: at,
    },
  ];
  if (processor) {
    events.splice(2, 0, {
      event: "cascade.updated",
      principal,
      purposeId: processor.purposeId,
      processor: processor.address,
      processorName: processor.name,
      notifiedAt: at - 2,
      ackedAt: at,
      txHash,
    });
  }
  return events;
}

/** Cycles through all five event types so every UI can be built before the real indexer exists. */
export function startStubEmitter(hub: WsHub, store: StubStore, intervalMs = INTERVAL_MS): () => void {
  let tick = 0;
  let queue: WsEvent[] = [];
  const timer = setInterval(() => {
    if (hub.clientCount === 0) return;
    if (queue.length === 0) queue = sampleEvents(store, tick++);
    hub.publish(queue.shift()!);
  }, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
