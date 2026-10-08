// Vault envelope (trd.md §4.4): hybrid, ECIES-style encryption of a JSON payload for the Sammati Processor.
//
//   X25519(ephemeral, processor) -> HKDF-SHA256 -> AES-256-GCM, with the customer, company and purpose as AAD.
//
// Node only (node:crypto), so it is not re-exported from the package index, which the browser console also
// imports. Import it as "@sammati/shared/src/envelope". The Dart copy is wallet/lib/core/envelope.dart; both must
// pass shared/test-vectors/envelope.json.
//
// Nothing in this file puts plaintext, a key or a payload into an error message: errors are fixed strings
// (trd.md §6.7, "No plaintext outside the Processor").
import {
  createCipheriv,
  createDecipheriv,
  createPrivateKey,
  createPublicKey,
  diffieHellman,
  hkdfSync,
  randomBytes,
} from "node:crypto";
import { concat, getBytes, hexlify, keccak256 } from "ethers";
import { canonicalBytes } from "./canonical";
import type { Hex } from "./types";

export const ENVELOPE_VERSION = 1;
export const ENVELOPE_HKDF_INFO = "sammati-vault-v1";
/** The submit signature message prefix (trd.md §4.4.8). */
export const VAULT_SUBMIT_PREFIX = "sammati-vault-submit:v1:";
/** Largest envelope the Processor accepts, in bytes of canonical JSON. */
export const MAX_ENVELOPE_BYTES = 4096;

const PKCS8_X25519_PREFIX = Buffer.from("302e020100300506032b656e04220420", "hex");
const SPKI_X25519_PREFIX = Buffer.from("302a300506032b656e032100", "hex");

export interface Envelope {
  v: 1;
  /** 32 bytes: the wallet's ephemeral X25519 public key. */
  ephPub: Hex;
  /** 12 bytes. */
  nonce: Hex;
  ciphertext: Hex;
  /** 16 bytes. */
  tag: Hex;
}

/** What an envelope is bound to; rebuilt by the Processor from the vault row, never stored in the envelope. */
export interface EnvelopeContext {
  fiduciary: string;
  principal: string;
  purposeCode: string;
}

export type EnvelopeErrorCode = "BAD_ENVELOPE" | "CIPHERTEXT_INVALID";

export class EnvelopeError extends Error {
  constructor(readonly code: EnvelopeErrorCode, message: string) {
    super(message);
    this.name = "EnvelopeError";
  }
}

const HEX = /^0x(?:[0-9a-f]{2})*$/;

function bytesOf(value: unknown, length: number | null, field: string): Uint8Array {
  if (typeof value !== "string" || !HEX.test(value)) throw new EnvelopeError("BAD_ENVELOPE", `${field} must be lowercase 0x hex`);
  const bytes = getBytes(value);
  if (length !== null && bytes.length !== length) throw new EnvelopeError("BAD_ENVELOPE", `${field} must be ${length} bytes`);
  return bytes;
}

/** Validates the shape of an untrusted envelope; says nothing about whether it opens. */
export function parseEnvelope(value: unknown): Envelope {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new EnvelopeError("BAD_ENVELOPE", "envelope must be an object");
  const o = value as Record<string, unknown>;
  const keys = Object.keys(o).sort().join(",");
  if (keys !== "ciphertext,ephPub,nonce,tag,v") throw new EnvelopeError("BAD_ENVELOPE", "envelope has the wrong fields");
  if (o.v !== ENVELOPE_VERSION) throw new EnvelopeError("BAD_ENVELOPE", "unsupported envelope version");
  bytesOf(o.ephPub, 32, "ephPub");
  bytesOf(o.nonce, 12, "nonce");
  bytesOf(o.ciphertext, null, "ciphertext");
  bytesOf(o.tag, 16, "tag");
  const envelope = o as unknown as Envelope;
  if (envelopeBytes(envelope).length > MAX_ENVELOPE_BYTES) throw new EnvelopeError("BAD_ENVELOPE", "envelope is too large");
  return envelope;
}

/** The canonical JSON bytes of an envelope: what the vault stores and what the handle hashes. */
export function envelopeBytes(envelope: Envelope): Uint8Array {
  return canonicalBytes({ ciphertext: envelope.ciphertext, ephPub: envelope.ephPub, nonce: envelope.nonce, tag: envelope.tag, v: envelope.v });
}

/** handle = keccak256(canonical envelope bytes). */
export function handleOf(envelope: Envelope): Hex {
  return keccak256(envelopeBytes(envelope)) as Hex;
}

/** ciphertextHash = keccak256(ciphertext || tag). */
export function ciphertextHashOf(envelope: Envelope): Hex {
  return keccak256(concat([envelope.ciphertext, envelope.tag])) as Hex;
}

/** The message the principal signs (EIP-191) to submit an envelope. */
export function submitMessage(handle: string, requestId: string): string {
  return `${VAULT_SUBMIT_PREFIX}${handle}:${requestId}`;
}

