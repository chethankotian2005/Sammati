// Regenerates test-vectors/envelope.json (trd.md §4.4). Deterministic: the keys and nonces are derived from
// fixed labels, so reruns produce identical output. These keys are public test data: never use them for anything real.
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getBytes, hexlify, keccak256, toUtf8Bytes } from "ethers";
import { canonicalJson } from "../src/canonical";
import {
  ciphertextHashOf,
  envelopeAad,
  generateKeyPair,
  handleOf,
  seal,
  type Envelope,
  type EnvelopeContext,
} from "../src/envelope";

const label = (text: string) => getBytes(keccak256(toUtf8Bytes(text)));

const processor = generateKeyPair(label("sammati-vector-processor"));
const FIDUCIARY = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const PRINCIPAL = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

const cases = [
  {
    name: "demo profile for credit_check",
    ctx: { fiduciary: FIDUCIARY, principal: PRINCIPAL, purposeCode: "credit_check" },
    payload: { incomeBand: "6-9 LPA", pan: "ABCDE1234F", score: 742 },
  },
  {
    // Non-ASCII text and nesting: canonical JSON must agree on UTF-8 and key order across languages.
    name: "unicode payload for marketing",
    ctx: { fiduciary: FIDUCIARY, principal: PRINCIPAL, purposeCode: "marketing" },
    payload: { z: [1, { b: "ಕನ್ನಡ", a: "हिन्दी" }], a: "x" },
  },
].map((c, i) => {
  const ephemeralPrivateKey = label(`sammati-vector-ephemeral-${i + 1}`);
  const nonce = label(`sammati-vector-nonce-${i + 1}`).slice(0, 12);
  const envelope = seal(c.payload, processor.publicKey, c.ctx, { ephemeralPrivateKey, nonce });
  return {
    name: c.name,
    ephemeralPrivateKey: hexlify(ephemeralPrivateKey),
    nonce: hexlify(nonce),
    ...c.ctx,
    payload: c.payload,
    aad: hexlify(envelopeAad(c.ctx)),
    plaintext: hexlify(toUtf8Bytes(canonicalJson(c.payload))),
    envelope,
    handle: handleOf(envelope),
    ciphertextHash: ciphertextHashOf(envelope),
  };
});

const base = cases[0]!;
const flip = (hex: string, byte: number): string => {
  const bytes = getBytes(hex);
  bytes[byte] = bytes[byte]! ^ 0x01;
  return hexlify(bytes);
};
const negative = (name: string, envelope: Envelope | Record<string, unknown>, ctx: EnvelopeContext = base) => ({
  name,
  fiduciary: ctx.fiduciary,
  principal: ctx.principal,
  purposeCode: ctx.purposeCode,
  envelope,
  expect: "fail" as const,
});

const e = base.envelope;
const vectors = {
  description: "trd.md §4.4. Sealing with the given ephemeral key and nonce must reproduce `envelope` exactly; opening it with the processor private key must reproduce `plaintext`; every `negative` case must fail to open.",
  processor: { privateKey: hexlify(processor.privateKey), publicKey: hexlify(processor.publicKey) },
  cases,
  negative: [
    negative("flipped tag bit", { ...e, tag: flip(e.tag, 0) }),
    negative("flipped ciphertext bit", { ...e, ciphertext: flip(e.ciphertext, 0) }),
    negative("flipped nonce bit", { ...e, nonce: flip(e.nonce, 0) }),
    negative("wrong purpose in the context", e, { ...base, purposeCode: "marketing" }),
    negative("wrong principal in the context", e, { ...base, principal: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" }),
    negative("wrong version", { ...e, v: 2 }),
    negative("all-zero ephemeral public key", { ...e, ephPub: "0x" + "00".repeat(32) }),
  ],
};

const out = resolve(dirname(fileURLToPath(import.meta.url)), "../test-vectors/envelope.json");
writeFileSync(out, JSON.stringify(vectors, null, 2) + "\n");
console.log(`wrote ${out}`);
