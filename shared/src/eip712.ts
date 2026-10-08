// Single definition of the signed messages. Field names and order are part of
// the spec (trd.md §3.1, §4.1); contracts tests, Core and the Dart wallet
// (wallet/lib/core/eip712.dart) must all match this byte for byte.

import { TypedDataEncoder } from "ethers";

export const EIP712_NAME ="Sammati";
export const EIP712_VERSION = "1";

export interface Eip712Domain {
  name: string;
  version: string;
  chainId: number;
  verifyingContract: string;
}

export interface TypedField {
  name: string;
  type: string;
}

export const GRANT_CONSENT_TYPE: readonly TypedField[] = [
  { name: "principal", type: "address" },
  { name: "fiduciary", type: "address" },
  { name: "purposeId", type: "bytes32" },
  { name: "expiresAt", type: "uint64" },
  { name: "noticeHash", type: "bytes32" },
  { name: "nonce", type: "uint256" },
  { name: "deadline", type: "uint64" },
];

export const WITHDRAW_CONSENT_TYPE: readonly TypedField[] = [
  { name: "principal", type: "address" },
  { name: "fiduciary", type: "address" },
  { name: "purposeId", type: "bytes32" },
  { name: "nonce", type: "uint256" },
  { name: "deadline", type: "uint64" },
];

export const GRANT_TYPES = { GrantConsent: GRANT_CONSENT_TYPE } as const;
export const WITHDRAW_TYPES = { WithdrawConsent: WITHDRAW_CONSENT_TYPE } as const;

// JSON-safe message shapes: timestamps fit a JS number, uint256 nonce travels
// as a decimal string so it survives JSON and Dart BigInt parsing.
export interface GrantConsent {
  principal: string;
  fiduciary: string;
  purposeId: string;
  expiresAt: number;
  noticeHash: string;
  nonce: string;
  deadline: number;
}

export interface WithdrawConsent {
  principal: string;
  fiduciary: string;
  purposeId: string;
  nonce: string;
  deadline: number;
}

export function buildDomain(chainId: number, verifyingContract: string): Eip712Domain {
  return { name: EIP712_NAME, version: EIP712_VERSION, chainId, verifyingContract };
}

export interface TypedData<P extends string, M> {
  domain: Eip712Domain;
  types: Record<P, readonly TypedField[]>;
  primaryType: P;
  message: M;
}

/** EIP-712 digest (what the key actually signs, no extra prefix). */
export function eip712Digest<P extends string>(td: TypedData<P, object>): string {
  const types: Record<string, TypedField[]> = { [td.primaryType]: [...td.types[td.primaryType]] };
  return TypedDataEncoder.hash(td.domain, types, td.message);
}

export function grantTypedData(
  domain: Eip712Domain,
  message: GrantConsent,
): TypedData<"GrantConsent", GrantConsent> {
  return { domain, types: GRANT_TYPES, primaryType: "GrantConsent", message };
}

export function withdrawTypedData(
  domain: Eip712Domain,
  message: WithdrawConsent,
): TypedData<"WithdrawConsent", WithdrawConsent> {
  return { domain, types: WITHDRAW_TYPES, primaryType: "WithdrawConsent", message };
}
