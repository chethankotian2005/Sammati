import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export interface Config {
  port: number;
  stubMode: boolean;
  demoMode: boolean;
  /** Base URL the wallet reaches Core on; goes into the QR code (use the LAN IP on stage). */
  publicUrl: string;
  explorerUrl: string;
}

/** Loads the repo-root .env if there is one; real environment variables win. */
export function loadDotEnv(): void {
  try {
    process.loadEnvFile(resolve(fileURLToPath(import.meta.url), "../../../.env"));
  } catch {
    // no .env: defaults below are enough for stub mode
  }
}

export function readConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const port = Number(env.PORT ?? 4000);
  return {
    port,
    stubMode: env.STUB_MODE !== "false",
    demoMode: env.DEMO_MODE !== "false",
    publicUrl: env.CORE_PUBLIC_URL ?? `http://localhost:${port}`,
    explorerUrl: env.CHAIN_EXPLORER_URL ?? "https://amoy.polygonscan.com",
  };
}
