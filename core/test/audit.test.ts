import type { AddressInfo } from "node:net";
import { createServer, type Server } from "node:http";
import { randomUUID } from "node:crypto";
import { Wallet, id } from "ethers";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  EXPLORERS,
  GRANT_CONSENT_TYPE,
  SEED_FIDUCIARIES,
  WITHDRAW_CONSENT_TYPE,
  ZERO_HASH,
  chainEntry,
  hashEntry,
  merkleRoot,
  purposeIdOf,
  verifyMerkleProof,
  type AccessLogEntry,
  type AccessProofResponse,
  type AuditFiduciariesResponse,
  type AuditLedgerResponse,
  type AuditReportResponse,
  type ConsentProofResponse,
  type DemoAnchorResponse,
  type Scorecard,
  type TamperResponse,
  type VerifyResponse,
  type WsEvent,
} from "@sammati/shared";
import { createRealApp } from "../src/app";
import type { Config } from "../src/config";
import { AnchorJob } from "../src/real/anchor";
import { createRealCore, type RealCore } from "../src/real/core";
import { toHashedEntry } from "../src/store";
import { realConfig, startTestChain, type TestChain } from "./harness";

// Hardhat account #0 is the data principal throughout.
const wallet = new Wallet("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");
const PRINCIPAL = wallet.address;
const [QUICKLOAN, MEDICARE, FOODRUSH] = SEED_FIDUCIARIES;
// QuickLoan carries the anchor and tamper stories, MediCare+ the scorecard and the re-hash attacks,
// FoodRush the missing-row story: each keeps its own history so the tests do not trample each other.
const QL = QUICKLOAN!.address;
const MC = MEDICARE!.address;
const FR = FOODRUSH!.address;
const NO_SUCH_COMPANY = "0x000000000000000000000000000000000000dEaD";

let chain: TestChain;
let core: RealCore;
let config: Config;
let server: Server;
let base: string;
const events: WsEvent[] = [];

