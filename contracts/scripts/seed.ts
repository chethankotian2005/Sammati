// The minimum a fresh local chain needs: the relayer funded so it can pay gas. It registers no company, purpose,
// processor or customer: companies arrive through registration and the regulator's approval (X-01, R-01 to R-03).
// Idempotent: safe to run twice. Needs the deploy script to have run on this network.
//   pnpm seed
import { ethers } from "hardhat";
import { Wallet, parseEther } from "ethers";
import { EXPLORERS, LOCAL_RELAYER_KEY } from "@sammati/shared";
import { attach } from "./lib";

const RELAYER_MIN = parseEther("10");
const RELAYER_TARGET = parseEther("100");

async function main() {
  const { networkName, deployment } = await attach();
  if (networkName in EXPLORERS) {
    // The admin and relayer defaults are Hardhat's public test keys: fine on a local chain, an open invitation anywhere public.
    throw new Error(`pnpm seed funds the relayer from the local chain's admin, so it only runs on the local chain, not on ${networkName}.`);
  }
  const admin = await ethers.getSigner(deployment.admin);
  const relayer = new Wallet(process.env.RELAYER_KEY ?? LOCAL_RELAYER_KEY).address;
  const balance = await ethers.provider.getBalance(relayer);
  if (balance >= RELAYER_MIN) {
    console.log(`Relayer ${relayer} already has ${ethers.formatEther(balance)} ETH`);
    return;
  }
  await (await admin.sendTransaction({ to: relayer, value: RELAYER_TARGET - balance })).wait();
  console.log(`Funded relayer ${relayer} to ${ethers.formatEther(RELAYER_TARGET)} ETH`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
