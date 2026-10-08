import { Router } from "express";
import { isAddress } from "ethers";
import type {
  AuditFiduciariesResponse,
  AuditLedgerResponse,
  AuditReportResponse,
  LedgerEventType,
  VerifyResponse,
} from "@sammati/shared";
import { report, scorecard, verifyFiduciary } from "../audit";
import type { Ctx } from "../context";
import { badRequest } from "../errors";
import { now } from "../store";

const LEDGER_TYPES: readonly LedgerEventType[] = ["granted", "withdrawn", "ack", "anchor", "purpose"];
const lc = (s: string): string => s.toLowerCase();

export function auditRoutes(ctx: Ctx): Router {
  const { store } = ctx;
  const r = Router();

  r.get("/audit/fiduciaries", (_req, res) => {
    res.json({
      fiduciaries: store.fiduciaries.map((f) => scorecard(store, f.address)),
    } satisfies AuditFiduciariesResponse);
  });

  r.get("/audit/ledger", (req, res) => {
    const { fid, principal, type } = req.query;
    for (const [name, v] of [["fid", fid], ["principal", principal]] as const) {
      if (v !== undefined && (typeof v !== "string" || !isAddress(v))) throw badRequest(`"${name}" must be an address`);
    }
    if (type !== undefined && !LEDGER_TYPES.includes(type as LedgerEventType)) {
      throw badRequest(`"type" must be one of ${LEDGER_TYPES.join(", ")}`);
    }
    const events = store.ledgerEvents
      .filter((e) => !fid || e.fiduciary?.toLowerCase() === lc(fid as string))
      .filter((e) => !principal || e.principal?.toLowerCase() === lc(principal as string))
      .filter((e) => !type || e.type === type)
      .reverse();
    res.json({ events } satisfies AuditLedgerResponse);
  });

  r.post("/audit/verify/:fid", (req, res) => {
    const f = store.fiduciary(req.params.fid!);
    const result = verifyFiduciary(store, f.address);
    if (!result.ok) {
      const bad = result.batches.find((b) => !b.ok);
      ctx.publish({
        event: "tamper.alert",
        fiduciary: f.address,
        batchIndex: bad?.index ?? null,
        firstBadSeq: bad?.firstBadSeq ?? null,
        detectedAt: now(),
      });
    }
    res.json(result satisfies VerifyResponse);
  });

  r.get("/audit/report/:fid", (req, res) => {
    res.json(report(store, store.fiduciary(req.params.fid!).address) satisfies AuditReportResponse);
  });

  return r;
}
