import express, { type Express, type RequestHandler } from "express";
import type { HealthResponse } from "@sammati/shared";
import type { Config } from "./config";
import type { Ctx } from "./context";
import { errorHandler, notFoundHandler } from "./errors";
import type { RealCore } from "./real/core";
import { realRoutes } from "./real/routes";
import { notificationRoutes } from "./real/notification-routes";
import { targetedRoutes } from "./real/targeted-routes";
import { auditRoutes } from "./routes/audit";
import { companyRoutes } from "./routes/company";
import { consentRoutes } from "./routes/consent";
import { demoRoutes } from "./routes/demo";
import { rightsRoutes } from "./routes/rights";
import { vaultRoutes } from "./routes/vault";
import { targetedStubRoutes } from "./routes/targeted-stub";
import { now } from "./store";

// Browsers (the web console, Auditor and Stage view) call Core cross-origin.
const cors: RequestHandler = (req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "content-type");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
};

function baseApp(config: Config): Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(cors);
  app.use(express.json());
  app.get("/v1/health", (_req, res) => {
    res.json({
      ok: true,
      service: "sammati-core",
      mode: config.stubMode ? "stub" : "live",
      time: now(),
    } satisfies HealthResponse);
  });
  return app;
}

function finish(app: Express): Express {
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

/** Stub mode: fixtures plus light in-memory state, no chain. */
export function createApp(ctx: Ctx): Express {
  const app = baseApp(ctx.config);
  app.use("/v1", consentRoutes(ctx), companyRoutes(ctx), auditRoutes(ctx), demoRoutes(ctx), rightsRoutes(ctx), vaultRoutes(ctx), targetedStubRoutes());
  return finish(app);
}

/** Real mode: SQLite, the chain and a relayer behind the same routes. */
export function createRealApp(core: RealCore): Express {
  const app = baseApp(core.config);
  app.use("/v1", realRoutes(core), vaultRoutes(core), targetedRoutes(core), notificationRoutes(core));
  return finish(app);
}
