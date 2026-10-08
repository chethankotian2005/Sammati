import {
  ZERO_HASH,
  explorerTxUrl,
  hashEntry,
  merkleProof,
  merkleRoot,
  type AccessProofResponse,
  type AuditReportResponse,
  type BatchVerification,
  type Hex,
  type Mismatch,
  type Scorecard,
  type StoredAccessLogEntry,
  type TamperResponse,
  type VerifyResponse,
} from "@sammati/shared";
import { HttpError } from "../errors";
import { now, toHashedEntry } from "../store";
import { toHttpError } from "./chain";
import type { RealCore } from "./core";

/** A withdrawal must be acknowledged within this long before it counts as outstanding (trd.md §6.3). */
const ACK_GRACE_SECONDS = 30;
const RECENT_EVENTS = 20;

interface RowProblem {
  kind: "HASH_MISMATCH" | "BROKEN_LINK" | "MISSING_ENTRY";
  seq: number;
  entryId: string | null;
}

interface OnChainBatch {
  index: number;
  root: Hex;
  fromSeq: number;
  toSeq: number;
  count: number;
}

async function readBatches(core: RealCore, fiduciary: Hex): Promise<OnChainBatch[]> {
  const { anchor } = core.chain;
  const total = Number(await anchor.batchCount(fiduciary));
  const batches: OnChainBatch[] = [];
  for (let index = 0; index < total; index++) {
    const [root, fromSeq, toSeq, count] = await anchor.getBatch(fiduciary, index);
    batches.push({ index, root: root as Hex, fromSeq: Number(fromSeq), toSeq: Number(toSeq), count: Number(count) });
  }
  return batches;
}

/**
 * Recomputes a company's log from its stored rows and compares it with what is anchored on chain
 * (trd.md §6.3). Reads the batches from the chain itself, never from Core's own tables, so a Core
 * database that was edited cannot vouch for itself.
 */
export async function verifyFiduciary(core: RealCore, fiduciary: Hex): Promise<VerifyResponse> {
  const f = core.repo.fiduciary(fiduciary);
  let onChain: OnChainBatch[];
  try {
    onChain = await readBatches(core, f.address);
  } catch (err) {
    throw toHttpError(err);
  }
  const rows = core.repo.accessAsc(f.address);

  const problems: RowProblem[] = [];
  const gaps: number[] = [];
  const recomputed = new Map<number, Hex>();
  let expectedSeq = 1;
  let previousHash: Hex = ZERO_HASH;
  for (const row of rows) {
    for (; expectedSeq < row.seq; expectedSeq++) {
      gaps.push(expectedSeq);
      problems.push({ kind: "MISSING_ENTRY", seq: expectedSeq, entryId: null });
    }
    expectedSeq = row.seq + 1;

    const hash = hashEntry(row.prevHash, toHashedEntry(row)) as Hex;
    recomputed.set(row.seq, hash);
    if (row.prevHash !== previousHash) problems.push({ kind: "BROKEN_LINK", seq: row.seq, entryId: row.id });
    if (hash !== row.hash) problems.push({ kind: "HASH_MISMATCH", seq: row.seq, entryId: row.id });
    previousHash = row.hash;
  }
  problems.sort((a, b) => a.seq - b.seq);

  const batches: BatchVerification[] = onChain.map((b) => {
    const leaves: Hex[] = [];
    for (let seq = b.fromSeq; seq <= b.toSeq; seq++) {
      const h = recomputed.get(seq);
      if (h) leaves.push(h);
    }
    const recomputedRoot = leaves.length ? (merkleRoot(leaves) as Hex) : ZERO_HASH;
    return {
      index: b.index,
      fromSeq: b.fromSeq,
      toSeq: b.toSeq,
      anchoredRoot: b.root,
      recomputedRoot,
      ok: recomputedRoot.toLowerCase() === b.root.toLowerCase() && leaves.length === b.count,
      firstBadSeq: problems.find((p) => p.seq >= b.fromSeq && p.seq <= b.toSeq)?.seq ?? null,
    };
  });

  const batchOf = (seq: number | null) => (seq === null ? undefined : batches.find((b) => seq >= b.fromSeq && seq <= b.toSeq));
  const firstProblem = problems[0];
  const badBatch = batches.find((b) => !b.ok);
  const firstMismatch: Mismatch | null = firstProblem
    ? { kind: firstProblem.kind, seq: firstProblem.seq, entryId: firstProblem.entryId, batchIndex: batchOf(firstProblem.seq)?.index ?? null }
    : badBatch
      ? // every row is self-consistent yet the root differs: the log was rewritten (or rows removed whole), so no single row can be blamed
        { kind: "ROOT_MISMATCH", seq: null, entryId: null, batchIndex: badBatch.index }
      : null;

  const ok = firstMismatch === null;
  core.repo.setIntegrity(f.address, ok ? "verified" : "tampered");
  if (!ok) {
    core.publish({
      event: "tamper.alert",
      fiduciary: f.address,
      batchIndex: firstMismatch.batchIndex,
      firstBadSeq: firstMismatch.seq,
      detectedAt: now(),
    });
  }
  return { fiduciary: f.address, ok, chainOk: problems.length === 0, gaps, batches, firstMismatch, verifiedAt: now() };
}

