import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DEMO_PRINCIPAL, DEMO_PRINCIPAL_KEY, DEMO_RELAYER_KEY, EXPLORERS, PROCESSOR_PORT, SEED_FIDUCIARIES, type Deployment } from "@sammati/shared";

export interface Config {
  port: number;
  stubMode: boolean;
  demoMode: boolean;
  /** Base URL the wallet reaches Core on; goes into the QR code (use the LAN IP on stage). */
  publicUrl: string;
  /** Explorer base URL for proof links, overriding the deployment's. Null: use the deployment's (Polygon Amoy has one, the local chain none). */
  explorerUrl: string | null;
  // --- real mode only ---
  chainRpc: string;
  /** Key into shared/deployments.json. */
  chainNetwork: string;
  /** Overrides the deployments.json entry (tests). */
  deployment?: Deployment;
  relayerKey: string;
  dbPath: string;
  /** Consent requests (QR codes) stop working after this long. */
  requestTtlSeconds: number;
  /** Host the demo company backends run on (their ports are in shared/seed.ts). */
  companyHost: string;
  /** Per-company base URL overrides, keyed by lower-case fiduciary address (tests, remote companies). */
  companyUrls: Record<string, string>;
  /** How often pending log entries are anchored. 0 turns the timer off (the 20-entry trigger and runOnce still work). */
  anchorIntervalMs: number;
  /** Private keys Core holds for companies, by lower-case address: demo shortcut, disclosed in trd.md §12. */
  fiduciaryKeys: Record<string, string>;
  /** How long a processor stub waits before acknowledging, [min, max] ms (trd.md §9: 1 to 3 s). */
  cascadeDelayMs: [number, number];
  /** Private keys Core holds for the demo processors, by lower-case address: disclosed in demo.md. */
  processorKeys: Record<string, string>;
  indexerIntervalMs: number;
  reconcileIntervalMs: number;
  /** Targeted requests (trd.md §6.11): how many one company may send per minute, before any handle is looked at. */
  targetedRatePerMinute: number;
  /** How many open requests one company may have with one customer; the rest are dropped silently. */
  maxOpenRequestsPerUser: number;
  /** How far a signed identity or action message's `issuedAt` may be from Core's clock, in seconds (trd.md §4.5). */
  identityFreshnessSeconds: number;
  /** Customers whose key Core holds (lower-case address -> key), so the presenter can withdraw for them (trd.md §6.4). Never a real wallet's. */
  demoPrincipalKeys: Record<string, string>;
  /** Where the wallet finds the Sammati Processor (trd.md §6.1). Core only points at it. */
  processorUrl: string;
  /** Shared secret the Processor sends with the events it reports: a disclosed demo secret (trd.md §10). */
  processorEventKey: string;
}

/** Loads the repo-root .env if there is one; real environment variables win. */
export function loadDotEnv(): void {
  try {
    process.loadEnvFile(resolve(fileURLToPath(import.meta.url), "../../../.env"));
  } catch {
    // no .env: defaults below are enough for stub mode
  }
}

/** Stub mode has no chain, so its proof links are fixtures: pointed at Amoy's explorer unless told otherwise. */
export function stubExplorerUrl(config: Pick<Config, "explorerUrl">): string {
  return config.explorerUrl ?? EXPLORERS.amoy!;
}

/** "1000,3000" -> [1000, 3000]; anything unusable falls back. */
function parseRange(value: string | undefined, fallback: [number, number]): [number, number] {
  const [min, max] = (value ?? "").split(",").map(Number);
  return Number.isFinite(min) && Number.isFinite(max) && min! >= 0 && max! >= min! ? [min!, max!] : fallback;
}

/** `{ "0xaddress": "0xkey" }` -> keys by lower-case address; null when unset or unusable (the default applies). */
function parseKeys(value: string | undefined): Record<string, string> | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Record<string, string>;
    return Object.fromEntries(Object.entries(parsed).map(([a, k]) => [a.toLowerCase(), k]));
  } catch {
    return null;
  }
}

export function readConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const port = Number(env.PORT ?? 4000);
  return {
    port,
    stubMode: env.STUB_MODE !== "false",
    demoMode: env.DEMO_MODE !== "false",
    publicUrl: env.CORE_PUBLIC_URL ?? `http://localhost:${port}`,
    explorerUrl: env.CHAIN_EXPLORER_URL || null,
    chainRpc: env.CHAIN_RPC ?? "http://127.0.0.1:8545",
    chainNetwork: env.CHAIN_NETWORK ?? "localhost",
    relayerKey: env.RELAYER_KEY ?? DEMO_RELAYER_KEY,
    dbPath: env.DB_PATH ?? "./data/sammati.sqlite",
    requestTtlSeconds: Number(env.REQUEST_TTL_SECONDS ?? 1800),
    companyHost: env.COMPANY_HOST ?? "localhost",
    companyUrls: {},
    anchorIntervalMs: Number(env.ANCHOR_INTERVAL_MS ?? 10_000),
    fiduciaryKeys: Object.fromEntries(SEED_FIDUCIARIES.map((f) => [f.address.toLowerCase(), f.demoKey])),
    cascadeDelayMs: parseRange(env.CASCADE_DELAY_MS, [1000, 3000]),
    processorKeys: Object.fromEntries(SEED_FIDUCIARIES.flatMap((f) => f.processors.map((p) => [p.address.toLowerCase(), p.demoKey]))),
    indexerIntervalMs: Number(env.INDEXER_INTERVAL_MS ?? 1000),
    reconcileIntervalMs: Number(env.RECONCILE_INTERVAL_MS ?? 30_000),
    targetedRatePerMinute: Number(env.TARGETED_RATE_PER_MINUTE ?? 20),
    maxOpenRequestsPerUser: Number(env.MAX_OPEN_REQUESTS_PER_USER ?? 3),
    identityFreshnessSeconds: Number(env.IDENTITY_FRESHNESS_SECONDS ?? 900),
    demoPrincipalKeys: parseKeys(env.DEMO_PRINCIPAL_KEYS) ?? { [DEMO_PRINCIPAL.toLowerCase()]: DEMO_PRINCIPAL_KEY },
    processorUrl: env.PROCESSOR_PUBLIC_URL ?? `http://localhost:${PROCESSOR_PORT}`,
    processorEventKey: env.PROCESSOR_EVENT_KEY ?? "demo-processor-events",
  };
}
