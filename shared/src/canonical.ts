import { getAddress, getBytes, hexlify, keccak256, solidityPacked, toUtf8Bytes } from "ethers";
import type { AccessLogEntry, Hex } from "./types";

export const ZERO_HASH = "0x" + "00".repeat(32);

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

/**
 * Canonical JSON (drd.md §4.1): sorted keys, no whitespace, UTF-8, integers
 * only. Floats and undefined are rejected so two implementations can never
 * disagree on number formatting.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) {
      throw new Error(`canonicalJson: non-integer or unsafe number ${value}`);
    }
    return String(value);
  }
  if (Array.isArray(value)) {
    return "[" + value.map(canonicalJson).join(",") + "]";
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const parts = Object.keys(obj)
      .sort()
      .map((k) => {
        if (obj[k] === undefined) throw new Error(`canonicalJson: undefined at "${k}"`);
        return JSON.stringify(k) + ":" + canonicalJson(obj[k]);
      });
    return "{" + parts.join(",") + "}";
  }
  throw new Error(`canonicalJson: unsupported type ${typeof value}`);
}

export function canonicalBytes(value: unknown): Uint8Array {
  return toUtf8Bytes(canonicalJson(value));
}

export function keccakBytes(data: Uint8Array): string {
  return keccak256(data);
}

export function keccakUtf8(text: string): string {
  return keccak256(toUtf8Bytes(text));
}

export function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

/** purposeId = keccak256(abi.encodePacked(fiduciary, code)) (trd.md §3.1). */
export function purposeIdOf(fiduciary: string, code: string): string {
  return keccak256(solidityPacked(["address", "string"], [fiduciary, code]));
}

// --- Access log entries (drd.md §4.1, trd.md §8) ---

/** Hashed form: everything except prevHash, hash and batchIndex. */
export function entryCanonical(entry: AccessLogEntry): string {
  return canonicalJson(entry);
}

export function hashEntry(prevHash: string, entry: AccessLogEntry): string {
  return keccak256(concatBytes(getBytes(prevHash), canonicalBytes(entry)));
}

export interface ChainedEntry {
  entry: AccessLogEntry;
  prevHash: string;
  hash: string;
}

/** Entry format (drd.md §4.1a): 1 has no `outcome` key, 2 has `outcome` and `dataCategories`. */
export function entryFormat(entry: Pick<AccessLogEntry, "outcome">): 1 | 2 {
  return entry.outcome === undefined ? 1 : 2;
}

/**
 * The prevHash an entry must carry given the entry before it (drd.md §4.1a). The first format-2 entry starts a new epoch
 * and links to the zero hash; everything else links to its predecessor.
 */
export function expectedPrevHash(previous: { hash: string; format: 1 | 2 } | null, format: 1 | 2): string {
  if (!previous) return ZERO_HASH;
  return format === 2 && previous.format === 1 ? ZERO_HASH : previous.hash;
}

/** Appends one entry to a per-fiduciary chain; first entry uses ZERO_HASH. */
export function chainEntry(prevHash: string | null, entry: AccessLogEntry): ChainedEntry {
  const prev = prevHash ?? ZERO_HASH;
  return { entry, prevHash: prev, hash: hashEntry(prev, entry) };
}

// --- Notice hash (drd.md §4.2) ---

export interface NoticePurposeInput {
  id: string;
  desc_en: string;
  desc_hi: string;
  desc_kn: string;
  dataCategories: string[];
  retentionDays: number;
  sharesThirdParty: boolean;
}

export interface NoticeInput {
  fiduciary: string;
  purposes: NoticePurposeInput[];
  version: number;
}

export function noticeHash(notice: NoticeInput): string {
  return keccak256(canonicalBytes(notice));
}

// --- Description and metadata hashes (drd.md §4.2a) ---

export function descHash(description: { en: string; hi: string; kn: string }): string {
  return keccak256(canonicalBytes({ desc_en: description.en, desc_hi: description.hi, desc_kn: description.kn }));
}

export function fiduciaryMetaHash(f: { name: string; sector: string }): string {
  return keccak256(canonicalBytes({ name: f.name, sector: f.sector }));
}

export function processorMetaHash(p: { name: string }): string {
  return keccak256(canonicalBytes({ name: p.name }));
}

// --- Merkle (drd.md §4.3) ---

function hexLess(a: string, b: string): boolean {
  return a.toLowerCase() < b.toLowerCase();
}

/** Parent = keccak256(min(a,b) || max(a,b)). */
export function hashPair(a: string, b: string): string {
  const [lo, hi] = hexLess(a, b) ? [a, b] : [b, a];
  return keccak256(concatBytes(getBytes(lo), getBytes(hi)));
}

/** All tree levels, leaves first. An odd node is promoted unchanged. */
function buildLevels(leaves: string[]): string[][] {
  if (leaves.length === 0) throw new Error("merkle: no leaves");
  const levels: string[][] = [leaves.map((l) => hexlify(getBytes(l)))];
  while (levels[levels.length - 1]!.length > 1) {
    const cur = levels[levels.length - 1]!;
    const next: string[] = [];
    for (let i = 0; i < cur.length; i += 2) {
      const right = cur[i + 1];
      next.push(right === undefined ? cur[i]! : hashPair(cur[i]!, right));
    }
    levels.push(next);
  }
  return levels;
}

export function merkleRoot(leaves: string[]): string {
  const levels = buildLevels(leaves);
  return levels[levels.length - 1]![0]!;
}

/** Sibling hashes from leaf to root. Promoted levels contribute no sibling. */
export function merkleProof(leaves: string[], index: number): string[] {
  if (!Number.isInteger(index) || index < 0 || index >= leaves.length) {
    throw new Error("merkle: leaf index out of range");
  }
  const levels = buildLevels(leaves);
  const proof: string[] = [];
  let i = index;
  for (let l = 0; l < levels.length - 1; l++) {
    const sibling = levels[l]![i ^ 1];
    if (sibling !== undefined) proof.push(sibling);
    i = i >> 1;
  }
  return proof;
}

export function verifyMerkleProof(leaf: string, proof: string[], root: string): boolean {
  let acc = hexlify(getBytes(leaf));
  for (const sibling of proof) acc = hashPair(acc, sibling);
  return acc === root.toLowerCase();
}

/**
 * The EIP-55 form of an address. Core stores addresses this way, and an access-log entry's hash covers them, so a
 * writer that hashed a lower-case address would be rejected as out of sync with the chain it is extending.
 */
export function checksumAddress(address: string): Hex {
  return getAddress(address.toLowerCase()) as Hex; // lower-cased first: a mixed-case address with a wrong checksum is still that address
}
