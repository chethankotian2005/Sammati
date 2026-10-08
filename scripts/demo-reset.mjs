// Returns the demo to its seed state (trd.md §10): wipe the chain, redeploy, reseed, then reset
// Core's database. Needs the chain from `pnpm demo:up`. Resetting the chain (rather than deploying
// again on top) keeps the contract addresses identical to the ones in shared/deployments.json.
import { CHAIN_RPC, deployAndSeed, rpc } from "./chain.mjs";

const core = process.env.CORE_URL ?? "http://localhost:4000";

try {
  await rpc("hardhat_reset");
} catch (err) {
  console.error(`Could not reset the chain at ${CHAIN_RPC}: ${err instanceof Error ? err.message : err}`);
  console.error("Is `pnpm demo:up` running?");
  process.exit(1);
}
console.log(`Chain reset at ${CHAIN_RPC}`);

try {
  deployAndSeed();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}

try {
  const res = await fetch(`${core}/v1/demo/reset`, { method: "POST" });
  if (!res.ok) throw new Error(`Core answered ${res.status}: ${await res.text()}`);
  console.log(`Core reset at ${core}`);
} catch (err) {
  // The chain is already clean; a stopped Core just has nothing to reset.
  console.warn(`Core not reset (${err instanceof Error ? err.message : err}). Start it with \`pnpm demo:up\` and re-run if needed.`);
}