/** The GCM additional data: binds an envelope to one customer, one company and one purpose. */
export function envelopeAad(ctx: EnvelopeContext): Uint8Array {
  return canonicalBytes({
    fiduciary: ctx.fiduciary.toLowerCase(),
    principal: ctx.principal.toLowerCase(),
    purposeCode: ctx.purposeCode,
    v: ENVELOPE_VERSION,
  });
}

// --- X25519 keys, as raw 32 bytes ---

export interface X25519KeyPair {
  privateKey: Uint8Array;
  publicKey: Uint8Array;
}

function privateKeyObject(raw: Uint8Array) {
  if (raw.length !== 32) throw new EnvelopeError("BAD_ENVELOPE", "an X25519 private key is 32 bytes");
  return createPrivateKey({ key: Buffer.concat([PKCS8_X25519_PREFIX, raw]), format: "der", type: "pkcs8" });
}

function publicKeyObject(raw: Uint8Array) {
  if (raw.length !== 32) throw new EnvelopeError("BAD_ENVELOPE", "an X25519 public key is 32 bytes");
  return createPublicKey({ key: Buffer.concat([SPKI_X25519_PREFIX, raw]), format: "der", type: "spki" });
}

export function publicKeyOf(privateKey: Uint8Array): Uint8Array {
  const der = createPublicKey(privateKeyObject(privateKey)).export({ format: "der", type: "spki" });
  return new Uint8Array(der.subarray(der.length - 32));
}

export function generateKeyPair(privateKey: Uint8Array = randomBytes(32)): X25519KeyPair {
  return { privateKey: new Uint8Array(privateKey), publicKey: publicKeyOf(privateKey) };
}

function deriveKey(ownPrivate: Uint8Array, peerPublic: Uint8Array, ephPub: Uint8Array, processorPub: Uint8Array): Buffer {
  const shared = diffieHellman({ privateKey: privateKeyObject(ownPrivate), publicKey: publicKeyObject(peerPublic) });
  if (shared.every((b) => b === 0)) throw new EnvelopeError("BAD_ENVELOPE", "degenerate key exchange");
  const salt = Buffer.concat([ephPub, processorPub]);
  return Buffer.from(hkdfSync("sha256", shared, salt, Buffer.from(ENVELOPE_HKDF_INFO, "utf8"), 32));
}

export interface SealOptions {
  /** Fixed ephemeral private key and nonce, for test vectors only. */
  ephemeralPrivateKey?: Uint8Array;
  nonce?: Uint8Array;
}

/** Encrypts `payload` (any canonical-JSON value) for the Processor's public key. */
export function seal(payload: unknown, processorPublicKey: Uint8Array | string, ctx: EnvelopeContext, options: SealOptions = {}): Envelope {
  const processorPub = typeof processorPublicKey === "string" ? bytesOf(processorPublicKey, 32, "processor public key") : processorPublicKey;
  const eph = generateKeyPair(options.ephemeralPrivateKey);
  const nonce = options.nonce ?? randomBytes(12);
  const key = deriveKey(eph.privateKey, processorPub, eph.publicKey, processorPub);
  const cipher = createCipheriv("aes-256-gcm", key, nonce, { authTagLength: 16 });
  cipher.setAAD(envelopeAad(ctx));
  const ciphertext = Buffer.concat([cipher.update(canonicalBytes(payload)), cipher.final()]);
  return {
    v: ENVELOPE_VERSION,
    ephPub: hexlify(eph.publicKey) as Hex,
    nonce: hexlify(nonce) as Hex,
    ciphertext: hexlify(ciphertext) as Hex,
    tag: hexlify(cipher.getAuthTag()) as Hex,
  };
}

/**
 * Opens an envelope. Returns the plaintext bytes; the caller must keep them in a local variable and drop them
 * (trd.md §6.7). Any failure, wrong key, edited bytes or wrong context, is the same fixed CIPHERTEXT_INVALID.
 */
export function open(envelope: Envelope, processorPrivateKey: Uint8Array, ctx: EnvelopeContext): Uint8Array {
  try {
    const parsed = parseEnvelope(envelope);
    const ephPub = getBytes(parsed.ephPub);
    const key = deriveKey(processorPrivateKey, ephPub, ephPub, publicKeyOf(processorPrivateKey));
    const decipher = createDecipheriv("aes-256-gcm", key, getBytes(parsed.nonce), { authTagLength: 16 });
    decipher.setAAD(envelopeAad(ctx));
    decipher.setAuthTag(getBytes(parsed.tag));
    return new Uint8Array(Buffer.concat([decipher.update(getBytes(parsed.ciphertext)), decipher.final()]));
  } catch {
    // The cause is deliberately dropped: it must not become a message or a stack that mentions the data.
    throw new EnvelopeError("CIPHERTEXT_INVALID", "the envelope could not be opened");
  }
}

/** Opens an envelope and parses its JSON. A payload that is not JSON is as invalid as a bad tag. */
export function openJson(envelope: Envelope, processorPrivateKey: Uint8Array, ctx: EnvelopeContext): unknown {
  const bytes = open(envelope, processorPrivateKey, ctx);
  try {
    return JSON.parse(Buffer.from(bytes).toString("utf8")) as unknown;
  } catch {
    throw new EnvelopeError("CIPHERTEXT_INVALID", "the envelope could not be opened");
  }
}
