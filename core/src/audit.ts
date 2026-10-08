import {
  ZERO_HASH,
  hashEntry,
  merkleProof,
  merkleRoot,
  type AccessProofResponse,
  type AuditReportResponse,
  type BatchVerification,
  type Hex,
  type Scorecard,
  type StoredAccessLogEntry,
  type TamperResponse,
  type VerifyResponse,
} from "@sammati/shared";
import { HttpError } from "./errors";
import { now, toHashedEntry, type StubStore } from "./store";

/**
 * Recomputes the hash chain from stored entry fields (never trusting stored
 * hashes), rebuilds each batch's Merkle root and compares to the anchored one
 * (drd.md §7). An edited row therefore breaks its own hash and every root after it.
 */
export function verifyFiduciary(store: StubStore, fiduciary: Hex): VerifyResponse {
  const f = store.fiduciary(fiduciary);
  const rows = [...store.accessFor(f.address)].sort((a, b) => a.seq - b.seq);

  const gaps: number[] = [];
  const recomputed = new Map<number, Hex>();
  let prev = ZERO_HASH;
  let chainOk = true;
  let firstBadSeq: number | null = null;
  let expectedSeq = 1;

  for (const row of rows) {
    for (; expectedSeq < row.seq; expectedSeq++) gaps.push(expectedSeq);
    expectedSeq = row.seq + 1;
    const hash = hashEntry(prev, toHashedEntry(row));
    recomputed.set(row.seq, hash);
    if (hash !== row.hash || row.prevHash !== (recomputed.get(row.seq - 1) ?? ZERO_HASH)) {
      chainOk = false;
      firstBadSeq ??= row.seq;
    }
    prev = hash;
  }

  const batches: BatchVerification[] = store.anchorsFor(f.address).map((b) => {
    const leaves: Hex[] = [];
    for (let seq = b.fromSeq; seq <= b.toSeq; seq++) {
      const h = recomputed.get(seq);
      if (h) leaves.push(h);
    }
    const recomputedRoot = leaves.length ? merkleRoot(leaves) : ZERO_HASH;
    const bad = rows.find((r) => r.seq >= b.fromSeq && r.seq <= b.toSeq && r.hash !== recomputed.get(r.seq));
    return {
      index: b.index,
      fromSeq: b.fromSeq,
      toSeq: b.toSeq,
      anchoredRoot: b.merkleRoot,
      recomputedRoot,
      ok: recomputedRoot.toLowerCase() === b.merkleRoot.toLowerCase() && leaves.length === b.count,
      firstBadSeq: bad?.seq ?? null,
    };
  });

  const ok = chainOk && gaps.length === 0 && batches.every((b) => b.ok);
  store.setIntegrity(f.address, ok ? "verified" : "tampered");
  return { fiduciary: f.address, ok, chainOk, gaps, batches, verifiedAt: now() };
}

export function scorecard(store: StubStore, fiduciary: Hex): Scorecard {
  const f = store.fiduciary(fiduciary);
  const consents = store.fiduciaryConsents(f.address);
  const rows = store.accessFor(f.address);
  return {
    fiduciary: f.address,
    name: f.name,
    sector: f.sector,
    color: f.color,
    activeConsents: consents.filter((c) => c.status === "Active").length,
    withdrawnConsents: consents.filter((c) => c.status === "Withdrawn").length,
    allowed: rows.filter((r) => r.decision === "ALLOWED").length,
    blocked: rows.filter((r) => r.decision === "BLOCKED").length,
    anchoredBatches: store.anchorsFor(f.address).length,
    integrity: store.integrityOf(f.address),
    violations: 0, // needs per-entry consent history; the real Core computes it from the ledger
  };
}

export function report(store: StubStore, fiduciary: Hex): AuditReportResponse {
  const f = store.fiduciary(fiduciary);
  const verification = verifyFiduciary(store, f.address);
  return {
    fiduciary: f.address,
    generatedAt: now(),
    scorecard: scorecard(store, f.address),
    verification,
    recentEvents: store.ledgerEvents
      .filter((e) => e.fiduciary?.toLowerCase() === f.address.toLowerCase())
      .slice(-20)
      .reverse(),
  };
}

/**
 * Edits one stored row without touching its hash, like someone hiding a block
 * in the company database. Prefers an anchored BLOCKED entry (flips it to ALLOWED).
 */
export function tamper(store: StubStore, fiduciary: Hex): TamperResponse {
  const f = store.fiduciary(fiduciary);
  const anchored = store.accessFor(f.address).filter((r) => r.batchIndex !== null);
  const target = [...anchored].reverse().find((r) => r.decision === "BLOCKED") ?? anchored[anchored.length - 1];
  if (!target) throw new HttpError(409, "NOTHING_TO_TAMPER", "No anchored entries to tamper with yet");
  const before = target.decision;
  target.decision = before === "BLOCKED" ? "ALLOWED" : "BLOCKED";
  return { fiduciary: f.address, seq: target.seq, field: "decision", before, after: target.decision };
}

export function accessProof(store: StubStore, entryId: string, explorerBase: string): AccessProofResponse {
  let entry: StoredAccessLogEntry | undefined;
  for (const f of store.fiduciaries) {
    entry = store.accessFor(f.address).find((r) => r.id === entryId);
    if (entry) break;
  }
  if (!entry) throw new HttpError(404, "ENTRY_NOT_FOUND", `Unknown access entry ${entryId}`);
  const batch = store.anchorsFor(entry.fiduciary).find((b) => entry.seq >= b.fromSeq && entry.seq <= b.toSeq);
  if (!batch) throw new HttpError(409, "NOT_ANCHORED", "Entry is not in an anchored batch yet");

  const leaves = store
    .accessFor(entry.fiduciary)
    .filter((r) => r.seq >= batch.fromSeq && r.seq <= batch.toSeq)
    .sort((a, b) => a.seq - b.seq)
    .map((r) => r.hash);
  return {
    entry,
    merklePath: merkleProof(leaves, entry.seq - batch.fromSeq),
    merkleRoot: batch.merkleRoot,
    batchIndex: batch.index,
    anchorTxHash: batch.txHash,
    explorerUrl: `${explorerBase}/tx/${batch.txHash}`,
  };
}
