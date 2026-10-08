import type { AddressInfo } from "node:net";
import { createServer } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chainEntry, type AccessLogEntry, type VerifyResponse } from "@sammati/shared";
import { createRealApp } from "../src/app";
import { chainFingerprint, storedFingerprint } from "../src/real/fingerprint";
import type { RealCore } from "../src/real/core";
import { createTestCore, realConfig, startTestChain, type TestChain } from "./harness";

import { TEST_COMPANIES } from "@sammati/test-fixtures";
// The bug this guards: reset the chain, keep Core's database. The old log rows were then anchored onto
// the new chain, and every Verify after that was red before anyone had tampered with anything.
const QL = TEST_COMPANIES[0]!.address;
const PRINCIPAL = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

let chain: TestChain;
let dir: string;
let dbPath: string;
const opened: RealCore[] = [];

async function open(): Promise<RealCore> {
  const core = await createTestCore(realConfig(chain, { dbPath }), () => {}, () => {});
  opened.push(core);
  return core;
}

function close(core: RealCore): void {
  core.stop();
  opened.splice(opened.indexOf(core), 1);
}

/** Appends `n` entries to QuickLoan's log exactly as the gateway would (hash-chained from the stored head). */
function writeLog(core: RealCore, n: number): void {
  for (let i = 0; i < n; i++) {
    const { seq, prevHash } = core.repo.nextLogPosition(QL);
    const entry: AccessLogEntry = {
      at: Math.floor(Date.now() / 1000),
      decision: i % 2 ? "BLOCKED" : "ALLOWED",
      endpoint: "GET /customers/:id/credit-profile",
      fiduciary: QL,
      id: randomUUID(),
      latencyMs: 3,
      principal: PRINCIPAL,
      purposeCode: "credit_check",
      reason: i % 2 ? "CONSENT_WITHDRAWN" : "OK",
      seq,
    };
    const chained = chainEntry(prevHash, entry);
    core.repo.appendLog({ ...entry, prevHash: chained.prevHash, hash: chained.hash, batchIndex: null });
  }
}

async function verify(core: RealCore): Promise<VerifyResponse> {
  const server = createServer(createRealApp(core));
  await new Promise<void>((r) => server.listen(0, r));
  try {
    const res = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/v1/audit/verify/${QL}`, { method: "POST" });
    return (await res.json()) as VerifyResponse;
  } finally {
    await new Promise((r) => server.close(r));
  }
}

beforeAll(async () => {
  chain = await startTestChain();
  dir = mkdtempSync(join(tmpdir(), "sammati-stale-"));
  dbPath = join(dir, "core.sqlite");
});

afterAll(async () => {
  for (const c of [...opened]) close(c);
  rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  await chain?.stop();
});

describe("a database that describes a different chain", () => {
  it("keeps its data across a restart when the chain is the same one", async () => {
    const first = await open();
    writeLog(first, 3);
    await first.anchors.runOnce(QL);
    expect((await verify(first)).ok).toBe(true);
    close(first);

    const again = await open(); // same chain, same database
    expect(again.repo.accessAsc(QL)).toHaveLength(3);
    expect(again.repo.anchorsFor(QL)).toHaveLength(1);
    expect((await verify(again)).ok).toBe(true);
    close(again);
  });

  it("run, reset the chain only, restart Core: nothing stale survives and Verify is clean", async () => {
    // a run's worth of state, anchored on the old chain (the previous test left 3 rows and 1 batch)
    const run = await open();
    expect(run.repo.accessAsc(QL)).toHaveLength(3);
    const oldFingerprint = storedFingerprint(run.repo);
    close(run);

    // reset the chain only: the database file is not touched (this is what the old reset order did)
    await chain.reset();

    const restarted = await open();
    expect(storedFingerprint(restarted.repo)).not.toBe(oldFingerprint); // the guard saw a different chain
    expect(restarted.repo.accessAsc(QL)).toEqual([]); // and wiped what described the old one
    expect(restarted.repo.nextLogPosition(QL).seq).toBe(1);

    // the failure it prevents: a new run's rows start at seq 1, are anchored, and verify cleanly
    writeLog(restarted, 3);
    await restarted.anchors.runOnce(QL);
    const v = await verify(restarted);
    expect(v).toMatchObject({ ok: true, chainOk: true, gaps: [], firstMismatch: null });
    expect(v.batches.map((b) => [b.fromSeq, b.toSeq, b.ok])).toEqual([[1, 3, true]]); // batch 0 is this run's, not a stale one
    close(restarted);
  });

  it("wipes a database that records no chain at all (an old one, or a copied file)", async () => {
    const core = await open();
    writeLog(core, 2);
    core.db.prepare("DELETE FROM indexer_state WHERE key = 'chain_fingerprint'").run();
    close(core);

    const restarted = await open();
    expect(restarted.repo.accessAsc(QL)).toEqual([]);
    expect(storedFingerprint(restarted.repo)).toBe(await chainFingerprint(restarted.chain));
    close(restarted);
  });

  it("wipes by itself when the chain is replaced while Core is running", async () => {
    const live = await open();
    writeLog(live, 2);
    await live.anchors.runOnce(QL);
    await live.indexer.syncOnce();
    expect(live.repo.accessAsc(QL)).toHaveLength(2);

    await chain.reset(); // Core is up, and nobody told it
    await live.indexer.syncOnce();

    expect(live.repo.accessAsc(QL)).toEqual([]);
    expect(storedFingerprint(live.repo)).toBe(await chainFingerprint(live.chain));
    writeLog(live, 1);
    await live.anchors.runOnce(QL);
    expect((await verify(live)).ok).toBe(true);
    close(live);
  });

  it("a demo reset (wipe and re-read) keeps the guard consistent, so the next restart keeps the data", async () => {
    const core = await open();
    await core.reset();
    writeLog(core, 2);
    close(core);
    const again = await open();
    expect(again.repo.accessAsc(QL)).toHaveLength(2); // same chain: not wiped
    close(again);
  });
});
