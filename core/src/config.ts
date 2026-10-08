import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { LOCAL_ADMIN_KEY, LOCAL_RELAYER_KEY, PROCESSOR_PORT, type Deployment } from "@sammati/shared";

export interface Config {
  port: number;
  /** DEV_TOOLS=true: the two command-line scripts of trd.md §6.4 may run. Nothing in a running service reads it. */
  devTools: boolean;
  /** Base URL the wallet reaches Core on; goes into the QR code (use the LAN IP on stage). */
  publicUrl: string;
  /** Explorer base URL for proof links, overriding the deployment's. Null: use the deployment's (Polygon Amoy has one, the local chain none). */
  explorerUrl: string | null;
  chainRpc: string;
  /** Key into shared/deployments.json. */
  chainNetwork: string;
  /** Overrides the deployments.json entry (tests). */
  deployment?: Deployment;
  relayerKey: string;
  dbPath: string;
  /** Consent requests (QR codes) stop working after this long. */
  requestTtlSeconds: number;
  /** How often pending log entries are anchored. 0 turns the timer off (the 20-entry trigger and runOnce still work). */
  anchorIntervalMs: number;
  /** How long an in-process processor waits before acknowledging, [min, max] ms (trd.md §9: 1 to 3 s). */
  cascadeDelayMs: [number, number];
  indexerIntervalMs: number;
  reconcileIntervalMs: number;
  /** Targeted requests (trd.md §6.11): how many one company may send per minute, before any handle is looked at. */
  targetedRatePerMinute: number;
  /** How many open requests one company may have with one customer; the rest are dropped silently. */
  maxOpenRequestsPerUser: number;
  /** How far a signed identity or action message's `issuedAt` may be from Core's clock, in seconds (trd.md §4.5). */
  identityFreshnessSeconds: number;
  /** Sammati ID availability checks one client address may make per minute (trd.md §6.1, W-15). */
  handleChecksPerMinute: number;
  /** Where the wallet finds the Sammati Processor (trd.md §6.1). Core only points at it. */
  processorUrl: string;
  /** Shared secret the Processor sends with the events it reports: a disclosed default, change it outside a local machine (trd.md §10). */
  processorEventKey: string;
  // --- onboarding (trd.md §6.12) ---
  /** The code that identifies the regulator for the registration routes: a disclosed default shared secret, not an identity system. */
  regulatorKey: string;
  /** The registry's admin, who registers new companies. Hardhat account #0 on the local chain, like the deploy script's. */
  adminKey: string;
  /** Test ether (as a decimal string) a newly approved company's account is topped up to. Its processors get a tenth. */
  registrationFundingEth: string;
  /** Applications one client address may send per hour. */
  registrationsPerHour: number;
  /** Applications waiting for the regulator, in total, before new ones are refused. */
  maxPendingApplications: number;
  /** Calls per minute one company's API key may make (trd.md §6.2a). */
  gatewayRatePerMinute: number;
  /** Customers every sandbox company may ask, lower-case addresses, besides the regulator's own list. */
  sandboxTestPrincipals: string[];
  /** How often the expiry scheduler looks at every consent. */
  expiryTickMs: number;
  /** Seconds before expiry at which `consent.expiring` fires (descending: 3 days, 1 day). */
  expiryThresholdsSeconds: number[];
  /** The console's Expiring table looks this far ahead of expiry, and back. */
  expiringWindowSeconds: number;
  /** A consent that expired longer ago than this is no longer announced (an old database must not flood a wallet). */
  expiredNotifySeconds: number;
}

/**
 * DEV_TOOLS=true switches on the two command-line scripts (trd.md §6.4). A service refuses to start with it beside
 * NODE_ENV=production, so the scripts cannot be left enabled in a deployment.
 */
export function devToolsOn(env: NodeJS.ProcessEnv): boolean {
  const on = env.DEV_TOOLS === "true";
  if (on && env.NODE_ENV === "production") throw new Error("DEV_TOOLS=true is not allowed with NODE_ENV=production");
  return on;
}

