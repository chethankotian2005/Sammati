// Shared by bootstrap.mjs, demo-reset.mjs and demo-up.mjs: talk to the local Hardhat node and to Core,
// and run package scripts.
import { spawnSync } from "node:child_process";

export const CHAIN_RPC = process.env.CHAIN_RPC ?? "http://127.0.0.1:8545";
export const CORE_URL = process.env.CORE_URL ?? "http://localhost:4000";

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

/** Deploy both contracts, then register the seed data and fund the relayer. */
export function deployAndSeed() {
  runContracts("deploy:local");
  runContracts("seed:local");
}

/**
 * Wipes Core's database and re-reads the chain (POST /v1/demo/reset). Returns null on success, else a
 * short reason, because callers differ on whether Core being off is a problem.
 */
export async function resetCore(core = CORE_URL) {
  try {
    const res = await fetch(`${core}/v1/demo/reset`, { method: "POST", signal: AbortSignal.timeout(30_000) });
    return res.ok ? null : `Core answered ${res.status}: ${await res.text()}`;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}
