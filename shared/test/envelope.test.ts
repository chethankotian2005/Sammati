import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { getBytes, hexlify, toUtf8Bytes } from "ethers";
import {
  EnvelopeError,
  ciphertextHashOf,
  envelopeAad,
  generateKeyPair,
  handleOf,
  open,
  openJson,
  parseEnvelope,
  publicKeyOf,
  seal,
  submitMessage,
  type Envelope,
} from "../src/envelope";

const vectors = JSON.parse(
  readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../test-vectors/envelope.json"), "utf8"),
) as {
  processor: { privateKey: string; publicKey: string };
  cases: Array<{
    name: string; ephemeralPrivateKey: string; nonce: string; fiduciary: string; principal: string; purposeCode: string;
    payload: unknown; aad: string; plaintext: string; envelope: Envelope; handle: string; ciphertextHash: string;
  }>;
  negative: Array<{ name: string; fiduciary: string; principal: string; purposeCode: string; envelope: Envelope }>;
};
const processorKey = getBytes(vectors.processor.privateKey);

describe("envelope test vectors (shared with the Dart wallet)", () => {
  it("derives the published processor public key", () => {
    expect(hexlify(publicKeyOf(processorKey))).toBe(vectors.processor.publicKey);
  });

  for (const c of vectors.cases) {
    const ctx = { fiduciary: c.fiduciary, principal: c.principal, purposeCode: c.purposeCode };

    it(`${c.name}: sealing reproduces the envelope byte for byte`, () => {
      const sealed = seal(c.payload, vectors.processor.publicKey, ctx, { ephemeralPrivateKey: getBytes(c.ephemeralPrivateKey), nonce: getBytes(c.nonce) });
      expect(sealed).toEqual(c.envelope);
      expect(hexlify(envelopeAad(ctx))).toBe(c.aad);
      expect(handleOf(sealed)).toBe(c.handle);
      expect(ciphertextHashOf(sealed)).toBe(c.ciphertextHash);
    });

    it(`${c.name}: opening reproduces the plaintext`, () => {
      expect(hexlify(open(c.envelope, processorKey, ctx))).toBe(c.plaintext);
      expect(openJson(c.envelope, processorKey, ctx)).toEqual(c.payload);
    });
  }

  for (const n of vectors.negative) {
    it(`fails to open: ${n.name}`, () => {
      const ctx = { fiduciary: n.fiduciary, principal: n.principal, purposeCode: n.purposeCode };
      expect(() => open(n.envelope, processorKey, ctx)).toThrow(EnvelopeError);
    });
  }
});

describe("envelope", () => {
  const ctx = { fiduciary: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", principal: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", purposeCode: "credit_check" };
  const secret = { pan: "ABCDE1234F", incomeBand: "6-9 LPA", score: 742 };

  it("round-trips with a fresh ephemeral key and nonce every time", () => {
    const p = generateKeyPair();
    const a = seal(secret, p.publicKey, ctx);
    const b = seal(secret, p.publicKey, ctx);
    expect(a.ephPub).not.toBe(b.ephPub);
    expect(a.ciphertext).not.toBe(b.ciphertext);
    expect(openJson(a, p.privateKey, ctx)).toEqual(secret);
  });

  it("does not contain the plaintext anywhere in its serialisation", () => {
    const p = generateKeyPair();
    const text = JSON.stringify(seal(secret, p.publicKey, ctx));
    expect(text).not.toContain("ABCDE1234F");
    expect(text).not.toContain("6-9 LPA");
  });

  it("is bound to its purpose, principal and company", () => {
    const p = generateKeyPair();
    const e = seal(secret, p.publicKey, ctx);
    expect(() => open(e, p.privateKey, { ...ctx, purposeCode: "marketing" })).toThrow(EnvelopeError);
    expect(() => open(e, p.privateKey, { ...ctx, principal: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" })).toThrow(EnvelopeError);
    expect(() => open(e, p.privateKey, { ...ctx, fiduciary: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC" })).toThrow(EnvelopeError);
  });

  it("treats address case as irrelevant to the binding", () => {
    const p = generateKeyPair();
    const e = seal(secret, p.publicKey, ctx);
    expect(openJson(e, p.privateKey, { ...ctx, principal: ctx.principal.toLowerCase() })).toEqual(secret);
  });

  it("does not open for another key", () => {
    const e = seal(secret, generateKeyPair().publicKey, ctx);
    expect(() => open(e, generateKeyPair().privateKey, ctx)).toThrow(EnvelopeError);
  });

  it("fails with a fixed message that carries no data", () => {
    const p = generateKeyPair();
    const e = seal(secret, p.publicKey, ctx);
    const bad = { ...e, tag: ("0x" + "00".repeat(16)) as `0x${string}` };
    try {
      open(bad, p.privateKey, ctx);
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(EnvelopeError);
      const text = `${(err as Error).message} ${(err as Error).stack ?? ""}`;
      expect(text).not.toContain("ABCDE1234F");
      expect((err as EnvelopeError).code).toBe("CIPHERTEXT_INVALID");
    }
  });

  it("rejects a malformed envelope before any crypto", () => {
    const p = generateKeyPair();
    const e = seal(secret, p.publicKey, ctx);
    expect(() => parseEnvelope({ ...e, extra: 1 })).toThrow(/wrong fields/);
    expect(() => parseEnvelope({ ...e, nonce: "0x00" })).toThrow(/12 bytes/);
    expect(() => parseEnvelope({ ...e, tag: e.tag.toUpperCase().replace("0X", "0x") })).toThrow(/lowercase/);
    expect(() => parseEnvelope({ ...e, ciphertext: "0x" + "ab".repeat(5000) })).toThrow(/too large/);
    expect(() => parseEnvelope("nope")).toThrow(EnvelopeError);
    expect(parseEnvelope(e)).toEqual(e);
  });

  it("builds the submit message the principal signs", () => {
    expect(submitMessage("0xabc", "req-1", 3)).toBe("sammati-vault-submit:v2:0xabc:req-1:3");
    expect(toUtf8Bytes(submitMessage("0xabc", "req-1", 3)).length).toBeGreaterThan(0);
  });
});