/** Was there valid consent for this principal and purpose at time `t`? `inclusive` decides whether an event in the same second counts. */
function validAt(events: { type: "granted" | "withdrawn"; at: number; expiresAt: number | null }[], t: number, inclusive: boolean): boolean {
  let last: (typeof events)[number] | undefined;
  for (const e of events) if (inclusive ? e.at <= t : e.at < t) last = e;
  return last?.type === "granted" && (last.expiresAt === null || last.expiresAt > t);
}

export function scorecard(core: RealCore, fiduciary: Hex): Scorecard {
  const f = core.repo.fiduciary(fiduciary);
  const { repo } = core;
  const counts = repo.consentCounts(f.address, now());
  const decisions = repo.decisionCounts(f.address);

  const history = repo.consentHistory(f.address);
  const byConsent = new Map<string, typeof history>();
  for (const e of history) {
    const key = `${e.principal}|${e.purposeId}`;
    byConsent.set(key, [...(byConsent.get(key) ?? []), e]);
  }
  const codeToId = new Map(repo.purposesOf(f.address).map((p) => [p.code, p.id]));

  // An ALLOWED entry is a violation only if no consent stood behind it under either reading of its
  // second: the entry came just before a withdrawal, or just after a grant, is the company's benefit.
  const rows = repo.accessAsc(f.address);
  const allowed = rows.filter((r) => r.decision === "ALLOWED");
  const consentEvents = (r: StoredAccessLogEntry) => byConsent.get(`${r.principal}|${codeToId.get(r.purposeCode) ?? ""}`) ?? [];
  const violations = allowed.filter((r) => !validAt(consentEvents(r), r.at, true) && !validAt(consentEvents(r), r.at, false));

  // How long after each withdrawal did the company keep allowing that consent?
  const lags: number[] = [];
  for (const [key, events] of byConsent) {
    const [principal, purposeId] = key.split("|") as [Hex, Hex];
    const code = repo.purposeById(purposeId)?.code;
    events.forEach((e, i) => {
      if (e.type !== "withdrawn") return;
      const nextGrant = events.slice(i + 1).find((x) => x.type === "granted");
      const inWindow = rows.filter((r) => r.principal === principal && r.purposeCode === code && r.at >= e.at && (!nextGrant || r.at < nextGrant.at));
      if (inWindow.length === 0) return;
      const stillAllowed = inWindow.filter((r) => r.decision === "ALLOWED" && r.at > e.at);
      lags.push(stillAllowed.length ? Math.max(...stillAllowed.map((r) => r.at)) - e.at : 0);
    });
  }

  return {
    fiduciary: f.address,
    name: f.name,
    sector: f.sector,
    color: f.color,
    activeConsents: counts.active,
    withdrawnConsents: counts.withdrawn,
    allowed: decisions.allowed,
    blocked: decisions.blocked,
    anchoredBatches: repo.anchorsFor(f.address).length,
    integrity: repo.integrity(f.address),
    violations: violations.length,
    avgWithdrawalToBlockSeconds: lags.length ? Math.round((lags.reduce((a, b) => a + b, 0) / lags.length) * 10) / 10 : null,
    unacknowledgedCascades: repo.unacknowledgedCascades(f.address, now() - ACK_GRACE_SECONDS),
  };
}

export async function report(core: RealCore, fiduciary: Hex): Promise<AuditReportResponse> {
  const f = core.repo.fiduciary(fiduciary);
  const verification = await verifyFiduciary(core, f.address);
  return {
    fiduciary: f.address,
    generatedAt: now(),
    scorecard: scorecard(core, f.address),
    verification,
    recentEvents: core.repo.ledgerEvents({ fiduciary: f.address }, RECENT_EVENTS),
  };
}

export function tamper(core: RealCore, fiduciary: Hex): TamperResponse {
  const f = core.repo.fiduciary(fiduciary);
  const changed = core.repo.tamperRow(f.address);
  if (!changed) throw new HttpError(409, "NOTHING_TO_TAMPER", "There are no stored log entries to tamper with yet");
  return { fiduciary: f.address, seq: changed.seq, field: "decision", before: changed.before, after: changed.after };
}

/**
 * The Merkle path for one entry, built from the stored rows, with the root of the batch that is
 * anchored on chain. Checking the path against the root is what exposes an edited row.
 */
export function accessProof(core: RealCore, entryId: string): AccessProofResponse {
  const entry = core.repo.accessById(entryId);
  if (!entry) throw new HttpError(404, "ENTRY_NOT_FOUND", `Unknown access entry ${entryId}`);
  const batch = core.repo.anchorBatchFor(entry.fiduciary, entry.seq);
  if (!batch) throw new HttpError(409, "NOT_ANCHORED", "Entry is not in an anchored batch yet");

  const leaves = core.repo
    .accessAsc(entry.fiduciary)
    .filter((r) => r.seq >= batch.fromSeq && r.seq <= batch.toSeq)
    .map((r) => r.hash);
  if (leaves.length !== batch.count) {
    throw new HttpError(409, "BATCH_INCOMPLETE", `Batch ${batch.index} has ${leaves.length} stored entries but ${batch.count} were anchored`);
  }
  return {
    entry,
    merklePath: merkleProof(leaves, entry.seq - batch.fromSeq),
    merkleRoot: batch.merkleRoot,
    batchIndex: batch.index,
    anchorTxHash: batch.txHash,
    explorerUrl: explorerTxUrl(core.explorerUrl, batch.txHash),
  };
}