/** Loads the repo-root .env if there is one; real environment variables win. */
export function loadDotEnv(): void {
  try {
    process.loadEnvFile(resolve(fileURLToPath(import.meta.url), "../../../.env"));
  } catch {
    // no .env: the defaults below are enough for a local run
  }
}

/** "1000,3000" -> [1000, 3000]; anything unusable falls back. */
function parseRange(value: string | undefined, fallback: [number, number]): [number, number] {
  const [min, max] = (value ?? "").split(",").map(Number);
  return Number.isFinite(min) && Number.isFinite(max) && min! >= 0 && max! >= min! ? [min!, max!] : fallback;
}

/** "259200,86400" -> [259200, 86400] (largest first); anything unusable falls back. */
function parseSeconds(value: string | undefined, fallback: number[]): number[] {
  const list = (value ?? "").split(",").map((x) => Number(x.trim()));
  return list.length > 0 && list.every((n) => Number.isFinite(n) && n > 0) ? [...new Set(list)].sort((a, b) => b - a) : fallback;
}

export function readConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const port = Number(env.PORT ?? 4000);
  return {
    port,
    devTools: devToolsOn(env),
    publicUrl: env.CORE_PUBLIC_URL ?? `http://localhost:${port}`,
    explorerUrl: env.CHAIN_EXPLORER_URL || null,
    chainRpc: env.CHAIN_RPC ?? "http://127.0.0.1:8545",
    chainNetwork: env.CHAIN_NETWORK ?? "localhost",
    relayerKey: env.RELAYER_KEY ?? LOCAL_RELAYER_KEY,
    dbPath: env.DB_PATH ?? "./data/sammati.sqlite",
    requestTtlSeconds: Number(env.REQUEST_TTL_SECONDS ?? 1800),
    anchorIntervalMs: Number(env.ANCHOR_INTERVAL_MS ?? 10_000),
    cascadeDelayMs: parseRange(env.CASCADE_DELAY_MS, [1000, 3000]),
    indexerIntervalMs: Number(env.INDEXER_INTERVAL_MS ?? 1000),
    reconcileIntervalMs: Number(env.RECONCILE_INTERVAL_MS ?? 30_000),
    targetedRatePerMinute: Number(env.TARGETED_RATE_PER_MINUTE ?? 20),
    maxOpenRequestsPerUser: Number(env.MAX_OPEN_REQUESTS_PER_USER ?? 3),
    identityFreshnessSeconds: Number(env.IDENTITY_FRESHNESS_SECONDS ?? 900),
    handleChecksPerMinute: Number(env.HANDLE_CHECKS_PER_MINUTE ?? 30),
    processorUrl: env.PROCESSOR_PUBLIC_URL ?? `http://localhost:${PROCESSOR_PORT}`,
    processorEventKey: env.PROCESSOR_EVENT_KEY ?? "local-processor-events",
    regulatorKey: env.REGULATOR_KEY ?? "demo-regulator-key",
    adminKey: env.ADMIN_KEY ?? LOCAL_ADMIN_KEY,
    registrationFundingEth: env.REGISTRATION_FUNDING_ETH ?? "1",
    registrationsPerHour: Number(env.REGISTRATIONS_PER_HOUR ?? 5),
    maxPendingApplications: Number(env.MAX_PENDING_APPLICATIONS ?? 50),
    gatewayRatePerMinute: Number(env.GATEWAY_RATE_PER_MINUTE ?? 600),
    sandboxTestPrincipals: (env.SANDBOX_TEST_PRINCIPALS ?? "").split(",").map((a) => a.trim().toLowerCase()).filter(Boolean),
    expiryTickMs: Number(env.EXPIRY_TICK_MS ?? 30_000),
    expiryThresholdsSeconds: parseSeconds(env.EXPIRY_THRESHOLDS_SECONDS, [259_200, 86_400]),
    expiringWindowSeconds: Number(env.EXPIRING_WINDOW_SECONDS ?? (2_592_000)),
    expiredNotifySeconds: Number(env.EXPIRED_NOTIFY_SECONDS ?? 604_800),
  };
}
