// HTTP for the Processor (trd.md §6.7). The request log prints method, path, status and time: never a body,
// because a body here can be an envelope or, if something is wrong, data. Errors print only their class name
// for the same reason (a JSON parse error message quotes the text it choked on).
import express, { type Express, type NextFunction, type Request, type RequestHandler, type Response } from "express";
import { cors, healthz, isProbePath, securityHeaders } from "@sammati/shared/src/server";
import type { ProcessorConfig } from "./config";
import { ApiFailure, type ProcessorService } from "./service";

const handle =
  (fn: (req: Request, res: Response) => Promise<void> | void): RequestHandler =>
  (req, res, next) => {
    Promise.resolve()
      .then(() => fn(req, res))
      .catch(next);
  };

/** `ready` backs GET /readyz (the vault and the chain answer); it is for people and monitors, never for the platform. */
export function createApp(
  service: ProcessorService,
  config: ProcessorConfig,
  log: (line: string) => void = console.log,
  ready: () => Promise<void> = () => Promise.resolve(),
): Express {
  const app = express();
  app.set("trust proxy", 1);
  app.disable("x-powered-by");
  app.use(securityHeaders({ production: config.production }));
  app.get("/healthz", healthz); // first route: answers at once, touches nothing, leaves no log line (trd.md §10.3)
  // The wallet runs in a browser too (flutter run -d chrome), so it needs CORS.
  app.use(cors(config.corsOrigins, { headers: "content-type, x-sammati-api-key", methods: "GET,POST,OPTIONS" }));
  app.use((req, res, next) => {
    if (isProbePath(req.path)) return next();
    const started = Date.now();
    res.on("finish", () => log(`[processor] ${req.method} ${req.path} ${res.statusCode} ${Date.now() - started}ms`));
    next();
  });
  app.use(express.json({ limit: "16kb" }));

  app.get("/readyz", (_req, res) => {
    ready().then(
      () => void res.json({ ready: true }),
      (err: unknown) => void res.status(503).json({ ready: false, reason: err instanceof Error ? err.message : "not ready" }),
    );
  });

  app.get("/health", (_req, res) => {
    res.json({ ok: true, service: "processor", mode: "simulated-enclave", time: Math.floor(Date.now() / 1000) });
  });

  app.get("/v1/processor/pubkey", (_req, res) => {
    res.json({ v: 1, alg: "X25519", publicKey: service.publicKey, mode: "simulated-enclave" });
  });

  app.post(
    "/v1/vault/submit",
    handle(async (req, res) => {
      const result = await service.submit(req.body);
      res.status(result.created ? 201 : 200).json({ handle: result.handle, ciphertextHash: result.ciphertextHash, version: result.version });
    }),
  );

  app.get(
    "/v1/vault/:handle",
    handle((req, res) => {
      res.json(service.view(String(req.params.handle)));
    }),
  );

  app.post(
    "/v1/processor/evaluate",
    handle(async (req, res) => {
      const result = await service.evaluate(req.header("x-sammati-api-key"), req.body);
      res.setHeader("x-sammati-entry-id", result.entryId);
      res.json(result);
    }),
  );

  app.post(
    "/v1/processor/callback",
    handle(async (req, res) => {
      await service.registerCallback(req.header("x-sammati-api-key"), req.body);
      res.status(204).end();
    }),
  );

  app.use((req, _res, next) => next(new ApiFailure(404, "NOT_FOUND", `No route for ${req.method} ${req.path}`)));
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ApiFailure) {
      if (err.entryId) res.setHeader("x-sammati-entry-id", err.entryId);
      // 451 is the gateway's shape ({ code, message }); everything else is { error: { code, message } } (trd.md §6.7).
      res.status(err.status).json(err.status === 451 ? { code: err.code, message: err.message } : { error: { code: err.code, message: err.message } });
      return;
    }
    // A body-parser error quotes the text it could not parse, so its message is never shown or logged.
    const known = err as { type?: string; status?: number };
    if (known.type === "entity.parse.failed") {
      res.status(400).json({ error: { code: "BAD_JSON", message: "The body is not valid JSON" } });
      return;
    }
    if (known.type === "entity.too.large") {
      res.status(413).json({ error: { code: "TOO_LARGE", message: "The body is too large" } });
      return;
    }
    log(`[processor] internal error (${err instanceof Error ? err.name : "unknown"})`);
    res.status(500).json({ error: { code: "INTERNAL", message: "Unexpected error" } });
  });
  return app;
}
