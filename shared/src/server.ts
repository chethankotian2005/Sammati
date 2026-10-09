// What every Sammati HTTP service shares when it is hosted (trd.md §10): production checks, CORS allowlist, security
// headers, /healthz and graceful shutdown. Server packages import it as "@sammati/shared/src/server"; it is not in the
// package index, so the browser bundles never see it. Types are structural so it needs no express dependency.
import type { Server } from "node:http";

type Env = Record<string, string | undefined>;

interface Req {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
}
interface Res {
  statusCode: number;
  setHeader(name: string, value: string): unknown;
  end(body?: string): unknown;
}
type Next = () => void;
export type Middleware = (req: Req, res: Res, next: Next) => void;

export const DEFAULT_HOST = "0.0.0.0";

export function isProduction(env: Env): boolean {
  return env.NODE_ENV === "production";
}

export interface EnvRule {
  name: string;
  /** Published defaults that must never be used for real. */
  forbidden?: string[];
  /** The value is a public URL: it must be https. */
  https?: boolean;
}

/**
 * In production, a missing or unusable variable stops the service at start, naming every one of them at once, so a
 * deploy fails loudly instead of running half configured. Outside production it does nothing.
 */
export function checkProductionEnv(service: string, env: Env, rules: EnvRule[]): void {
  if (!isProduction(env)) return;
  const problems: string[] = [];
  for (const rule of rules) {
    const value = env[rule.name]?.trim();
    if (!value) problems.push(`${rule.name} (missing)`);
    else if (rule.forbidden?.includes(value)) problems.push(`${rule.name} (it is a published default)`);
    else if (rule.https && !/^https:\/\//i.test(value)) problems.push(`${rule.name} (must be an https:// URL)`);
  }
  if (problems.length > 0) throw new Error(`${service} cannot start in production. Missing or unusable environment variables: ${problems.join(", ")}`);
}

/** "https://a.app, https://b.app/" -> ["https://a.app", "https://b.app"]. */
export function parseOrigins(raw: string | undefined): string[] {
  return (raw ?? "").split(",").map((o) => o.trim().replace(/\/+$/, "")).filter(Boolean);
}

/** A request with no Origin (the wallet, a company server, curl) is not a browser cross-origin request. */
export function originAllowed(allowed: string[], origin: string | undefined): boolean {
  return origin === undefined || allowed.includes("*") || allowed.includes(origin);
}

/** `*` is for local development; production passes an explicit list (trd.md §10.6). */
export function cors(allowed: string[], opts: { headers: string; methods: string }): Middleware {
  const any = allowed.includes("*");
  return (req, res, next) => {
    const origin = typeof req.headers.origin === "string" ? req.headers.origin : undefined;
    if (any) res.setHeader("Access-Control-Allow-Origin", "*");
    else if (origin !== undefined && allowed.includes(origin)) res.setHeader("Access-Control-Allow-Origin", origin);
    if (!any) res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Headers", opts.headers);
    res.setHeader("Access-Control-Allow-Methods", opts.methods);
    if (req.method === "OPTIONS") {
      res.statusCode = 204;
      res.end();
      return;
    }
    next();
  };
}

const API_CSP = "default-src 'none'; frame-ancestors 'none'";

/** Standard response headers (trd.md §10.6). `csp` replaces the API policy for a service that serves HTML. */
export function securityHeaders(opts: { production: boolean; csp?: string }): Middleware {
  return (_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    res.setHeader("Content-Security-Policy", opts.csp ?? API_CSP);
    if (opts.production) res.setHeader("Strict-Transport-Security", "max-age=15552000; includeSubDomains");
    next();
  };
}

/** `GET /healthz`: answers at once and touches nothing (no chain, no database, no log line). Mount it first. */
export const healthz: Middleware = (_req, res) => {
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end("ok");
};

/** True for the two platform probe paths, so request logging can leave them out. */
export const isProbePath = (path: string): boolean => path === "/healthz" || path === "/readyz";

export function listen(server: Server, port: number, host = DEFAULT_HOST): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });
}

/**
 * Runs `stop` once on SIGTERM or SIGINT, then exits 0; a stop that takes longer than `graceMs` is cut off, because the
 * platform kills the process soon after SIGTERM anyway. Nothing in `stop` should wait for the chain.
 */
export function shutdownOnSignal(stop: () => Promise<void> | void, graceMs = 10_000): void {
  let stopping = false;
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      if (stopping) return;
      stopping = true;
      const cutoff = setTimeout(() => process.exit(0), graceMs);
      cutoff.unref();
      Promise.resolve()
        .then(stop)
        .catch((err) => console.warn("[shutdown]", err instanceof Error ? err.message : err))
        .finally(() => process.exit(0));
    });
  }
}

/** Stops accepting connections and resolves once the open ones finished (or were closed idle). */
export function closeServer(server: Server): Promise<void> {
  return new Promise((resolve) => {
    server.close(() => resolve());
    server.closeIdleConnections();
  });
}
