import { Router } from "express";
import type { RightsResponse } from "@sammati/shared";
import type { Ctx } from "../context";
import { address, parseRightsBody } from "../validate";

/** Stub mode: data-rights requests in memory. Real mode: core/src/real/routes.ts, same paths and shapes. */
export function rightsRoutes(ctx: Ctx): Router {
  const r = Router();

  r.post("/rights", (req, res) => {
    const { principal, fiduciary, type, note } = parseRightsBody(req.body);
    const company = ctx.store.fiduciary(fiduciary); // 404 FIDUCIARY_NOT_FOUND for a company that does not exist
    res.status(201).json(ctx.store.createRightsRequest(principal, company.address, type, note));
  });

  r.get("/principals/:addr/rights", (req, res) => {
    const principal = address(req.params.addr!, "addr");
    const rights = ctx.store.rightsForPrincipal(principal).map((request) => ({
      ...request,
      fiduciaryName: ctx.store.fiduciary(request.fiduciary).name,
    }));
    res.json({ principal, rights } satisfies RightsResponse);
  });

  return r;
}
