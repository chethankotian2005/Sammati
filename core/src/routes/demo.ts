import { Router, type RequestHandler } from "express";
import { getAddress, isAddress } from "ethers";
import type { DemoAnchorResponse, DemoFireResponse, DemoResetResponse, TamperResponse } from "@sammati/shared";
import { tamper } from "../audit";
import type { Ctx } from "../context";
import { HttpError, badRequest, requireBody, requireString } from "../errors";

const DEFAULT_ENDPOINT = "GET /simulator";

export function demoRoutes(ctx: Ctx): Router {
  const { store, config } = ctx;
  const r = Router();

  const demoOnly: RequestHandler = (_req, _res, next) => {
    if (!config.demoMode) return next(new HttpError(403, "DEMO_DISABLED", "Demo controls need DEMO_MODE=true"));
    next();
  };
  r.use("/demo", demoOnly);

  r.post("/demo/tamper/:fid", (req, res) => {
    res.json(tamper(store, store.fiduciary(req.params.fid!).address) satisfies TamperResponse);
  });

  // The stub's fixtures are anchored already and it has no chain to anchor on.
  r.post("/demo/anchor", (_req, res) => {
    res.json({ batches: [] } satisfies DemoAnchorResponse);
  });

  r.post("/demo/reset", (_req, res) => {
    store.reset();
    res.json({ ok: true } satisfies DemoResetResponse);
  });

  r.post("/demo/fire", (req, res) => {
    const o = requireBody(req.body);
    const f = store.fiduciary(requireString(o, "fiduciary"));
    const purpose = store.purpose(f, requireString(o, "purposeCode"));
    const principalRaw = requireString(o, "principal");
    if (!isAddress(principalRaw)) throw badRequest('"principal" must be an address');
    const principal = getAddress(principalRaw);

    const state = store.consentState(principal, f.address, purpose.id);
    const row = store.recordDecision(
      f,
      principal,
      purpose.code,
      typeof o.endpoint === "string" ? o.endpoint : DEFAULT_ENDPOINT,
      state,
    );
    ctx.publish({
      event: "access.logged",
      principal,
      fiduciary: f.address,
      fiduciaryName: f.name,
      entryId: row.id,
      seq: row.seq,
      purposeCode: row.purposeCode,
      decision: row.decision,
      reason: row.reason,
      endpoint: row.endpoint,
      at: row.at,
    });
    // The stub has no Processor: an allowed loan decision is the fixture answer for the demo profile.
    const result: DemoFireResponse["result"] =
      o.action === "loan_decision" && row.decision === "ALLOWED" ? { decision: "approved", limit: 300000, reasonCodes: ["SCORE_FAIR"] } : undefined;
    res.json({ decision: row.decision, reason: row.reason, entryId: row.id, ...(result ? { result } : {}) } satisfies DemoFireResponse);
  });

  // Needs a chain to sign against; the stub has none (trd.md §6.4).
  r.post("/demo/withdraw", () => {
    throw new HttpError(501, "NOT_IMPLEMENTED", "Withdrawing for the demo customer needs real mode");
  });

  return r;
}
