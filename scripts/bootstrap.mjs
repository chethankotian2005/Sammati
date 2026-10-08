// Part of `pnpm demo:up`: once the Hardhat node answers, deploy and seed it, then exit.
import { CHAIN_RPC, deployAndSeed, syncClock, waitForChain } from "./chain.mjs";

try {
  await waitForChain();
  console.log(`Chain is up at ${CHAIN_RPC}`);
  console.log(`Chain clock synced to the wall clock (off by ${(await syncClock()).toFixed(1)} s)`);
  deployAndSeed();
  console.log("Chain deployed and seeded.");
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
