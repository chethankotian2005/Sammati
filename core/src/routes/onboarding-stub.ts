// Stub mode serves the directory (so the web can list companies) and refuses onboarding: registering a company needs
// a chain to register it on (trd.md §6.12).
import { Router, type RequestHandler } from "express";
import { DEFAULT_COMPANY_COLOR, type FiduciariesResponse } from "@sammati/shared";
import { HttpError } from "../errors";
import type { Ctx } from "../context";

const needsRealMode: RequestHandler = (_req, _res, next) =>
  next(new HttpError(501, "NOT_IMPLEMENTED", "Company registration needs real mode (STUB_MODE=false): there is no chain to register on in the stub"));

export function onboardingStubRoutes(ctx: Ctx): Router {
  const r = Router();
  r.get("/fiduciaries", (_req, res) => {
    res.json({
      fiduciaries: ctx.store.fiduciaries.map((f) => ({
        address: f.address,
        slug: f.slug,
        name: f.name,
        sector: f.sector,
        color: f.color || DEFAULT_COMPANY_COLOR,
        sandbox: false,
        demo: true,
      })),
    } satisfies FiduciariesResponse);
  });
  r.use(["/registrations", "/regulator", "/gateway/whoami"], needsRealMode);
  return r;
}
