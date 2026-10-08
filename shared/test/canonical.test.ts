import { describe, expect, it } from "vitest";
import { getBytes, keccak256, toUtf8Bytes } from "ethers";
import {
  ZERO_HASH,
  canonicalJson,
  chainEntry,
  hashEntry,
  hashPair,
  merkleProof,
  merkleRoot,
  verifyMerkleProof,
} from "../src/canonical";
import type { AccessLogEntry } from "../src/types";

const entry = (seq: number, over: Partial<AccessLogEntry> = {}): AccessLogEntry => ({
  at: 1760000000 + seq,
  decision: "BLOCKED",
  endpoint: "GET /customers/:id/credit-profile",
  fiduciary: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
  id: `id-${seq}`,
  latencyMs: 12,
  principal: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
  purposeCode: "credit_check",
  reason: "CONSENT_WITHDRAWN",
  seq,
  ...over,
});

describe("canonicalJson", () => {
  it("sorts keys recursively and emits no whitespace", () => {
    expect(canonicalJson({ b: 1, a: { d: [3, { z: null, y: true }], c: "x" } })).toBe(
      '{"a":{"c":"x","d":[3,{"y":true,"z":null}]},"b":1}',
    );
  });

  it("is independent of insertion order", () => {
    expect(canonicalJson({ a: 1, b: 2 })).toBe(canonicalJson({ b: 2, a: 1 }));
  });

  it("keeps non-ASCII as UTF-8 rather than escaping it", () => {
    expect(canonicalJson({ t: "नमस्ते" })).toBe('{"t":"नमस्ते"}');
    expect(toUtf8Bytes(canonicalJson({ t: "é" })).length).toBe(10);
  });

  it("matches the drd.md §4.1 example shape", () => {
    expect(canonicalJson(entry(42))).toBe(
      '{"at":1760000042,"decision":"BLOCKED","endpoint":"GET /customers/:id/credit-profile",' +
        '"fiduciary":"0x70997970C51812dc3A010C7d01b50e0d17dc79C8","id":"id-42","latencyMs":12,' +
        '"principal":"0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266","purposeCode":"credit_check",' +
        '"reason":"CONSENT_WITHDRAWN","seq":42}',
    );
  });

  it("rejects floats, undefined and non-JSON types", () => {
    expect(() => canonicalJson({ a: 1.5 })).toThrow();
    expect(() => canonicalJson({ a: undefined })).toThrow();
    expect(() => canonicalJson({ a: 10n })).toThrow();
    expect(() => canonicalJson({ a: Number.NaN })).toThrow();
  });
});

describe("entry hashing", () => {
  it("first entry hashes against 32 zero bytes", () => {
    const e = entry(1);
    const expected = keccak256(
      new Uint8Array([...new Uint8Array(32), ...toUtf8Bytes(canonicalJson(e))]),
    );
    expect(chainEntry(null, e)).toEqual({ entry: e, prevHash: ZERO_HASH, hash: expected });
  });

  it("chains: each hash depends on the previous hash", () => {
    const a = chainEntry(null, entry(1));
    const b = chainEntry(a.hash, entry(2));
    expect(b.prevHash).toBe(a.hash);
    expect(b.hash).toBe(hashEntry(a.hash, entry(2)));
    expect(hashEntry(ZERO_HASH, entry(2))).not.toBe(b.hash);
  });

  it("changes when any field changes (tamper detection)", () => {
    const base = hashEntry(ZERO_HASH, entry(1));
    expect(hashEntry(ZERO_HASH, entry(1, { decision: "ALLOWED", reason: "OK" }))).not.toBe(base);
    expect(hashEntry(ZERO_HASH, entry(1, { latencyMs: 13 }))).not.toBe(base);
  });

  it("is stable across key order of the input object", () => {
    const e = entry(3);
    const shuffled = Object.fromEntries(Object.entries(e).reverse()) as unknown as AccessLogEntry;
    expect(hashEntry(ZERO_HASH, shuffled)).toBe(hashEntry(ZERO_HASH, e));
  });
});

const leaves = (n: number) =>
  Array.from({ length: n }, (_, i) => chainEntry(null, entry(i + 1)).hash);

describe("merkle", () => {
  it("single leaf: root is the leaf, proof is empty", () => {
    const [l] = leaves(1);
    expect(merkleRoot([l!])).toBe(l);
    expect(merkleProof([l!], 0)).toEqual([]);
    expect(verifyMerkleProof(l!, [], l!)).toBe(true);
  });

  it("two leaves: parent is keccak(min || max), order independent", () => {
    const [a, b] = leaves(2) as [string, string];
    const [lo, hi] = a.toLowerCase() < b.toLowerCase() ? [a, b] : [b, a];
    const expected = keccak256(new Uint8Array([...getBytes(lo), ...getBytes(hi)]));
    expect(merkleRoot([a, b])).toBe(expected);
    expect(hashPair(a, b)).toBe(hashPair(b, a));
  });

  it("odd node is promoted unchanged", () => {
    const [a, b, c] = leaves(3) as [string, string, string];
    expect(merkleRoot([a, b, c])).toBe(hashPair(hashPair(a, b), c));
  });

  it.each([1, 2, 3, 4, 5, 7, 8, 20])("every leaf verifies for n=%i", (n) => {
    const ls = leaves(n);
    const root = merkleRoot(ls);
    ls.forEach((leaf, i) => {
      expect(verifyMerkleProof(leaf, merkleProof(ls, i), root)).toBe(true);
    });
  });

  it("rejects a wrong leaf, a tampered path and a wrong root", () => {
    const ls = leaves(6);
    const root = merkleRoot(ls);
    const proof = merkleProof(ls, 2);
    expect(verifyMerkleProof(ls[3]!, proof, root)).toBe(false);
    expect(verifyMerkleProof(ls[2]!, [...proof.slice(1)], root)).toBe(false);
    expect(verifyMerkleProof(ls[2]!, proof, merkleRoot(leaves(5)))).toBe(false);
  });

  it("changing one entry changes the root (what the Auditor relies on)", () => {
    const ls = leaves(6);
    const tampered = [...ls];
    tampered[4] = hashEntry(ZERO_HASH, entry(5, { decision: "ALLOWED", reason: "OK" }));
    expect(merkleRoot(tampered)).not.toBe(merkleRoot(ls));
  });

  it("throws on empty input and out-of-range index", () => {
    expect(() => merkleRoot([])).toThrow();
    expect(() => merkleProof(leaves(2), 2)).toThrow();
  });
});
