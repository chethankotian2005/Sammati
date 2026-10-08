// Starts a throwaway Hardhat node, deploys the contracts onto it and seeds the demo data, so Core's
// real mode can be tested against an actual chain. Needs `pnpm --filter @sammati/contracts compile`
// to have run (the core test script does it).
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:net";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ContractFactory, JsonRpcProvider, Network, Wallet, parseEther, type Contract } from "ethers";
import { DEMO_RELAYER_KEY, seedRegistry, type Deployment } from "@sammati/shared";
import { readConfig, type Config } from "../src/config";

const here = dirname(fileURLToPath(import.meta.url));
const contractsDir = resolve(here, "../../contracts");
const CHAIN_ID = 31337;

export interface TestChain {
  rpc: string;
  provider: JsonRpcProvider;
  deployment: Deployment;
  /** Wipes the node and redeploys + reseeds, like `pnpm demo:reset`. */
  reset(): Promise<void>;
  stop(): Promise<void>;
}

function freePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const s = createServer();
    s.once("error", reject);
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address() as { port: number };
      s.close(() => resolvePort(port));
    });
  });
}

function artifact(name: string): { abi: unknown[]; bytecode: string } {
  const file = resolve(contractsDir, `artifacts/src/${name}.sol/${name}.json`);
  if (!existsSync(file)) throw new Error(`${file} is missing: run \`pnpm --filter @sammati/contracts compile\` first`);
  return JSON.parse(readFileSync(file, "utf8")) as { abi: unknown[]; bytecode: string };
}

async function waitForRpc(rpc: string, child: ChildProcess): Promise<void> {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error("hardhat node exited before it was ready");
    try {
      const res = await fetch(rpc, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
      });
      if (res.ok) return;
    } catch {
      // not listening yet
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("hardhat node did not start in 60s");
}

async function deployAndSeed(provider: JsonRpcProvider): Promise<Deployment> {
  const admin = await provider.getSigner(0);
  const registryArtifact = artifact("ConsentRegistry");
  const registry = await new ContractFactory(registryArtifact.abi as never, registryArtifact.bytecode, admin).deploy(await admin.getAddress());
  const deployTx = await registry.deploymentTransaction()!.wait();
  const anchorArtifact = artifact("AccessAnchor");
  const anchor = await new ContractFactory(anchorArtifact.abi as never, anchorArtifact.bytecode, admin).deploy(await registry.getAddress());
  await anchor.waitForDeployment();

  await seedRegistry(registry as Contract, { admin, signerFor: (address) => provider.getSigner(address) });
  await (await admin.sendTransaction({ to: new Wallet(DEMO_RELAYER_KEY).address, value: parseEther("100") })).wait();

  return {
    chainId: CHAIN_ID,
    admin: await admin.getAddress(),
    consentRegistry: await registry.getAddress(),
    accessAnchor: await anchor.getAddress(),
    startBlock: deployTx?.blockNumber ?? 0,
  };
}

export async function startTestChain(): Promise<TestChain> {
  const port = await freePort();
  const rpc = `http://127.0.0.1:${port}`;
  const cli = createRequire(import.meta.url).resolve("hardhat/internal/cli/cli.js");
  // Run node directly (not through pnpm) so stopping the child really stops the chain.
  const child = spawn(process.execPath, [cli, "node", "--port", String(port)], { cwd: contractsDir, stdio: "ignore" });
  await waitForRpc(rpc, child);

  const network = Network.from(CHAIN_ID);
  const provider = new JsonRpcProvider(rpc, network, { staticNetwork: network, pollingInterval: 100 });
  const chain: TestChain = {
    rpc,
    provider,
    deployment: await deployAndSeed(provider),
    async reset() {
      await provider.send("hardhat_reset", []);
      chain.deployment = await deployAndSeed(provider);
    },
    async stop() {
      provider.destroy();
      if (child.exitCode !== null || child.signalCode !== null) return; // already stopped
      child.kill();
      await new Promise((r) => child.once("exit", r));
    },
  };
  return chain;
}

/** A real-mode config pointing at the test chain, with an in-memory database unless `dbPath` is given. */
export function realConfig(chain: TestChain, overrides: Partial<Config> = {}): Config {
  return {
    ...readConfig({ STUB_MODE: "false" }),
    dbPath: ":memory:",
    chainRpc: chain.rpc,
    deployment: chain.deployment,
    indexerIntervalMs: 200,
    reconcileIntervalMs: 60_000,
    cascadeDelayMs: [20, 60], // the real 1 to 3 s would only slow the tests down
    anchorIntervalMs: 0,
    ...overrides,
  };
}
