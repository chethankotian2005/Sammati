// Routes for company onboarding and API-key authentication (trd.md §6.2a, §6.12).
import { Router, type Request, type RequestHandler, type Response } from "express";
import { createHash } from "node:crypto";
import {
  API_KEY_HEADER,
  REGULATOR_KEY_HEADER,
  type ApproveBody,
  type FiduciariesResponse,
  type RegistrationsListResponse,
  type RejectResponse,
  type SandboxResponse,
  type TestPrincipalsResponse,
  type WhoAmIResponse,
} from "@sammati/shared";
import { HttpError, requireBody } from "../errors";
import type { RealCore } from "./core";
import type { FiduciaryRow } from "./repo";

const handle =
  (fn: (req: Request, res: Response) => unknown | Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    Promise.resolve()
      .then(() => fn(req, res))
      .catch(next);
  };

const param = (req: Request, name: string): string => String(req.params[name]);

const UNKNOWN_KEY = "This API key is not recognised. A company can use Sammati only after the regulator approves its registration.";

/**
 * Authenticates a company server by its API key. `required`: no key is 401 `INVALID_API_KEY`. Optional: no key passes
 * (the console has no login in this build), but a key that is given must be known. Either way the call is rate limited per company.
 */
export function companyKey(core: RealCore, required: boolean): RequestHandler {
  return (req, res, next) => {
    try {
      const key = req.header(API_KEY_HEADER);
      if (!key) {
        if (required) throw new HttpError(401, "INVALID_API_KEY", UNKNOWN_KEY);
        return next();
      }
      const company = core.repo.fiduciaryForKey(key);
      if (!company) throw new HttpError(401, "INVALID_API_KEY", UNKNOWN_KEY);
      core.onboarding.checkGatewayRate(company.address);
      res.locals.company = company;
      next();
    } catch (err) {
      next(err);
    }
  };
}

/** The company the key proved, if any. */
export const authenticated = (res: Response): FiduciaryRow | undefined => res.locals.company as FiduciaryRow | undefined;

/** A key works for one company only (trd.md §6.2a). */
export function mustOwn(res: Response, fiduciary: string): void {
  const company = authenticated(res);
  if (company && company.address.toLowerCase() !== fiduciary.toLowerCase()) {
    throw new HttpError(403, "FIDUCIARY_MISMATCH", "This API key belongs to another company");
  }
}

function regulatorOnly(core: RealCore): RequestHandler {
  return (req, _res, next) => {
    if (req.header(REGULATOR_KEY_HEADER) !== core.config.regulatorKey) {
      return next(new HttpError(401, "UNAUTHORIZED", "Regulator access code required"));
    }
    next();
  };
}

export function onboardingRoutes(core: RealCore): Router {
  const { repo, onboarding } = core;
  const r = Router();

  // --- directory (R-04) ---

  r.get("/fiduciaries", handle((_req, res) => {
    res.json({
      fiduciaries: repo.fiduciaries().map((f) => ({ address: f.address, slug: f.slug, name: f.name, sector: f.sector, color: f.color, sandbox: f.sandbox })),
    } satisfies FiduciariesResponse);
  }));

  // --- applying (R-01) ---

  r.post("/registrations", handle((req, res) => {
    res.status(201).json(onboarding.submit(req.body, req.ip ?? "unknown"));
  }));

  r.get("/registrations/:applicationId", handle((req, res) => {
    res.json(onboarding.status(param(req, "applicationId")));
  }));

  r.get("/gateway/whoami", companyKey(core, true), handle((_req, res) => {
    const f = authenticated(res)!;
    res.json({ fiduciary: f.address, slug: f.slug, name: f.name, sandbox: f.sandbox } satisfies WhoAmIResponse);
  }));

  // --- console operators (C-10) ---
  r.post("/console/login", handle((req, res) => {
    const body = requireBody(req.body);
    const email = typeof body.email === "string" ? body.email : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (!email || !password) throw new HttpError(400, "BAD_CREDENTIALS", "Email and password required");
    const hash = createHash("sha256").update(password, "utf8").digest("hex");
    const result = repo.consoleLogin(email, hash);
    if (!result) throw new HttpError(401, "UNAUTHORIZED", "Invalid email or password");
    res.json(result);
  }));

  r.get("/console/me", handle((req, res) => {
    const auth = req.header("Authorization");
    if (!auth || !auth.startsWith("Bearer ")) throw new HttpError(401, "UNAUTHORIZED", "Missing token");
    const token = auth.substring(7);
    const result = repo.consoleMe(token);
    if (!result) throw new HttpError(401, "UNAUTHORIZED", "Invalid or expired token");
    res.json(result);
  }));

  // --- the regulator (R-02) ---

  const regulator = regulatorOnly(core);

  r.get("/regulator/registrations", regulator, handle((req, res) => {
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    res.json({ applications: onboarding.list(status) } satisfies RegistrationsListResponse);
  }));

  r.post("/regulator/registrations/:id/approve", regulator, handle(async (req, res) => {
    const body = (req.body ?? {}) as ApproveBody;
    res.json(await onboarding.approve(param(req, "id"), body));
  }));

  r.post("/regulator/registrations/:id/reject", regulator, handle((req, res) => {
    res.json({ application: onboarding.reject(param(req, "id"), requireBody(req.body)) } satisfies RejectResponse);
  }));

  r.post("/regulator/fiduciaries/:fid/sandbox", regulator, handle((req, res) => {
    res.json(onboarding.setSandbox(param(req, "fid"), requireBody(req.body).sandbox) satisfies SandboxResponse);
  }));

  r.post("/regulator/fiduciaries/:fid/reissue-key", regulator, handle((req, res) => {
    onboarding.reissueKey(param(req, "fid"));
    res.json({ ok: true });
  }));

  r.get("/regulator/test-principals", regulator, handle((_req, res) => {
    res.json({ principals: onboarding.testers() } satisfies TestPrincipalsResponse);
  }));

  r.post("/regulator/test-principals", regulator, handle((req, res) => {
    const added = onboarding.addTester(requireBody(req.body));
    res.status(201).json({ principals: onboarding.testers(), added } );
  }));

  r.delete("/regulator/test-principals/:principal", regulator, handle((req, res) => {
    onboarding.removeTester(param(req, "principal"));
    res.json({ principals: onboarding.testers() } satisfies TestPrincipalsResponse);
  }));

  return r;
}
