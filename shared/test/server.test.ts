// The hosting helpers every service shares (trd.md §10): production checks, CORS allowlist, headers, graceful shutdown.
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { checkProductionEnv, cors, healthz, isProbePath, originAllowed, parseOrigins, securityHeaders } from "../src/server";

const here = dirname(fileURLToPath(import.meta.url));

function fakeRes() {
  const headers: Record<string, string> = {};
  const res = {
    statusCode: 0,
    body: undefined as string | undefined,
    headers,
    setHeader(name: string, value: string) {
      headers[name.toLowerCase()] = value;
    },
    end(body?: string) {
      res.body = body ?? "";
    },
  };
  return res;
}

describe("checkProductionEnv", () => {
  const rules = [{ name: "A" }, { name: "SECRET", forbidden: ["default"] }, { name: "URL", https: true }];

  it("does nothing outside production", () => {
    expect(() => checkProductionEnv("Svc", {}, rules)).not.toThrow();
  });

  it("lists every problem at once, never a value", () => {
    const env = { NODE_ENV: "production", SECRET: "default", URL: "http://x.test" };
    expect(() => checkProductionEnv("Svc", env, rules)).toThrow(/Svc cannot start in production\. .*A \(missing\), SECRET \(it is a published default\), URL \(must be an https/);
    try {
      checkProductionEnv("Svc", { ...env, SECRET: "default" }, rules);
    } catch (err) {
      expect(String(err)).not.toContain("http://x.test");
    }
  });

  it("passes a complete environment", () => {
    expect(() => checkProductionEnv("Svc", { NODE_ENV: "production", A: "1", SECRET: "real", URL: "https://x.test" }, rules)).not.toThrow();
  });
});

describe("origins and CORS", () => {
  it("parses a list and drops trailing slashes", () => {
    expect(parseOrigins(" https://a.app , https://b.app/ ,")).toEqual(["https://a.app", "https://b.app"]);
    expect(parseOrigins(undefined)).toEqual([]);
  });

  it("allows a missing Origin, a listed one and, with *, any", () => {
    expect(originAllowed(["https://a.app"], undefined)).toBe(true);
    expect(originAllowed(["https://a.app"], "https://a.app")).toBe(true);
    expect(originAllowed(["https://a.app"], "https://evil.app")).toBe(false);
    expect(originAllowed(["*"], "https://anything.app")).toBe(true);
  });

  it("echoes only a listed origin, varies on it, and answers a preflight with 204", () => {
    const mw = cors(["https://a.app"], { headers: "content-type", methods: "GET,POST" });
    const ok = fakeRes();
    let nexted = false;
    mw({ method: "GET", headers: { origin: "https://a.app" } }, ok, () => (nexted = true));
    expect([ok.headers["access-control-allow-origin"], ok.headers.vary, nexted]).toEqual(["https://a.app", "Origin", true]);

    const bad = fakeRes();
    mw({ method: "GET", headers: { origin: "https://evil.app" } }, bad, () => undefined);
    expect(bad.headers["access-control-allow-origin"]).toBeUndefined();

    const pre = fakeRes();
    nexted = false;
    mw({ method: "OPTIONS", headers: { origin: "https://a.app" } }, pre, () => (nexted = true));
    expect([pre.statusCode, nexted]).toEqual([204, false]);
  });
});

describe("headers and /healthz", () => {
  it("sets the security headers, HSTS only in production, and a custom CSP when given", () => {
    const dev = fakeRes();
    securityHeaders({ production: false })({ headers: {} }, dev, () => undefined);
    expect(dev.headers["strict-transport-security"]).toBeUndefined();
    expect(dev.headers["x-content-type-options"]).toBe("nosniff");
    expect(dev.headers["content-security-policy"]).toBe("default-src 'none'; frame-ancestors 'none'");

    const prod = fakeRes();
    securityHeaders({ production: true, csp: "frame-ancestors 'none'" })({ headers: {} }, prod, () => undefined);
    expect(prod.headers["strict-transport-security"]).toMatch(/max-age/);
    expect(prod.headers["content-security-policy"]).toBe("frame-ancestors 'none'");
  });

  it("/healthz answers a bare ok, uncached", () => {
    const res = fakeRes();
    healthz({ headers: {} }, res, () => {
      throw new Error("healthz must end the response");
    });
    expect([res.statusCode, res.body, res.headers["cache-control"]]).toEqual([200, "ok", "no-store"]);
    expect(isProbePath("/healthz") && isProbePath("/readyz") && !isProbePath("/v1/health")).toBe(true);
  });
});

describe("shutdownOnSignal", () => {
  const run = (script: string) => {
    const tsx = createRequire(import.meta.url).resolve("tsx/cli");
    return spawnSync(process.execPath, [tsx, "-e", script], { cwd: resolve(here, ".."), encoding: "utf8", timeout: 30_000 });
  };

  it("runs the stop function once on SIGTERM, then exits 0", () => {
    const r = run(`
      import { shutdownOnSignal } from "./src/server";
      let calls = 0;
      shutdownOnSignal(async () => { calls++; await new Promise((r) => setTimeout(r, 50)); console.log("stopped", calls); });
      setTimeout(() => { process.emit("SIGTERM"); process.emit("SIGTERM"); }, 50);
      setInterval(() => {}, 1000);
    `);
    expect(r.stdout).toContain("stopped 1");
    expect(r.status).toBe(0);
  });

  it("cuts off a stop that hangs", () => {
    const r = run(`
      import { shutdownOnSignal } from "./src/server";
      shutdownOnSignal(() => new Promise(() => {}), 200);
      setTimeout(() => process.emit("SIGTERM"), 50);
      setInterval(() => {}, 1000);
    `);
    expect(r.status).toBe(0);
  });
});
