import { getBytes } from "ethers";
import { PROCESSOR_PORT, type Deployment, type Hex } from "@sammati/shared";
import { checkProductionEnv, DEFAULT_HOST, isProduction, parseOrigins } from "@sammati/shared/src/server";

export interface ProcessorConfig {
  /** NODE_ENV=production: required variables are checked at start and the key is never generated (trd.md §10). */
  production: boolean;
  port: number;
  host: string;
  /** Browser origins allowed to call the Processor (the wallet on the web), or ["*"] outside production. */
  corsOrigins: string[];
  /** The X25519 private key from PROCESSOR_KEY, or null to generate one at start (trd.md §10). Never logged. */
  privateKey: Uint8Array | null;
  dbPath: string;
  coreUrl: string;
  chainRpc: string;
  chainNetwork: string;
  /** Overrides the deployments.json entry (tests). */
  deployment?: Deployment;
  /** API key -> the company it identifies (lower-case address). */
  apiKeys: Map<string, Hex>;
  /**
   * Keys of companies that joined after the Processor started (prd.md R-01), learned from Core when they first call:
   * company (lower-case address) -> its last API key. Filled at run time, only ever by a Core that vouched for the key.
   */
  registeredKeys: Map<Hex, string>;
  /** Company address (lower-case) -> where to tell it about stored and erased vault entries. */
  callbacks: Record<string, string>;
  /** Shared secret for Core's event intake. */
  eventKey: string;
  sweepMs: number;
  /** How long after expiry the ciphertext is kept (every use is refused meanwhile), so a renewal need not resend it (trd.md §6.7, §6.12). */
  expiryGraceSeconds: number;
}

function json<T>(raw: string | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    // A bad value must not take the Processor down, but it must not be silently ignored either.
    console.warn("[processor] ignoring a setting that is not valid JSON");
    return fallback;
  }
}

const DEMO_EVENT_KEY = "local-processor-events";

/** The Processor never makes up a key in production: a generated one would silently make stored ciphertext unreadable. */
export function checkProductionConfig(env: NodeJS.ProcessEnv): void {
  checkProductionEnv("Processor", env, [
    { name: "PORT" },
    { name: "PROCESSOR_KEY" },
    { name: "CORE_URL", https: true },
    { name: "CHAIN_RPC" },
    { name: "CHAIN_NETWORK" },
    { name: "PROCESSOR_EVENT_KEY", forbidden: [DEMO_EVENT_KEY] },
    { name: "VAULT_PATH" },
    { name: "CORS_ORIGINS" },
  ]);
  if (isProduction(env)) {
    if (!/^0x[0-9a-fA-F]{64}$/.test(env.PROCESSOR_KEY ?? "")) throw new Error("Processor cannot start in production. PROCESSOR_KEY must be 0x followed by 64 hex characters");
    if (parseOrigins(env.CORS_ORIGINS).includes("*")) throw new Error("Processor cannot start in production. CORS_ORIGINS must list exact origins, not *");
  }
}

export function readConfig(env: NodeJS.ProcessEnv = process.env): ProcessorConfig {
  // DEV_TOOLS only enables command-line scripts, but a service that sits beside NODE_ENV=production refuses it all the same.
  if (env.DEV_TOOLS === "true" && env.NODE_ENV === "production") throw new Error("DEV_TOOLS=true is not allowed with NODE_ENV=production");
  checkProductionConfig(env);
  const production = isProduction(env);
  // No company is built in: keys are learned from Core on a company's first call, callbacks registered by the company (trd.md §6.7).
  const keys = json<Record<string, string>>(env.FIDUCIARY_API_KEYS, {});
  const callbacks = json<Record<string, string>>(env.FIDUCIARY_CALLBACKS, {});
  return {
    production,
    // A shared .env sets PORT for Core, so locally the Processor has its own variable; a host sets PORT for each service.
    port: Number((production ? env.PORT : env.PROCESSOR_PORT) ?? PROCESSOR_PORT),
    host: DEFAULT_HOST,
    corsOrigins: production ? parseOrigins(env.CORS_ORIGINS) : ["*"],
    privateKey: env.PROCESSOR_KEY ? getBytes(env.PROCESSOR_KEY) : null,
    dbPath: env.VAULT_PATH ?? "./data/processor.sqlite",
    coreUrl: (env.CORE_URL ?? "http://localhost:4000").replace(/\/+$/, ""),
    chainRpc: env.CHAIN_RPC ?? "http://127.0.0.1:8545",
    chainNetwork: env.CHAIN_NETWORK ?? "localhost",
    apiKeys: new Map(Object.entries(keys).map(([k, a]) => [k, a.toLowerCase() as Hex])),
    registeredKeys: new Map(),
    callbacks: Object.fromEntries(Object.entries(callbacks).map(([a, u]) => [a.toLowerCase(), u])),
    eventKey: env.PROCESSOR_EVENT_KEY ?? DEMO_EVENT_KEY,
    sweepMs: Number(env.PROCESSOR_SWEEP_MS ?? 30_000),
    expiryGraceSeconds: Number(env.EXPIRY_ERASURE_GRACE_SECONDS ?? 604_800),
  };
}
