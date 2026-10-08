import { Router } from "express";
import { getAddress, isAddress } from "ethers";
import type { Ctx } from "../context";
import { badRequest, requireBody, requireString } from "../errors";

function address(v: string, label: string): string {
  if (!isAddress(v)) throw badRequest(`"${label}" must be an address`);
  return getAddress(v);
}

export function rightsRoutes(ctx: Ctx): Router {
  const r = Router();

  r.post("/rights", (req, res) => {
    const body = requireBody(req.body);
    const principal = address(requireString(body, "principal"), "principal");
    const fiduciary = address(requireString(body, "fiduciary"), "fiduciary");
    const type = requireString(body, "type");
    const note = body.note ? String(body.note) : "";

    if (type !== "access" && type !== "erasure" && type !== "grievance") {
      throw badRequest('"type" must be access, erasure, or grievance');
    }

    const created = ctx.store.createRightsRequest(principal, fiduciary, type, note);
    res.status(201).json(created);
  });

  r.get("/principals/:addr/rights", (req, res) => {
    const principal = address(req.params.addr!, "addr");
    const rights = ctx.store.rightsForPrincipal(principal).map(r => ({
      ...r,
      fiduciaryName: ctx.store.fiduciary(r.fiduciary).name,
    }));
    res.json({ principal, rights });
  });

  return r;
}
