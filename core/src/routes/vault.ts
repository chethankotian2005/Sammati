// Confidential processing, Core's part (trd.md §6.1, §6.5): point the wallet at the Processor, and fan out the
// events the Processor reports. Core never sees an envelope or holds a key; the allow-list below is what keeps
// it that way even if the sender misbehaves: only fields of the right shape get through, so there is no field
// a ciphertext or a plaintext could ride in.
import { timingSafeEqual } from "node:crypto";
import { Router } from "express";
import { getAddress, isAddress } from "ethers";
import {
  VAULT_EVENT_FIELDS,
  type Hex,
  type LoanDecision,
  type ProcessorOutcome,
  type VaultEraseCause,
  type VaultEvent,
  type VaultEventName,
  type VaultView,
  type WsEvent,
} from "@sammati/shared";
import type { Config } from "../config";
import { HttpError, badRequest, isRecord } from "../errors";

const BYTES32 = /^0x[0-9a-f]{64}$/;
const CODE = /^[a-z][a-z0-9_]{0,63}$/;
const DECISION_CODE = /^[A-Z][A-Z0-9_]{0,31}$/;
const ENTRY_ID = /^[0-9a-f-]{1,64}$/;
const OUTCOMES: readonly ProcessorOutcome[] = ["approved", "declined", "blocked", "error"];
const CAUSES: readonly VaultEraseCause[] = ["withdrawn", "expired", "no_consent", "superseded"];

const bad = (what: string): never => {
  throw badRequest(`"${what}" is not valid for this event`, "BAD_EVENT");
};
const int = (v: unknown, what: string): number => (typeof v === "number" && Number.isSafeInteger(v) && v >= 0 ? v : bad(what));
const lowerHex32 = (v: unknown, what: string): Hex => (typeof v === "string" && BYTES32.test(v) ? (v as Hex) : bad(what));

const FIELD_PARSERS: Record<string, (v: unknown) => unknown> = {
  ciphertextHash: (v) => lowerHex32(v, "ciphertextHash"),
  sizeBytes: (v) => int(v, "sizeBytes"),
  action: (v) => (v === "loan_decision" ? v : bad("action")),
  requestedAt: (v) => int(v, "requestedAt"),
  decryptingAt: (v) => int(v, "decryptingAt"),
  decision: (v) => (OUTCOMES.includes(v as ProcessorOutcome) ? v : bad("decision")),
  limit: (v) => (v === null ? null : int(v, "limit")),
  reasonCodes: (v) =>
    Array.isArray(v) && v.length <= 8 && v.every((c) => typeof c === "string" && DECISION_CODE.test(c)) ? v : bad("reasonCodes"),
  entryId: (v) => (typeof v === "string" && ENTRY_ID.test(v) ? v : bad("entryId")),
  durationMs: (v) => int(v, "durationMs"),
  cause: (v) => (CAUSES.includes(v as VaultEraseCause) ? v : bad("cause")),
};

/** Copies only the allow-listed fields of a vault event, each checked for shape. Exported for tests. */
export function parseVaultEvent(body: unknown): VaultEvent {
  if (!isRecord(body)) throw badRequest("event must be an object", "BAD_EVENT");
  const name = body.event;
  if (typeof name !== "string" || !(name in VAULT_EVENT_FIELDS)) throw badRequest("unknown event", "BAD_EVENT");

  const principal = body.principal;
  const fiduciary = body.fiduciary;
  if (typeof principal !== "string" || !isAddress(principal)) bad("principal");
  if (typeof fiduciary !== "string" || !isAddress(fiduciary)) bad("fiduciary");
  const purposeCode = body.purposeCode;
  if (typeof purposeCode !== "string" || !CODE.test(purposeCode)) bad("purposeCode");

  const event: Record<string, unknown> = {
    event: name,
    principal: getAddress(principal as string),
    fiduciary: getAddress(fiduciary as string),
    purposeCode,
    handle: lowerHex32(body.handle, "handle"),
    at: int(body.at, "at"),
    atMs: int(body.atMs, "atMs"),
  };
  for (const field of VAULT_EVENT_FIELDS[name as VaultEventName]) {
    if (!(field in body)) bad(field);
    event[field] = FIELD_PARSERS[field]!(body[field]);
  }
  return event as unknown as VaultEvent;
}

/**
 * What Core is willing to relay from a company's answer to the console (trd.md §6.4): a loan decision or a vault
 * view, re-built field by field from checked values. Anything else, including extra fields, is dropped, so a company
 * (or a bug) cannot turn /v1/demo/fire into a way to move data through Core.
 */
export function sanitiseResult(body: unknown): VaultView | LoanDecision | undefined {
  if (!isRecord(body)) return undefined;
  if (body.decision === "approved" || body.decision === "declined") {
    const limit = body.limit === null ? null : typeof body.limit === "number" && Number.isSafeInteger(body.limit) && body.limit >= 0 ? body.limit : undefined;
    const codes = body.reasonCodes;
    if (limit === undefined || !Array.isArray(codes) || codes.length > 8 || !codes.every((c) => typeof c === "string" && DECISION_CODE.test(c))) return undefined;
    return { decision: body.decision, limit, reasonCodes: codes as string[] };
  }
  if (body.status === "stored" || body.status === "erased" || body.status === "none") {
    const hex = (v: unknown): Hex | null | undefined => (v === null ? null : typeof v === "string" && BYTES32.test(v) ? (v as Hex) : undefined);
    const handle = hex(body.handle);
    const ciphertextHash = hex(body.ciphertextHash);
    return handle === undefined || ciphertextHash === undefined ? undefined : { handle, ciphertextHash, status: body.status };
  }
  return undefined;
}

function keyMatches(given: string | undefined, expected: string): boolean {
  if (!given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function vaultRoutes(deps: { config: Config; publish: (event: WsEvent) => void }): Router {
  const r = Router();

  r.get("/processor", (_req, res) => {
    res.json({ url: deps.config.processorUrl });
  });

  r.post("/events/vault", (req, res) => {
    if (!keyMatches(req.header("x-sammati-processor-key"), deps.config.processorEventKey)) {
      throw new HttpError(401, "UNAUTHORIZED", "A valid x-sammati-processor-key is required");
    }
    deps.publish(parseVaultEvent(req.body));
    res.status(202).json({ ok: true });
  });

  return r;
}
