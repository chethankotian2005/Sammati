import express, { type Express } from "express";
import type { ApiError, HealthResponse } from "@sammati/shared";
import { cors, healthz, securityHeaders } from "@sammati/shared/src/server";
import { now } from "./clock";
import type { Config } from "./config";
import { errorHandler, notFoundHandler } from "./errors";
import type { RealCore } from "./real/core";
import { realRoutes } from "./real/routes";
import { onboardingRoutes } from "./real/onboarding-routes";
import { notificationRoutes } from "./real/notification-routes";
import { targetedRoutes } from "./real/targeted-routes";
import { vaultRoutes } from "./routes/vault";

const CORS = {
  headers: "content-type,authorization,x-sammati-api-key,x-sammati-regulator-key",
  methods: "GET,POST,DELETE,OPTIONS",
};

/** /healthz comes right after the headers, before everything else: it must answer at once and touch nothing (trd.md §10.3). */
function baseApp(config: Config): Express {
  const app = express();
  app.set("trust proxy", 1); // Render's proxy: req.ip is the client, so the per-address limits mean something
  app.disable("x-powered-by");
  app.use(securityHeaders({ production: config.production }));
  app.get("/healthz", healthz);
  app.use(cors(config.corsOrigins, CORS)); // browsers (the web console and Auditor) call Core cross-origin
  app.use(express.json());
  return app;
}

/** What answers while Core opens its database and finds the chain: alive, honest about not being ready (trd.md §10.3). */
export function createBootApp(config: Config): Express {
  const app = baseApp(config);
  app.use((_req, res) => {
    res.setHeader("Retry-After", "2");
    res.status(503).json({ error: { code: "STARTING", message: "Core is starting; try again in a moment" } } satisfies ApiError);
  });
  return app;
}

/** SQLite, the chain and a relayer behind the routes of trd.md §6. */
export function createRealApp(core: RealCore): Express {
  const app = baseApp(core.config);
  // Unlike /healthz this means "Core can serve", so it is only here and not in the boot app.
  app.get("/v1/health", (_req, res) => {
    res.json({ ok: true, service: "sammati-core", time: now() } satisfies HealthResponse);
  });
  // For a person or a monitor, never for the platform: it spends an RPC call. The reason names the part, never the URL.
  app.get("/readyz", (_req, res) => {
    core.checkReady().then(
      () => void res.json({ ready: true }),
      (err: unknown) => void res.status(503).json({ ready: false, reason: err instanceof Error ? err.message : "not ready" }),
    );
  });
  app.use("/v1", onboardingRoutes(core), realRoutes(core), vaultRoutes(core), targetedRoutes(core), notificationRoutes(core));
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
