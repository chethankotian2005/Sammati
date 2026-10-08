import { describe, expect, it } from "vitest";
import { TypedDataEncoder, computeAddress, getAddress, id, recoverAddress } from "ethers";
import vectors from "../test-vectors/eip712.json";
import {
  GRANT_CONSENT_TYPE,
  WITHDRAW_CONSENT_TYPE,
  eip712Digest,
  grantTypedData,
  withdrawTypedData,
} from "../src/eip712";
import { noticeHash, purposeIdOf } from "../src/canonical";
import { REASON_CODES } from "../src/types";
import { LOCAL_RELAYER_ADDRESS, LOCAL_RELAYER_KEY } from "../src/constants";
import { TEST_CUSTOMER, TEST_COMPANIES } from "../../test/src";

describe("EIP-712 definitions", () => {
  it("field names and order match trd.md §3.1", () => {
    expect(GRANT_CONSENT_TYPE.map((f) => `${f.type} ${f.name}`)).toEqual([
      "address principal",
      "address fiduciary",
      "bytes32 purposeId",
      "uint64 expiresAt",
      "bytes32 noticeHash",
      "uint256 nonce",
      "uint64 deadline",
    ]);
    expect(WITHDRAW_CONSENT_TYPE.map((f) => `${f.type} ${f.name}`)).toEqual([
      "address principal",
      "address fiduciary",
      "bytes32 purposeId",
      "uint256 nonce",
      "uint64 deadline",
    ]);
  });

  it("type strings are the canonical encodeType", () => {
    const enc = (name: string, fields: readonly { name: string; type: string }[]) =>
      TypedDataEncoder.from({ [name]: [...fields] }).encodeType(name);
    expect(enc("GrantConsent", GRANT_CONSENT_TYPE)).toBe(
      "GrantConsent(address principal,address fiduciary,bytes32 purposeId,uint64 expiresAt,bytes32 noticeHash,uint256 nonce,uint64 deadline)",
    );
    expect(enc("WithdrawConsent", WITHDRAW_CONSENT_TYPE)).toBe(
      "WithdrawConsent(address principal,address fiduciary,bytes32 purposeId,uint256 nonce,uint64 deadline)",
    );
  });
});

describe("test vectors (shared with the Dart signer)", () => {
  const signer = computeAddress(vectors.privateKey);

  it("signer address is derived from the fixed key", () => {
    expect(vectors.signer).toBe(signer);
  });

  it("notice hash matches the notice input", () => {
    expect(noticeHash(vectors.notice.input)).toBe(vectors.notice.noticeHash);
    expect(vectors.notice.input.purposes[0]!.id).toBe(
      purposeIdOf(vectors.notice.input.fiduciary, "credit_check"),
    );
  });

  it.each([
    ["grant", grantTypedData],
    ["withdraw", withdrawTypedData],
  ] as const)("%s: digest and signature reproduce and recover the signer", (name, build) => {
    const v = vectors[name];
    const td = (build as typeof grantTypedData)(vectors.domain, v.typedData.message as never);
    expect(td).toEqual(v.typedData);
    expect(eip712Digest(td)).toBe(v.digest);
    expect(recoverAddress(v.digest, v.signature)).toBe(signer);
  });
});

describe("shared constants", () => {
  it("reason codes are exactly the five from AGENTS.md", () => {
    expect([...REASON_CODES]).toEqual([
      "CONSENT_WITHDRAWN",
      "CONSENT_EXPIRED",
      "NO_CONSENT",
      "LEDGER_UNAVAILABLE",
      "NO_PRINCIPAL",
    ]);
  });

  it("demo relayer key is keccak256 of its label and matches its address", () => {
    expect(LOCAL_RELAYER_KEY).toBe(id("sammati-demo-relayer"));
    expect(computeAddress(LOCAL_RELAYER_KEY)).toBe(LOCAL_RELAYER_ADDRESS);
  });

  it("test companies are well formed", () => {
    expect(TEST_COMPANIES.map((f) => f.name)).toEqual(["QuickLoan", "MediCare+", "FoodRush"]);
    expect(TEST_COMPANIES.flatMap((f) => f.purposes.map((p) => p.code))).toEqual([
      "credit_check", "marketing", "bureau_share",
      "treatment", "insurance_claim", "research",
      "delivery", "ad_targeting", "partner_share",
    ]);
    expect(TEST_COMPANIES.flatMap((f) => f.processors.map((p) => p.name))).toEqual([
      "CreditBureauX", "AdPartnerQ", "InsureCo", "ResearchLab", "AdNetworkZ",
    ]);
    const addresses = [
      TEST_CUSTOMER,
      ...TEST_COMPANIES.flatMap((f) => [f.address, ...f.processors.map((p) => p.address)]),
    ];
    for (const f of TEST_COMPANIES) {
      expect(computeAddress(f.demoKey)).toBe(f.address); // the held key really is the company's
      for (const p of f.processors) expect(computeAddress(p.demoKey), p.name).toBe(p.address); // and the processor's
    }
    for (const a of addresses) expect(getAddress(a)).toBe(a); // valid EIP-55 checksum
    expect(new Set(addresses).size).toBe(addresses.length);
    for (const f of TEST_COMPANIES) {
      const codes = f.purposes.map((p) => p.code);
      for (const proc of f.processors) expect(codes).toContain(proc.purposeCode);
    }
  });
});
