import { Router } from "express";
import { isHexString } from "ethers";
import {
  type ConsentRow,
  type ConsentStateResponse,
  type ExportResponse,
  type FiduciaryAccessResponse,
  type FiduciaryConsentsResponse,
  type GatewayLogResponse,
  type Hex,
  type RegisterProcessorResponse,
  type RegisterPurposeResponse,
  type StoredAccessLogEntry,
} from "@sammati/shared";
import type { Ctx } from "../context";
import { badRequest, requireBody, requireNumber, requireString } from "../errors";
import { now } from "../store";
import { address, parseBoolean, parseLocalized, parseLogEntry } from "../validate";

const DEFAULT_ACCESS_LIMIT = 100;

export function companyRoutes(ctx: Ctx): Router {
  const { store } = ctx;
  const r = Router();

  const consentRows = (fid: Hex): ConsentRow[] => {
    const f = store.fiduciary(fid);
    return store.fiduciaryConsents(f.address).map((c) => ({
      principal: c.principal,
      customerAlias: store.aliasFor(c.principal),
      purposeId: c.purposeId,
      purposeCode: store.purpose(f, c.purposeId).code,
      status: c.status,
      grantedAt: c.grantedAt,
      expiresAt: c.expiresAt,
      updatedAt: c.updatedAt,
      lastTx: c.lastTx,
    }));
  };

  const newestFirst = (fid: Hex, limitQ: unknown): StoredAccessLogEntry[] => {
    const limit = Math.max(1, Math.min(500, Number(limitQ ?? DEFAULT_ACCESS_LIMIT) || DEFAULT_ACCESS_LIMIT));
    return [...store.accessFor(store.fiduciary(fid).address)].sort((a, b) => b.seq - a.seq).slice(0, limit);
  };

  r.get("/fiduciaries/:fid/purposes", (req, res) => {
    const f = store.fiduciary(req.params.fid!);
    res.json({ fiduciary: f.address, purposes: f.purposes });
  });

  r.post("/fiduciaries/:fid/purposes", (req, res) => {
    const f = store.fiduciary(req.params.fid!);
    const o = requireBody(req.body);
    const categories = o.dataCategories;
    if (!Array.isArray(categories) || !categories.every((c) => typeof c === "string")) {
      throw badRequest('"dataCategories" must be an array of strings');
    }
    const purpose = store.addPurpose(f, {
      code: requireString(o, "code"),
      title: parseLocalized(o, "title"),
      description: parseLocalized(o, "description"),
      dataCategories: categories as string[],
      retentionDays: requireNumber(o, "retentionDays"),
      sharesThirdParty: parseBoolean(o, "sharesThirdParty"),
      required: parseBoolean(o, "required"),
    });
    res.status(201).json({ purposeId: purpose.id, txHash: store.newTxHash() } satisfies RegisterPurposeResponse);
  });

  r.post("/fiduciaries/:fid/processors", (req, res) => {
    const f = store.fiduciary(req.params.fid!);
    const o = requireBody(req.body);
    const purposeId = requireString(o, "purposeId");
    if (!isHexString(purposeId, 32)) throw badRequest('"purposeId" must be a 32-byte hex string');
    const purpose = store.purpose(f, purposeId);
    f.processors.push({
      name: requireString(o, "name"),
      address: address(requireString(o, "address"), "address"),
      purposeId: purpose.id,
    });
    res.status(201).json({ txHash: store.newTxHash() } satisfies RegisterProcessorResponse);
  });

  r.get("/fiduciaries/:fid/consents", (req, res) => {
    const f = store.fiduciary(req.params.fid!);
    res.json({ fiduciary: f.address, rows: consentRows(f.address) } satisfies FiduciaryConsentsResponse);
  });

  r.get("/fiduciaries/:fid/access", (req, res) => {
    const f = store.fiduciary(req.params.fid!);
    res.json({ fiduciary: f.address, items: newestFirst(f.address, req.query.limit) } satisfies FiduciaryAccessResponse);
  });

  r.post("/gateway/log", (req, res) => {
    const row = parseLogEntry(req.body);
    store.appendLog(row);
    ctx.publish({
      event: "access.logged",
      principal: row.principal,
      fiduciary: row.fiduciary,
      fiduciaryName: store.fiduciary(row.fiduciary).name,
      entryId: row.id,
      seq: row.seq,
      purposeCode: row.purposeCode,
      decision: row.decision,
      reason: row.reason,
      endpoint: row.endpoint,
      at: row.at,
    });
    res.status(201).json({ accepted: true, seq: row.seq } satisfies GatewayLogResponse);
  });

  r.get("/gateway/consent-state", (req, res) => {
    const { principal, fid, purpose } = req.query;
    if (typeof principal !== "string" || typeof fid !== "string" || typeof purpose !== "string") {
      throw badRequest("principal, fid and purpose query parameters are required");
    }
    const f = store.fiduciary(fid);
    const p = store.purpose(f, purpose);
    res.json(store.consentState(address(principal, "principal"), f.address, p.id) satisfies ConsentStateResponse);
  });

  r.post("/fiduciaries/:fid/export", (req, res) => {
    const f = store.fiduciary(req.params.fid!);
    res.json({
      fiduciary: f.address,
      generatedAt: now(),
      consents: consentRows(f.address),
      access: newestFirst(f.address, 500),
      batches: store.anchorsFor(f.address),
      ledgerHead: store.ledgerHead,
    } satisfies ExportResponse);
  });

  return r;
}
