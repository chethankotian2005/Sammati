import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { ethers, network } from "hardhat";
import type { BaseContract, ContractRunner } from "ethers";
import { EXPLORERS, deploymentLinks, type Deployment, type Deployments } from "@sammati/shared";

export const DEPLOYMENTS_FILE = resolve(__dirname, "../../shared/deployments.json");

/**
 * A plain ethers Contract whose connect() keeps the type. There is deliberately no typechain
 * step, so `pnpm typecheck` works on a fresh clone before anything is compiled.
 * `connect` comes first so its overload wins over BaseContract's; the index signature stands in for the ABI.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Handle = { connect(runner: ContractRunner | null): Handle; [method: string]: any } & BaseContract;

export interface DeployedContracts {
  chainId: number;
  admin: string;
  consentRegistry: string;
  accessAnchor: string;
  startBlock: number;
  /** Deployment transaction hashes, for the explorer links. */
  deployTxs: { consentRegistry: string; accessAnchor: string };
}

/**
 * The record that goes into shared/deployments.json. A network with a public explorer (Polygon Amoy)
 * also gets its explorer base and ready-made links to both contracts and both deploy transactions;
 * the local chain gets none, because there is nothing for a link to point at.
 */
export function buildDeployment(networkName: string, d: DeployedContracts): Deployment {
  const record: Deployment = {
    chainId: d.chainId,
    admin: d.admin,
    consentRegistry: d.consentRegistry,
    accessAnchor: d.accessAnchor,
    startBlock: d.startBlock,
  };
  const explorer = EXPLORERS[networkName];
  if (explorer) {
    record.explorerUrl = explorer;
    record.links = deploymentLinks(explorer, d, d.deployTxs);
  }
  return record;
}

export function readDeployments(): Deployments {
  return existsSync(DEPLOYMENTS_FILE) ? (JSON.parse(readFileSync(DEPLOYMENTS_FILE, "utf8")) as Deployments) : {};
}

export function writeDeployment(networkName: string, deployment: Deployment): void {
  const all = { ...readDeployments(), [networkName]: deployment };
  const sorted = Object.fromEntries(Object.entries(all).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(DEPLOYMENTS_FILE, JSON.stringify(sorted, null, 2) + "\n");
}

/** The in-process "hardhat" network is thrown away after the script, so deploying there records nothing real. */
export function requireRealNetwork(): string {
  if (network.name === "hardhat") {
    throw new Error("Run this against a node: add `--network localhost` (or use the package scripts).");
  }
  return network.name;
}

export interface Attached {
  networkName: string;
  deployment: Deployment;
  registry: Handle;
  anchor: Handle;
}

/** Attaches to the contracts recorded for the current network, checking that code really is there. */
export async function attach(): Promise<Attached> {
  const networkName = requireRealNetwork();
  const deployment = readDeployments()[networkName];
  if (!deployment) throw new Error(`No "${networkName}" entry in shared/deployments.json: run the deploy script first.`);
  for (const address of [deployment.consentRegistry, deployment.accessAnchor]) {
    if ((await ethers.provider.getCode(address)) === "0x") {
      throw new Error(`No contract at ${address} on ${networkName}. The chain was reset: run the deploy script again.`);
    }
  }
  return {
    networkName,
    deployment,
    registry: (await ethers.getContractAt("ConsentRegistry", deployment.consentRegistry)) as unknown as Handle,
    anchor: (await ethers.getContractAt("AccessAnchor", deployment.accessAnchor)) as unknown as Handle,
  };
}
