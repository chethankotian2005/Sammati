import express, { type Express, type RequestHandler } from "express";
import type { HealthResponse } from "@sammati/shared";
import { now } from "./clock";
import type { Config } from "./config";
import { errorHandler, notFoundHandler } from "./errors";
import type { RealCore } from "./real/core";
import { realRoutes } from "./real/routes";
import { onboardingRoutes } from "./real/onboarding-routes";
import { notificationRoutes } from "./real/notification-routes";
import { targetedRoutes } from "./real/targeted-routes";
import { vaultRoutes } from "./routes/vault";

// Browsers (the web console and Auditor) call Core cross-origin.
const cors: RequestHandler = (req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "content-type,x-sammati-api-key,x-sammati-regulator-key");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
};

function baseApp(_config: Config): Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(cors);
  app.use(express.json());
  app.get("/v1/health", (_req, res) => {
    res.json({ ok: true, service: "sammati-core", time: now() } satisfies HealthResponse);
  });
  return app;
}

/** SQLite, the chain and a relayer behind the routes of trd.md §6. */
export function createRealApp(core: RealCore): Express {
  const app = baseApp(core.config);
  app.use("/v1", onboardingRoutes(core), realRoutes(core), vaultRoutes(core), targetedRoutes(core), notificationRoutes(core));
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
