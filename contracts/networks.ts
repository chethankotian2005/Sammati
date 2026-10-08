// Public-network configuration, read from the environment so no key or private RPC URL is in the repo.
import type { HttpNetworkUserConfig } from "hardhat/types";

export const AMOY_CHAIN_ID = 80002;
/** Polygon's own public endpoint: rate-limited but enough for a deployment. Set AMOY_RPC_URL to use your own. */
export const DEFAULT_AMOY_RPC = "https://rpc-amoy.polygon.technology";

/** Environment variables read here: AMOY_RPC_URL and DEPLOYER_KEY. */
export type NetworkEnv = Readonly<Record<string, string | undefined>>;

const PRIVATE_KEY = /^(0x)?[0-9a-fA-F]{64}$/;

/** A usable private key (0x added if missing), or null. Never throws: every Hardhat command loads this config. */
export function deployerKey(env: NetworkEnv): string | null {
  const key = env.DEPLOYER_KEY?.trim();
  return key && PRIVATE_KEY.test(key) ? (key.startsWith("0x") ? key : `0x${key}`) : null;
}

/**
 * Polygon Amoy (chain 80002). Without a valid DEPLOYER_KEY the network still exists but has no
 * accounts, so `hardhat run --network amoy` stops with a clear message instead of a config error
 * that would break `compile` and `test` too.
 */
export function amoyNetwork(env: NetworkEnv): HttpNetworkUserConfig {
  const key = deployerKey(env);
  return {
    url: env.AMOY_RPC_URL?.trim() || DEFAULT_AMOY_RPC,
    chainId: AMOY_CHAIN_ID,
    accounts: key ? [key] : [],
  };
}