async function api<T = unknown>(method: string, path: string, body?: unknown): Promise<{ status: number; json: T }> {
  const res = await fetch(base + path, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: (await res.json()) as T };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// --- writing log entries, the way the gateway SDK does ---

const heads = new Map<string, { seq: number; hash: string }>();

async function appendLog(fiduciary: string, over: Partial<AccessLogEntry> = {}): Promise<AccessLogEntry> {
  const head = heads.get(fiduciary) ?? { seq: 0, hash: ZERO_HASH };
  const entry: AccessLogEntry = {
    at: Math.floor(Date.now() / 1000),
    decision: "ALLOWED",
    endpoint: "GET /customers/:id/credit-profile",
    fiduciary,
    id: randomUUID(),
    latencyMs: 4,
    principal: PRINCIPAL,
    purposeCode: "credit_check",
    reason: "OK",
    seq: head.seq + 1,
    ...over,
  };
  const chained = chainEntry(head.hash, entry);
  const res = await api("POST", "/v1/gateway/log", { ...entry, prevHash: chained.prevHash, hash: chained.hash, batchIndex: null });
  expect(res.status, `log seq ${entry.seq}`).toBe(201);
  heads.set(fiduciary, { seq: entry.seq, hash: chained.hash });
  return entry;
}

async function appendMany(fiduciary: string, n: number, over: Partial<AccessLogEntry> = {}): Promise<void> {
  for (let i = 0; i < n; i++) await appendLog(fiduciary, over);
}

// --- consents on chain ---

let nonce = 0;
const domain = () => ({ name: "Sammati", version: "1", chainId: 31337, verifyingContract: chain.deployment.consentRegistry });
const inOneHour = () => Math.floor(Date.now() / 1000) + 3600;

async function grant(fiduciary: string, code: string): Promise<void> {
  const m = {
    principal: PRINCIPAL,
    fiduciary,
    purposeId: purposeIdOf(fiduciary, code),
    expiresAt: inOneHour() + 86_400,
    noticeHash: id("notice"),
    nonce: String(nonce++),
    deadline: inOneHour(),
  };
  const signature = await wallet.signTypedData(domain(), { GrantConsent: [...GRANT_CONSENT_TYPE] }, m);
  expect((await api("POST", "/v1/consents/grant", { request: m, signature })).status).toBe(200);
}

async function withdraw(fiduciary: string, code: string): Promise<void> {
  const m = { principal: PRINCIPAL, fiduciary, purposeId: purposeIdOf(fiduciary, code), nonce: String(nonce++), deadline: inOneHour() };
  const signature = await wallet.signTypedData(domain(), { WithdrawConsent: [...WITHDRAW_CONSENT_TYPE] }, m);
  expect((await api("POST", "/v1/consents/withdraw", { request: m, signature })).status).toBe(200);
}

/** Block time of the most recent grant or withdrawal of a company. */
const lastConsentTime = (fiduciary: string) => core.repo.consentHistory(fiduciary).at(-1)!.at;

// --- reading back ---

const verify = async (fiduciary: string) => (await api<VerifyResponse>("POST", `/v1/audit/verify/${fiduciary}`)).json;
const rows = (fiduciary: string) => core.repo.accessAsc(fiduciary);
const scorecardOf = async (fiduciary: string) =>
  (await api<AuditFiduciariesResponse>("GET", "/v1/audit/fiduciaries")).json.fiduciaries.find((s) => s.fiduciary === fiduciary)!;

/** The batches as the chain holds them: [root, fromSeq, toSeq, count, at], as strings. */
async function onChainBatches(fiduciary: string): Promise<string[][]> {
  const n = Number(await core.chain.anchor.batchCount(fiduciary));
  return Promise.all(Array.from({ length: n }, async (_, i) => (await core.chain.anchor.getBatch(fiduciary, i)).map(String)));
}

/** Re-chains a company's stored rows from `fromSeq` on, as an attacker rewriting the log consistently would. */
function rewriteFrom(fiduciary: string, fromSeq: number, mutate: (row: ReturnType<typeof rows>[number]) => void): void {
  let previous: string = ZERO_HASH;
  for (const r of rows(fiduciary)) {
    if (r.seq === fromSeq) mutate(r);
    if (r.seq >= fromSeq) {
      const prevHash = r.seq === fromSeq ? r.prevHash : previous;
      const hash = hashEntry(prevHash, toHashedEntry(r));
      core.db.prepare("UPDATE access_logs SET decision = ?, prev_hash = ?, hash = ? WHERE fiduciary = ? AND seq = ?").run(r.decision, prevHash, hash, fiduciary, r.seq);
      previous = hash;
    } else {
      previous = r.hash;
    }
  }
}

beforeAll(async () => {
  chain = await startTestChain();
  config = realConfig(chain, { anchorIntervalMs: 0 }); // anchoring is driven explicitly below
  core = await createRealCore(config, (e) => events.push(e), () => {});
  server = createServer(createRealApp(core));
  await new Promise<void>((r) => server.listen(0, r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  core.start();
});

afterAll(async () => {
  core?.stop();
  await new Promise((r) => server?.close(r));
  await chain?.stop();
});

describe("the anchor job", () => {
  it("anchors pending entries as one batch: a Merkle root over the stored entry hashes", async () => {
    await appendMany(QL, 7);
    expect(core.repo.pendingCount(QL)).toBe(7);

    const done = await core.anchors.runOnce(QL);
    const hashes = rows(QL).map((r) => r.hash);
    expect(done).toHaveLength(1);
    expect(done[0]).toMatchObject({ index: 0, fromSeq: 1, toSeq: 7, count: 7, merkleRoot: merkleRoot(hashes) });

    // on chain, in the indexed table, on the rows, and announced
    expect(await onChainBatches(QL)).toEqual([[merkleRoot(hashes), "1", "7", "7", expect.any(String)]]);
    expect(core.repo.anchorsFor(QL)).toEqual([expect.objectContaining({ index: 0, fromSeq: 1, toSeq: 7, count: 7, merkleRoot: merkleRoot(hashes) })]);
    expect(rows(QL).every((r) => r.batchIndex === 0)).toBe(true);
    expect(events.filter((e) => e.event === "anchor.posted")).toHaveLength(1);

    expect(await core.anchors.runOnce(QL)).toEqual([]); // nothing pending: no empty batch
  });

  it("anchors early once 20 entries are waiting, without the timer", async () => {
    const before = Number(await core.chain.anchor.batchCount(QL));
    await appendMany(QL, 19);
    expect(core.repo.pendingCount(QL)).toBe(19);
    expect(Number(await core.chain.anchor.batchCount(QL))).toBe(before);

    await appendLog(QL, { decision: "BLOCKED", reason: "CONSENT_WITHDRAWN" }); // the 20th
    await vi.waitFor(async () => expect(Number(await core.chain.anchor.batchCount(QL))).toBe(before + 1), { timeout: 10_000 });
    const batch = (await onChainBatches(QL)).at(-1)!;
    expect(Number(batch[1])).toBe(8); // right after the previous batch's toSeq
    expect(Number(batch[3])).toBeGreaterThanOrEqual(20);
  });

  it("anchors on its timer too", async () => {
    config.anchorIntervalMs = 100;
    core.anchors.start();
    try {
      await appendMany(QL, 3);
      await vi.waitFor(() => expect(core.repo.pendingCount(QL)).toBe(0), { timeout: 10_000 });
    } finally {
      core.anchors.stop();
      config.anchorIntervalMs = 0;
    }
  });

  it("keeps batches contiguous from seq 1 and covers every stored entry", async () => {
    await core.anchors.runOnce();
    let next = 1;
    for (const [, from, to, count] of await onChainBatches(QL)) {
      expect(Number(from)).toBe(next);
      expect(Number(count)).toBe(Number(to) - Number(from) + 1);
      next = Number(to) + 1;
    }
    expect(next - 1).toBe(rows(QL).length);
  });

  it("POST /v1/demo/anchor anchors what is waiting right now, instead of at the next tick", async () => {
    await appendMany(QL, 2);
    expect(core.repo.pendingCount(QL)).toBe(2);

    const res = await api<DemoAnchorResponse>("POST", "/v1/demo/anchor", { fiduciary: QL });
    expect(res.status).toBe(200);
    expect(res.json.batches).toHaveLength(1);
    expect(res.json.batches[0]).toMatchObject({ fiduciary: QL, count: 2, merkleRoot: expect.stringMatching(/^0x[0-9a-f]{64}$/), txHash: expect.stringMatching(/^0x[0-9a-f]{64}$/) });
    expect(core.repo.pendingCount(QL)).toBe(0);

    expect((await api<DemoAnchorResponse>("POST", "/v1/demo/anchor")).json.batches).toEqual([]); // nothing left for anyone
  });

  it("POST /v1/demo/anchor needs DEMO_MODE and a known company", async () => {
    expect((await api("POST", "/v1/demo/anchor", { fiduciary: NO_SUCH_COMPANY })).status).toBe(404);
    config.demoMode = false;
    try {
      expect((await api("POST", "/v1/demo/anchor")).status).toBe(403);
    } finally {
      config.demoMode = true;
    }
  });
  it("will not anchor around a hole in the stored log", async () => {
    await appendMany(FR, 5);
    core.db.prepare("DELETE FROM access_logs WHERE fiduciary = ? AND seq = 3").run(FR);
    const warnings: string[] = [];
    const job = new AnchorJob(config, core.repo, core.chain, core.indexer, (m) => warnings.push(m));

    const first = await job.runOnce(FR);
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({ fromSeq: 1, toSeq: 2, count: 2 }); // only the unbroken run before the hole
    expect(await job.runOnce(FR)).toEqual([]);
    expect(warnings.some((w) => w.includes("jumps from seq 2 to 4"))).toBe(true);
  });
});

describe("POST /v1/audit/verify/:fid on clean data", () => {
  it("passes, batch by batch, and records the result", async () => {
    const v = await verify(QL);
    expect(v).toMatchObject({ fiduciary: QL, ok: true, chainOk: true, gaps: [], firstMismatch: null });
    expect(v.batches).toHaveLength((await onChainBatches(QL)).length);
    for (const b of v.batches) {
      expect(b).toMatchObject({ ok: true, firstBadSeq: null });
      expect(b.recomputedRoot).toBe(b.anchoredRoot);
    }
    expect((await scorecardOf(QL)).integrity).toBe("verified");
    expect(events.filter((e) => e.event === "tamper.alert")).toHaveLength(0);
  });

  it("passes on a company with no log at all, and with an unanchored tail", async () => {
    expect(await verify(MC)).toMatchObject({ ok: true, batches: [], firstMismatch: null });
    await appendLog(QL); // pending, not anchored yet
    expect(await verify(QL)).toMatchObject({ ok: true, firstMismatch: null });
    await core.anchors.runOnce(QL);
  });

  it("reads the anchors from the chain, not from Core's own table", async () => {
    core.db.prepare("DELETE FROM anchor_batches").run(); // Core's record of the anchors is gone...
    const v = await verify(QL);
    expect(v.ok).toBe(true); // ...and verification does not care
    expect(v.batches.length).toBeGreaterThan(0);
    await core.indexer.resync(); // put the table back for what follows
    expect(core.repo.anchorsFor(QL).length).toBe(v.batches.length);
  });

  it("404s for an unknown company", async () => {
    expect((await api("POST", `/v1/audit/verify/${NO_SUCH_COMPANY}`)).status).toBe(404);
  });
});

describe("scorecard, ledger and report (MediCare+)", () => {
  it("counts consents, decisions and batches, and judges access against the ledger", async () => {
    await grant(MC, "treatment");
    await grant(MC, "insurance_claim");
    await sleep(1100); // the consent must be older than the withdrawal by a whole second for the tolerance below to be unambiguous
    await withdraw(MC, "insurance_claim");
    const tW = lastConsentTime(MC);
    const tGrant = core.repo.consentHistory(MC)[1]!.at;
    expect(tW).toBeGreaterThan(tGrant);

    await appendLog(MC, { purposeCode: "treatment", at: tGrant + 1 }); // consented: fine
    await appendLog(MC, { purposeCode: "insurance_claim", at: tW }); // the very second of the withdrawal: the company gets the benefit
    await appendLog(MC, { purposeCode: "insurance_claim", at: tW + 5 }); // five seconds after, still allowed: a violation
    await appendLog(MC, { purposeCode: "insurance_claim", at: tW + 6, decision: "BLOCKED", reason: "CONSENT_WITHDRAWN" });
    await appendLog(MC, { purposeCode: "research", at: tW + 7 }); // never consented to: a violation
    await core.anchors.runOnce(MC);
    expect((await verify(MC)).ok).toBe(true);

    expect(await scorecardOf(MC)).toMatchObject<Partial<Scorecard>>({
      name: "MediCare+",
      activeConsents: 1,
      withdrawnConsents: 1,
      allowed: 4,
      blocked: 1,
      anchoredBatches: 1,
      integrity: "verified",
      violations: 2,
      avgWithdrawalToBlockSeconds: 5,
    });
  });

  it("does not mistake clock skew for a violation: requests stamped with the wall clock right after a grant are fine", async () => {
    // The gateway stamps entries with wall-clock time, the ledger with block time. If the chain's clock
    // runs ahead (a burst of blocks does that unless the node is told not to), a request made just after
    // a grant would look as if it came before it. The test chain went through a burst: the seed.
    const before = (await scorecardOf(QL)).violations;
    await grant(QL, "marketing");
    const wall = Math.floor(Date.now() / 1000);
    expect(lastConsentTime(QL)).toBeLessThanOrEqual(wall + 1); // the chain's clock is the wall clock, give or take a second
    await appendLog(QL, { purposeCode: "marketing", at: wall });
    expect((await scorecardOf(QL)).violations).toBe(before);
  });

  it("counts a withdrawal as unacknowledged only once it is older than 30 s, and clears it on acknowledgement", async () => {
    const outstanding = async () => (await scorecardOf(MC)).unacknowledgedCascades;
    // The cascade engine acknowledges the withdrawal within moments, so it counts nothing even once the withdrawal is old...
    await vi.waitFor(() => expect(core.repo.cascadeFor(PRINCIPAL, purposeIdOf(MC, "insurance_claim"))[0]!.ackedAt).not.toBeNull(), { timeout: 10_000 });
    core.db.prepare("UPDATE consents_cache SET updated_at = updated_at - 100 WHERE fiduciary = ? AND status = 'Withdrawn'").run(MC);
    expect(await outstanding()).toBe(0);
    // ...so to see an outstanding one, take the acknowledgement away again (as if InsureCo never answered)
    core.db.prepare("UPDATE cascade_acks SET acked_at = NULL, tx_hash = NULL WHERE principal = ?").run(PRINCIPAL);
    expect(await outstanding()).toBe(1);
    core.repo.recordAck(PRINCIPAL, purposeIdOf(MC, "insurance_claim"), MEDICARE!.processors[0]!.address, 1, ZERO_HASH);
    expect(await outstanding()).toBe(0);
  });

  it("serves the ledger explorer with the consent events", async () => {
    const { events: ledger } = (await api<{ events: { type: string; fiduciary: string }[] }>("GET", `/v1/audit/ledger?fid=${MC}&type=withdrawn`)).json;
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({ type: "withdrawn", fiduciary: MC });
  });

  it("builds a report with the scorecard, a fresh verification and the latest ledger events", async () => {
    const r = (await api<AuditReportResponse>("GET", `/v1/audit/report/${MC}`)).json;
    expect(r.fiduciary).toBe(MC);
    expect(r.scorecard.name).toBe("MediCare+");
    expect(r.verification).toMatchObject({ fiduciary: MC, ok: true });
    expect(r.recentEvents.length).toBeGreaterThan(0);
    expect(r.recentEvents.every((e) => e.fiduciary === MC)).toBe(true);
    expect((await api("GET", `/v1/audit/report/${NO_SUCH_COMPANY}`)).status).toBe(404);
  });
});

describe("tamper detection", () => {
  it("POST /v1/demo/tamper edits one stored row; verify then fails and pinpoints exactly that record", async () => {
    const t = (await api<TamperResponse>("POST", `/v1/demo/tamper/${QL}`)).json;
    expect(t).toMatchObject({ fiduciary: QL, field: "decision", before: "BLOCKED", after: "ALLOWED" });
    const tampered = rows(QL).find((r) => r.seq === t.seq)!;
    expect(tampered.batchIndex).not.toBeNull(); // it chose an anchored row

    const v = await verify(QL);
    expect(v.ok).toBe(false);
    expect(v.chainOk).toBe(false);
    expect(v.firstMismatch).toEqual({ kind: "HASH_MISMATCH", seq: t.seq, entryId: tampered.id, batchIndex: tampered.batchIndex });

    // only the batch holding the edited row fails, and it says which row; every other batch still checks out
    const bad = v.batches.filter((b) => !b.ok);
    expect(bad.map((b) => b.index)).toEqual([tampered.batchIndex]);
    expect(bad[0]).toMatchObject({ firstBadSeq: t.seq });
    expect(bad[0]!.recomputedRoot).not.toBe(bad[0]!.anchoredRoot);
    expect(v.batches.filter((b) => b.ok).every((b) => b.recomputedRoot === b.anchoredRoot)).toBe(true);

    // the alarm went out and the scorecard remembers
    expect(events.find((e) => e.event === "tamper.alert")).toMatchObject({ fiduciary: QL, firstBadSeq: t.seq, batchIndex: tampered.batchIndex });
    expect((await scorecardOf(QL)).integrity).toBe("tampered");
    expect((await api<AuditReportResponse>("GET", `/v1/audit/report/${QL}`)).json.verification.ok).toBe(false);

    // putting the original value back makes it pass again: the finding is the data, not a latch
    core.db.prepare("UPDATE access_logs SET decision = ? WHERE fiduciary = ? AND seq = ?").run(t.before, QL, t.seq);
    expect((await verify(QL)).ok).toBe(true);
    expect((await scorecardOf(QL)).integrity).toBe("verified");
  });

  it("is refused without DEMO_MODE, and when there is no stored entry to edit", async () => {
    config.demoMode = false;
    try {
      expect((await api("POST", `/v1/demo/tamper/${QL}`)).status).toBe(403);
    } finally {
      config.demoMode = true;
    }

    const empty = await createRealCore(realConfig(chain), () => {}, () => {}); // a database with no log
    const srv = createServer(createRealApp(empty));
    try {
      await new Promise<void>((r) => srv.listen(0, r));
      const res = await fetch(`http://127.0.0.1:${(srv.address() as AddressInfo).port}/v1/demo/tamper/${QL}`, { method: "POST" });
      expect(res.status).toBe(409);
      expect(((await res.json()) as { error: { code: string } }).error.code).toBe("NOTHING_TO_TAMPER");
    } finally {
      await new Promise((r) => srv.close(r));
      empty.stop();
    }
  });

  it("catches an edit whose hash was re-computed, at the row after it", async () => {
    // the attacker flips row 3 and fixes up that one row's hash, hoping the chain stays plausible
    const row3 = rows(MC).find((r) => r.seq === 3)!;
    const newHash = hashEntry(row3.prevHash, toHashedEntry({ ...row3, decision: "BLOCKED" }));
    core.db.prepare("UPDATE access_logs SET decision = 'BLOCKED', hash = ? WHERE fiduciary = ? AND seq = 3").run(newHash, MC);

    const v = await verify(MC);
    expect(v.ok).toBe(false);
    expect(v.firstMismatch).toMatchObject({ kind: "BROKEN_LINK", seq: 4, batchIndex: 0 }); // row 4 still points at the old hash
    expect(v.batches[0]).toMatchObject({ ok: false, firstBadSeq: 4 });
    expect(v.batches[0]!.recomputedRoot).not.toBe(v.batches[0]!.anchoredRoot);
  });

  it("catches a log rewritten consistently from one row on, by its root alone", async () => {
    rewriteFrom(MC, 3, (r) => {
      r.decision = "BLOCKED";
    });
    const after = rows(MC);
    after.forEach((r, i) => {
      expect(r.hash).toBe(hashEntry(r.prevHash, toHashedEntry(r))); // every row is self-consistent...
      expect(r.prevHash).toBe(i === 0 ? ZERO_HASH : after[i - 1]!.hash); // ...and correctly linked
    });

    const v = await verify(MC); // ...yet the anchored root remembers the original
    expect(v.ok).toBe(false);
    expect(v.chainOk).toBe(true);
    expect(v.firstMismatch).toEqual({ kind: "ROOT_MISMATCH", seq: null, entryId: null, batchIndex: 0 });
  });

  it("reports a deleted row as missing, ahead of the broken link it causes", async () => {
    // FoodRush lost its row 3 earlier; more entries have been written since
    await appendMany(FR, 4);
    const v = await verify(FR);
    expect(v.ok).toBe(false);
    expect(v.gaps).toEqual([3]);
    // seq 3 lies after the only anchored batch (1 to 2), so no batch is to blame
    expect(v.firstMismatch).toEqual({ kind: "MISSING_ENTRY", seq: 3, entryId: null, batchIndex: null });
  });
});

describe("GET /v1/proof/access/:entryId", () => {
  it("gives a Merkle path from the entry's hash to the root anchored on chain", async () => {
    const batches = await onChainBatches(QL);
    const anchored = rows(QL).filter((r) => r.batchIndex !== null);
    expect(anchored.length).toBeGreaterThan(20);
    for (const r of anchored) {
      const p = (await api<AccessProofResponse>("GET", `/v1/proof/access/${r.id}`)).json;
      expect(p.merkleRoot).toBe(batches[p.batchIndex]![0]);
      expect(p.entry).toMatchObject({ id: r.id, seq: r.seq, hash: r.hash });
      expect(hashEntry(p.entry.prevHash, toHashedEntry(p.entry))).toBe(p.entry.hash); // the content matches its hash
      expect(verifyMerkleProof(p.entry.hash, p.merklePath, p.merkleRoot)).toBe(true); // and the hash is in the batch
      expect(p.anchorTxHash).toMatch(/^0x[0-9a-f]{64}$/);
    }
  });

  it("shows an edited row: its content no longer matches the hash the path starts from", async () => {
    const victim = rows(QL).find((r) => r.batchIndex !== null)!;
    core.db.prepare("UPDATE access_logs SET decision = 'BLOCKED', reason = 'NO_CONSENT' WHERE fiduciary = ? AND seq = ?").run(QL, victim.seq);
    const p = (await api<AccessProofResponse>("GET", `/v1/proof/access/${victim.id}`)).json;
    expect(hashEntry(p.entry.prevHash, toHashedEntry(p.entry))).not.toBe(p.entry.hash);
    core.db.prepare("UPDATE access_logs SET decision = ?, reason = ? WHERE fiduciary = ? AND seq = ?").run(victim.decision, victim.reason, QL, victim.seq);
  });

  it("404s for an unknown entry and 409s for one that is not anchored yet", async () => {
    expect((await api("GET", "/v1/proof/access/nope")).status).toBe(404);
    const pending = await appendLog(QL);
    const res = await api<{ error: { code: string } }>("GET", `/v1/proof/access/${pending.id}`);
    expect(res.status).toBe(409);
    expect(res.json.error.code).toBe("NOT_ANCHORED");
    await core.anchors.runOnce(QL);
    expect((await api("GET", `/v1/proof/access/${pending.id}`)).status).toBe(200);
  });
});

describe("explorer links in proof responses", () => {
  const consentTx = () => core.repo.ledgerEvents({ type: "granted" })[0]!.txHash;

  /** A second Core on the same chain, as if its deployment record said otherwise. */
  async function coreWith(over: Partial<Config>): Promise<{ url: string; stop: () => Promise<void> }> {
    const other = await createRealCore(realConfig(chain, over), () => {}, () => {});
    await other.indexer.syncOnce();
    const srv = createServer(createRealApp(other));
    await new Promise<void>((r) => srv.listen(0, r));
    return {
      url: `http://127.0.0.1:${(srv.address() as AddressInfo).port}`,
      stop: async () => {
        await new Promise((r) => srv.close(r));
        other.stop();
      },
    };
  }

  const getJson = async <T>(url: string): Promise<T> => (await fetch(url)).json() as Promise<T>;

  it("carries no link on the local chain, which has no explorer, rather than a link to nowhere", async () => {
    const proof = (await api<ConsentProofResponse>("GET", `/v1/proof/consent/${consentTx()}`)).json;
    expect(proof.explorerUrl).toBeNull();
    const anchored = rows(QL).find((r) => r.batchIndex !== null)!;
    expect((await api<AccessProofResponse>("GET", `/v1/proof/access/${anchored.id}`)).json.explorerUrl).toBeNull();
    const ledger = (await api<AuditLedgerResponse>("GET", "/v1/audit/ledger")).json.events;
    expect(ledger.length).toBeGreaterThan(0);
    expect(ledger.every((e) => e.explorerUrl === null)).toBe(true);
  });

  it("links consent proofs and the ledger explorer to the explorer when the deployment is on Amoy", async () => {
    const amoy = await coreWith({ deployment: { ...chain.deployment, explorerUrl: EXPLORERS.amoy } });
    try {
      const proof = await getJson<ConsentProofResponse>(`${amoy.url}/v1/proof/consent/${consentTx()}`);
      expect(proof.explorerUrl).toBe(`${EXPLORERS.amoy}/tx/${consentTx()}`);
      const ledger = (await getJson<AuditLedgerResponse>(`${amoy.url}/v1/audit/ledger`)).events;
      expect(ledger.every((e) => e.explorerUrl === `${EXPLORERS.amoy}/tx/${e.txHash}`)).toBe(true);
    } finally {
      await amoy.stop();
    }
  });

  it("links access proofs to the anchor transaction when the chain has an explorer", async () => {
    const anchored = rows(QL).find((r) => r.batchIndex !== null)!;
    core.explorerUrl = EXPLORERS.amoy!;
    try {
      const p = (await api<AccessProofResponse>("GET", `/v1/proof/access/${anchored.id}`)).json;
      expect(p.explorerUrl).toBe(`${EXPLORERS.amoy}/tx/${p.anchorTxHash}`);
    } finally {
      core.explorerUrl = null;
    }
  });

  it("lets CHAIN_EXPLORER_URL override the deployment's explorer", async () => {
    const custom = await coreWith({ explorerUrl: "https://explorer.example.test/" });
    try {
      const proof = await getJson<ConsentProofResponse>(`${custom.url}/v1/proof/consent/${consentTx()}`);
      expect(proof.explorerUrl).toBe(`https://explorer.example.test/tx/${consentTx()}`);
    } finally {
      await custom.stop();
    }
  });
});
describe("overview and outage", () => {
  it("lists all three companies, each with the integrity state its last verification left", async () => {
    const { fiduciaries } = (await api<AuditFiduciariesResponse>("GET", "/v1/audit/fiduciaries")).json;
    expect(fiduciaries.map((f) => [f.name, f.integrity])).toEqual([
      ["QuickLoan", "verified"],
      ["MediCare+", "tampered"], // the re-hash attacks above
      ["FoodRush", "tampered"], // the deleted row
    ]);
  });

  it("answers 503 to a verification the ledger cannot back, rather than vouching for the log alone", async () => {
    await chain.stop();
    const res = await api<{ error: { code: string } }>("POST", `/v1/audit/verify/${QL}`);
    expect(res.status).toBe(503);
    expect(res.json.error.code).toBe("LEDGER_UNAVAILABLE");
  });
});
