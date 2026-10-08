// Shape of shared/deployments.json (trd.md §10), keyed by network name.
export interface Deployment {
  chainId: number;
  admin: string;
  consentRegistry: string;
  accessAnchor: string;
  /** Block the registry was deployed in: where an indexer starts reading. */
  startBlock?: number;
  /** Base URL of the network's public block explorer. Only public networks have one (Polygon Amoy). */
  explorerUrl?: string;
  /** Ready-made explorer pages for this deployment, present when `explorerUrl` is. */
  links?: DeploymentLinks;
}

export interface DeploymentLinks {
  consentRegistry: string;
  accessAnchor: string;
  consentRegistryDeployTx: string;
  accessAnchorDeployTx: string;
}

export type Deployments = Record<string, Deployment>;

/** Public explorers by network name. The local chain has none, and must not pretend to. */
export const EXPLORERS: Readonly<Record<string, string>> = {
  amoy: "https://amoy.polygonscan.com",
};

const trimSlash = (base: string): string => base.replace(/\/+$/, "");

/** Explorer page for a transaction, or null when the network has no explorer. */
export function explorerTxUrl(base: string | null | undefined, txHash: string): string | null {
  return base ? `${trimSlash(base)}/tx/${txHash}` : null;
}

/** Explorer page for an address (a contract), or null when the network has no explorer. */
export function explorerAddressUrl(base: string | null | undefined, address: string): string | null {
  return base ? `${trimSlash(base)}/address/${address}` : null;
}

/** Everything a deployment record needs beyond the addresses, for a network that has an explorer. */
export function deploymentLinks(
  base: string,
  d: Pick<Deployment, "consentRegistry" | "accessAnchor">,
  deployTxs: { consentRegistry: string; accessAnchor: string },
): DeploymentLinks {
  return {
    consentRegistry: explorerAddressUrl(base, d.consentRegistry)!,
    accessAnchor: explorerAddressUrl(base, d.accessAnchor)!,
    consentRegistryDeployTx: explorerTxUrl(base, deployTxs.consentRegistry)!,
    accessAnchorDeployTx: explorerTxUrl(base, deployTxs.accessAnchor)!,
  };
}
