// Returns the demo to its seed state (trd.md §10). The order matters:
//
//   1. reset Core's database    Core keeps anchoring while the chain is rebuilt. If its old log rows were
//   2. reset the chain          still there when the new chain appeared, the next anchor tick would put
//   3. deploy, 4. seed          the previous run's rows on it, and every later Verify would be red.
//   5. reset Core again         re-reads the new chain (and records which chain it now describes).
//
// Resetting the chain (rather than deploying on top of it) keeps the contract addresses identical to the
// ones in shared/deployments.json. Needs the chain from `pnpm demo:up`; a stopped Core is not an error.
import { CHAIN_RPC, CORE_URL, PROCESSOR_URL, deployAndSeed, resetCore, resetProcessor, rpc, syncClock } from "./chain.mjs";

const before = await resetCore();
console.log(before === null ? `Core reset at ${CORE_URL} (before the chain)` : `Core not reachable (${before}): its database is rebuilt when it starts`);

const vault = await resetProcessor();
console.log(vault === null ? `Processor vault emptied at ${PROCESSOR_URL}` : `Processor not reachable (${vault}): its vault starts empty or is swept`);

try {
  await rpc("hardhat_reset");
} catch (err) {
  console.error(`Could not reset the chain at ${CHAIN_RPC}: ${err instanceof Error ? err.message : err}`);
  console.error("Is `pnpm demo:up` running?");
  process.exit(1);
}
console.log(`Chain reset at ${CHAIN_RPC}`);
console.log(`Chain clock synced to the wall clock (off by ${(await syncClock()).toFixed(1)} s)`);

try {
  deployAndSeed();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}

if (before === null) {
  // Core was running, so it must follow the new chain now; a failure here would leave it describing the old one.
  const after = await resetCore();
  if (after !== null) {
    console.error(`The chain is reset but Core could not follow it: ${after}`);
    process.exit(1);
  }
  console.log(`Core reset at ${CORE_URL} (after the chain)`);
}
