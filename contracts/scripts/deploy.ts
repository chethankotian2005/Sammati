// Deploys ConsentRegistry and AccessAnchor and records the addresses in shared/deployments.json.
//   pnpm deploy:local           (hardhat node on :8545)
//   pnpm deploy:amoy            (Polygon Amoy, the public proof deployment: needs DEPLOYER_KEY, see README)
import { ethers, network } from "hardhat";
import { EXPLORERS } from "@sammati/shared";
import { buildDeployment, requireRealNetwork, writeDeployment } from "./lib";

const NO_DEPLOYER =
  "No deployer account for this network. Put a funded account's private key in DEPLOYER_KEY " +
  "(0x followed by 64 hex characters) in .env or the environment. For Polygon Amoy, get test MATIC from a faucet first.";

/** Turns a network failure into something that says what to check, naming the endpoint. */
async function reachable<T>(networkName: string, what: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    const url = "url" in network.config ? network.config.url : "its RPC endpoint";
    throw new Error(`Could not ${what} on ${networkName} (${url}): ${err instanceof Error ? err.message : String(err)}. Check your connection, or set AMOY_RPC_URL to another endpoint.`);
  }
}

async function main() {
  const networkName = requireRealNetwork();
  // Settle the account question from config alone, before any RPC call: a missing key should say so, not fail on the network.
  if (Array.isArray(network.config.accounts) && network.config.accounts.length === 0) throw new Error(NO_DEPLOYER);

  const [admin] = await reachable(networkName, "list accounts", () => ethers.getSigners());
  if (!admin) throw new Error(NO_DEPLOYER);
  const chainId = Number((await reachable(networkName, "read the chain id", () => ethers.provider.getNetwork())).chainId);
  const publicNetwork = networkName in EXPLORERS;
  if (publicNetwork) {
    const balance = await reachable(networkName, "read the deployer's balance", () => ethers.provider.getBalance(admin.address));
    if (balance === 0n) {
      throw new Error(`Deployer ${admin.address} has no balance on ${networkName}. Fund it with test MATIC from a faucet, then run this again.`);
    }
    console.log(`Deploying to ${networkName} (chain ${chainId}) from ${admin.address} with ${ethers.formatEther(balance)} MATIC`);
  }

  const registry = await (await ethers.getContractFactory("ConsentRegistry", admin)).deploy(admin.address);
  const registryReceipt = await registry.deploymentTransaction()!.wait();
  const anchor = await (await ethers.getContractFactory("AccessAnchor", admin)).deploy(await registry.getAddress());
  const anchorReceipt = await anchor.deploymentTransaction()!.wait();

  const deployment = buildDeployment(networkName, {
    chainId,
    admin: admin.address,
    consentRegistry: await registry.getAddress(),
    accessAnchor: await anchor.getAddress(),
    startBlock: registryReceipt?.blockNumber ?? 0,
    deployTxs: { consentRegistry: registryReceipt!.hash, accessAnchor: anchorReceipt!.hash },
  });
  writeDeployment(networkName, deployment);

  console.log(`Deployed on ${networkName} (chain ${chainId}) by ${admin.address}`);
  console.log(`  ConsentRegistry ${deployment.consentRegistry}`);
  console.log(`  AccessAnchor    ${deployment.accessAnchor}`);
  if (deployment.links) {
    console.log("  Explorer:");
    console.log(`    ${deployment.links.consentRegistry}`);
    console.log(`    ${deployment.links.accessAnchor}`);
    console.log("  Recorded in shared/deployments.json: commit it so the links travel with the repo.");
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
