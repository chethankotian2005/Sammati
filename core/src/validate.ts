// Request-body parsers shared by the routes.
import { getAddress, isAddress, isHexString } from "ethers";
import {
  REASON_CODES,
  isCategoryId,
  normalizeCategories,
  RIGHTS_TYPES,
  type GrantConsent,
  type Hex,
  type LocalizedText,
  type RightsType,
  type StoredAccessLogEntry,
  type WithdrawConsent,
} from "@sammati/shared";
import { badRequest, isRecord, requireBody, requireNumber, requireString } from "./errors";

export function address(v: string, label: string): Hex {
  if (!isAddress(v)) throw badRequest(`"${label}" must be an address`);
  return getAddress(v);
}

export function bytes32(v: string, label: string): Hex {
  if (!isHexString(v, 32)) throw badRequest(`"${label}" must be a 32-byte hex string`);
  return v.toLowerCase();
}

export function parseGrant(raw: unknown): GrantConsent {
  const o = requireBody(raw);
  return {
    principal: address(requireString(o, "principal"), "principal"),
    fiduciary: address(requireString(o, "fiduciary"), "fiduciary"),
    purposeId: bytes32(requireString(o, "purposeId"), "purposeId"),
    expiresAt: requireNumber(o, "expiresAt"),
    noticeHash: bytes32(requireString(o, "noticeHash"), "noticeHash"),
    nonce: requireString(o, "nonce"),
    deadline: requireNumber(o, "deadline"),
  };
}

export function parseWithdraw(raw: unknown): WithdrawConsent {
  const o = requireBody(raw);
  return {
    principal: address(requireString(o, "principal"), "principal"),
    fiduciary: address(requireString(o, "fiduciary"), "fiduciary"),
    purposeId: bytes32(requireString(o, "purposeId"), "purposeId"),
    nonce: requireString(o, "nonce"),
    deadline: requireNumber(o, "deadline"),
  };
}

export function parseLocalized(o: Record<string, unknown>, key: string): LocalizedText {
  const v = o[key];
  if (!isRecord(v)) throw badRequest(`"${key}" must be an object with en, hi and kn`);
  return { en: requireString(v, "en"), hi: requireString(v, "hi"), kn: requireString(v, "kn") };
}

export function parseBoolean(o: Record<string, unknown>, key: string): boolean {
  if (typeof o[key] !== "boolean") throw badRequest(`"${key}" must be a boolean`);
  return o[key] as boolean;
}

export function parseLogEntry(raw: unknown): StoredAccessLogEntry {
  const o = requireBody(raw);
  const decision = requireString(o, "decision");
  if (decision !== "ALLOWED" && decision !== "BLOCKED") throw badRequest('"decision" must be ALLOWED or BLOCKED');
  const reason = requireString(o, "reason");
  if (reason !== "OK" && !(REASON_CODES as readonly string[]).includes(reason)) {
    throw badRequest(`"reason" must be OK or one of ${REASON_CODES.join(", ")}`);
  }
  // Format 2 (drd.md §4.1a): both keys or neither.
  let usage: { dataCategories?: string[]; outcome?: string } = {};
  if (o.outcome !== undefined || o.dataCategories !== undefined) {
    if (typeof o.outcome !== "string" || o.outcome.length > 16) throw badRequest('"outcome" must be a short string');
    const cats = o.dataCategories;
    if (!Array.isArray(cats) || !cats.every((c) => typeof c === "string" && isCategoryId(c))) throw badRequest('"dataCategories" must be data category ids');
    if (JSON.stringify(normalizeCategories(cats as string[])) !== JSON.stringify(cats)) throw badRequest('"dataCategories" must be unique and in registry order');
    usage = { dataCategories: cats as string[], outcome: o.outcome };
  }
  return {
    ...usage,
    at: requireNumber(o, "at"),
    decision,
    endpoint: requireString(o, "endpoint"),
    fiduciary: address(requireString(o, "fiduciary"), "fiduciary"),
    id: requireString(o, "id"),
    latencyMs: requireNumber(o, "latencyMs"),
    principal: address(requireString(o, "principal"), "principal"),
    purposeCode: requireString(o, "purposeCode"),
    reason: reason as StoredAccessLogEntry["reason"],
    seq: requireNumber(o, "seq"),
    prevHash: requireString(o, "prevHash"),
    hash: requireString(o, "hash"),
    batchIndex: null,
  };
}

export function parseRightsBody(raw: unknown): { principal: Hex; fiduciary: Hex; type: RightsType; note: string } {
  const o = requireBody(raw);
  const type = requireString(o, "type");
  if (!(RIGHTS_TYPES as readonly string[]).includes(type)) throw badRequest(`"type" must be ${RIGHTS_TYPES.join(", ")}`);
  if (o.note !== undefined && typeof o.note !== "string") throw badRequest('"note" must be a string');
  return {
    principal: address(requireString(o, "principal"), "principal"),
    fiduciary: address(requireString(o, "fiduciary"), "fiduciary"),
    type: type as RightsType,
    note: (o.note as string | undefined) ?? "",
  };
}
