// Registers the demo fiduciaries, purposes and processors (shared/seed.ts, drd.md §5) and tops up
// the relayer. Idempotent: safe to run twice. Needs the deploy script to have run on this network.
//   pnpm seed
import { ethers } from "hardhat";
import { Wallet, parseEther, type Contract } from "ethers";
import { DEMO_RELAYER_KEY, EXPLORERS, seedRegistry } from "@sammati/shared";
import { attach } from "./lib";

const RELAYER_MIN = parseEther("10");
const RELAYER_TARGET = parseEther("100");

async function fundRelayer(admin: Awaited<ReturnType<typeof ethers.getSigner>>) {
  const relayer = new Wallet(process.env.RELAYER_KEY ?? DEMO_RELAYER_KEY).address;
  const balance = await ethers.provider.getBalance(relayer);
  if (balance >= RELAYER_MIN) {
    console.log(`Relayer ${relayer} already has ${ethers.formatEther(balance)} ETH`);
    return;
  }
  await (await admin.sendTransaction({ to: relayer, value: RELAYER_TARGET - balance })).wait();
  console.log(`Funded relayer ${relayer} to ${ethers.formatEther(RELAYER_TARGET)} ETH`);
}

async function main() {
  const { networkName, deployment, registry } = await attach();
  if (networkName in EXPLORERS) {
    // The demo companies' keys are Hardhat's public test keys: fine on a local chain, an open invitation anywhere public.
    throw new Error(`pnpm seed registers the demo companies with Hardhat's publicly known keys, so it only runs on the local chain, not on ${networkName}.`);
  }
  const admin = await ethers.getSigner(deployment.admin);
  console.log(`Seeding ${networkName} (ConsentRegistry ${deployment.consentRegistry})`);

  const registered = await seedRegistry(registry as unknown as Contract, {
    admin,
    signerFor: (address) => ethers.getSigner(address),
    onStep: (message) => console.log(`  ${message}`),
  });

  await fundRelayer(admin);
  console.log(registered ? `Registered ${registered} new entries.` : "Already seeded, nothing to do.");
  console.log(`ledgerHead ${await registry.ledgerHead()}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
