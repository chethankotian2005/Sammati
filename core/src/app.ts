import express, { type Express, type RequestHandler } from "express";
import type { HealthResponse } from "@sammati/shared";
import type { Ctx } from "./context";
import { errorHandler, notFoundHandler } from "./errors";
import { auditRoutes } from "./routes/audit";
import { companyRoutes } from "./routes/company";
import { consentRoutes } from "./routes/consent";
import { demoRoutes } from "./routes/demo";
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

export function createApp(ctx: Ctx): Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(cors);
  app.use(express.json());

  app.get("/v1/health", (_req, res) => {
    res.json({
      ok: true,
      service: "sammati-core",
      mode: ctx.config.stubMode ? "stub" : "live",
      time: now(),
    } satisfies HealthResponse);
  });
  app.use("/v1", consentRoutes(ctx), companyRoutes(ctx), auditRoutes(ctx), demoRoutes(ctx));

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
