// The two signed messages of the withdrawal cascade (trd.md §9): the company tells a downstream
// processor that consent was withdrawn, and the processor acknowledges. Both are EIP-191 signatures
// over the keccak256 of the message's canonical JSON, so any party can recompute and verify them.
import { getBytes, verifyMessage, type Signer } from "ethers";
import { canonicalBytes, keccakBytes } from "./canonical";
import type { Hex } from "./types";

/** What a company tells a processor when a user withdraws consent for a purpose they share. */
export interface CascadeNotification {
  principal: Hex;
  fiduciary: Hex;
  purposeId: Hex;
  purposeCode: string;
  processor: Hex;
  /** The withdrawal transaction: the processor can check it on chain. */
  withdrawalTx: Hex;
  withdrawnAt: number;
}

/** A processor's receipt for a notification. */
export interface CascadeAck {
  principal: Hex;
  purposeId: Hex;
  processor: Hex;
  /** Digest of the notification being acknowledged. */
  notificationDigest: Hex;
  ackedAt: number;
}

export interface SignedNotification {
  notification: CascadeNotification;
  /** By the fiduciary. */
  signature: string;
}

export interface SignedAck {
  ack: CascadeAck;
  /** By the processor. */
  signature: string;
}

export const notificationDigest = (n: CascadeNotification): Hex => keccakBytes(canonicalBytes(n));
export const ackDigest = (a: CascadeAck): Hex => keccakBytes(canonicalBytes(a));

export async function signNotification(notification: CascadeNotification, fiduciary: Signer): Promise<SignedNotification> {
  return { notification, signature: await fiduciary.signMessage(getBytes(notificationDigest(notification))) };
}

export async function signAck(ack: CascadeAck, processor: Signer): Promise<SignedAck> {
  return { ack, signature: await processor.signMessage(getBytes(ackDigest(ack))) };
}

/** Who signed this notification? Returns null if the signature is not even well-formed. */
export function notificationSigner(s: SignedNotification): string | null {
  try {
    return verifyMessage(getBytes(notificationDigest(s.notification)), s.signature);
  } catch {
    return null;
  }
}

export function ackSigner(s: SignedAck): string | null {
  try {
    return verifyMessage(getBytes(ackDigest(s.ack)), s.signature);
  } catch {
    return null;
  }
}
