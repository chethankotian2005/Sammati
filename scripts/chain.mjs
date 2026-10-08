// Shared by bootstrap.mjs and demo-reset.mjs: talk to the local Hardhat node and run package scripts.
import { spawnSync } from "node:child_process";

export const CHAIN_RPC = process.env.CHAIN_RPC ?? "http://127.0.0.1:8545";

export async function rpc(method, params = []) {
  const res = await fetch(CHAIN_RPC, {
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
