// Shared by bootstrap.mjs, dev-reset.mjs and demo-up.mjs: talk to the local Hardhat node,
// and run package scripts.
import { spawnSync } from "node:child_process";

export const CHAIN_RPC = process.env.CHAIN_RPC ?? "http://127.0.0.1:8545";
export const CORE_URL = process.env.CORE_URL ?? "http://localhost:4000";
export const PROCESSOR_URL = process.env.PROCESSOR_URL ?? "http://localhost:4200";

export async function rpc(method, params = [], url = CHAIN_RPC) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const body = await res.json();
  if (body.error) throw new Error(`${method}: ${body.error.message}`);
  return body.result;
}

export async function waitForChain(timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      return await rpc("eth_chainId");
    } catch (err) {
      if (Date.now() > deadline) throw new Error(`No chain at ${CHAIN_RPC} after ${timeoutMs / 1000}s (${err.message})`);
      await new Promise((r) => setTimeout(r, 500));
    }
  }
}

/**
 * Puts the chain's clock back on the wall clock. After `hardhat_reset` (and on a node that has been up a
 * while) block timestamps run behind real time by the node's age, and a burst of blocks pushes them ahead.
 * The Auditor compares ledger time with the gateway's wall-clock log entries, and a redeploy after a reset
 * must not land in the same second as the first deploy, so the chain has to track real time.
 *
 * Returns the clock error in seconds (chain minus wall) after syncing; throws if the node refuses.
 * A chain that is already ahead of the wall clock cannot be moved backwards: that is reported, not hidden.
 */
export async function syncClock(url = CHAIN_RPC) {
  try {
    await rpc("evm_setNextBlockTimestamp", [Math.floor(Date.now() / 1000)], url);
  } catch (err) {
    if (!/lower than|previous block/i.test(String(err))) throw err; // the chain is ahead of us: mine and measure below
  }
  await rpc("evm_mine", [], url);
  return await clockSkew(url);
}

/** Latest block's timestamp minus the wall clock, in seconds (negative: the chain is behind). */
export async function clockSkew(url = CHAIN_RPC) {
  const block = await rpc("eth_getBlockByNumber", ["latest", false], url);
  return Number.parseInt(block.timestamp, 16) - Date.now() / 1000;
}

/** Runs a contracts-package script (e.g. "deploy:local") and throws if it fails. */
export function runContracts(script) {
  // One command string: pnpm is a .cmd shim on Windows, which needs a shell (and passing args with a shell is deprecated).
  const r = spawnSync(`pnpm --filter @sammati/contracts run ${script}`, { stdio: "inherit", shell: true });
  if (r.status !== 0) throw new Error(`contracts ${script} failed`);
}

/** Deploy both contracts, then fund the relayer. Registers no company (X-01). */
export function deployAndFund() {
  runContracts("deploy:local");
  runContracts("seed:local");
}
