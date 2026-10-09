// `pnpm dev:reset` (trd.md §6.4, needs DEV_TOOLS=true): the local chain, Core's database and the Processor's vault
// go back to nothing. It acts on the chain's RPC and on files; no service has a route for it.
//
//   1. remove the database files   Core's and the Processor's, if no process holds them open
//   2. reset the chain             hardhat_reset keeps the contract addresses identical to shared/deployments.json
//   3. redeploy, fund the relayer  and sync the chain clock to the wall clock
//
// A Core or Processor that is still running notices the replaced chain on its own (Core's chain fingerprint, the
// Processor's sweep) and wipes whatever described the old one. Registers nothing: no company, purpose or customer.
import { rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CHAIN_RPC, deployAndFund, rpc, syncClock } from "./chain.mjs";
import { requireDevTools } from "./dev-guard.mjs";

requireDevTools("dev:reset");

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const files = [
  ["Core's database", resolve(root, "core", process.env.DB_PATH ?? "./data/sammati.sqlite")],
  ["the Processor's vault", resolve(root, "processor", process.env.VAULT_PATH ?? "./data/processor.sqlite")],
];

for (const [what, file] of files) {
  if (file.endsWith(":memory:")) continue;
  try {
    for (const suffix of ["", "-wal", "-shm"]) rmSync(file + suffix, { force: true });
    console.log(`Removed ${what}`);
  } catch (err) {
    // Windows will not delete a file another process has open. The running service wipes itself when it sees the new chain.
    console.warn(`Could not remove ${what} (${err instanceof Error ? err.message : err}); the running service will wipe it when it sees the new chain.`);
  }
}

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
  deployAndFund();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
console.log("Contracts redeployed and the relayer funded. No company is registered: add one through /join.");
