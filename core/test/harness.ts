// Starts a throwaway Hardhat node, deploys the contracts onto it and registers the throwaway test companies, so Core's
// real mode can be tested against an actual chain. Needs `pnpm --filter @sammati/contracts compile`
// to have run (the core test script does it).
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:net";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ContractFactory, JsonRpcProvider, Network, Wallet, parseEther, type Contract } from "ethers";
import { LOCAL_RELAYER_KEY, descHash, purposeIdOf, type Deployment } from "@sammati/shared";
import { TEST_COMPANIES, registerTestCompanies, testApiKey } from "@sammati/test-fixtures";
import { syncClock } from "../../scripts/chain.mjs";
import { readConfig, type Config } from "../src/config";
import { hashApiKey } from "../src/real/apikeys";
import { createRealCore, type RealCore } from "../src/real/core";
import type { Db } from "../src/real/db";

const here = dirname(fileURLToPath(import.meta.url));
const contractsDir = resolve(here, "../../contracts");
const CHAIN_ID = 31337;

export interface TestChain {
  rpc: string;
  provider: JsonRpcProvider;
  deployment: Deployment;
  /** Wipes the node and redeploys, like `pnpm dev:reset`, then registers the test companies again. */
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

async function deployAndRegister(provider: JsonRpcProvider): Promise<Deployment> {
  const admin = await provider.getSigner(0);
  const registryArtifact = artifact("ConsentRegistry");
  const registry = await new ContractFactory(registryArtifact.abi as never, registryArtifact.bytecode, admin).deploy(await admin.getAddress());
  const deployTx = await registry.deploymentTransaction()!.wait();
  const anchorArtifact = artifact("AccessAnchor");
  const anchor = await new ContractFactory(anchorArtifact.abi as never, anchorArtifact.bytecode, admin).deploy(await registry.getAddress());
  await anchor.waitForDeployment();

  await registerTestCompanies(registry as Contract, { admin, signerFor: (address) => provider.getSigner(address) });
  await (await admin.sendTransaction({ to: new Wallet(LOCAL_RELAYER_KEY).address, value: parseEther("100") })).wait();

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

  await syncClock(rpc); // node start, like demo:up's bootstrap
  const network = Network.from(CHAIN_ID);
  const provider = new JsonRpcProvider(rpc, network, { staticNetwork: network, pollingInterval: 100 });
  const chain: TestChain = {
    rpc,
    provider,
    deployment: await deployAndRegister(provider),
    async reset() {
      await provider.send("hardhat_reset", []);
      await syncClock(rpc); // as dev:reset does: otherwise the new chain's clock restarts at the old genesis time
      chain.deployment = await deployAndRegister(provider);
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
    ...readConfig({}),
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

/**
 * Puts the throwaway test companies into a Core database: what registration and approval do in the app (R-01, R-02),
 * written straight into the tables so a test starts with companies without running the flow. The same companies are
 * registered on chain by `startTestChain`. Idempotent. Nothing in the app calls this.
 */
export function loadTestDirectory(db: Db): void {
  const insertCompany = db.prepare("INSERT OR IGNORE INTO fiduciaries (address, name, sector, color, slug, sandbox) VALUES (?, ?, ?, ?, ?, 0)");
  const insertCredential = db.prepare("INSERT OR IGNORE INTO fiduciary_credentials (fiduciary, api_key_hash, issued_at) VALUES (?, ?, 1)");
  const insertKey = db.prepare("INSERT OR IGNORE INTO fiduciary_keys (address, private_key, created_at) VALUES (?, ?, 1)");
  const insertProcessorKey = db.prepare("INSERT OR IGNORE INTO processor_keys (address, private_key, created_at) VALUES (?, ?, 1)");
  const insertPurpose = db.prepare(
    `INSERT OR IGNORE INTO purposes (id, fiduciary, code, title_en, title_hi, title_kn, desc_en, desc_hi, desc_kn,
       data_categories, retention_days, shares_third_party, desc_hash, required)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertProcessor = db.prepare("INSERT OR IGNORE INTO processors (address, name, purpose_id) VALUES (?, ?, ?)");
  db.transaction(() => {
    for (const f of TEST_COMPANIES) {
      insertCompany.run(f.address, f.name, f.sector, f.color, f.slug);
      insertCredential.run(f.address, hashApiKey(testApiKey(f.slug)));
      insertKey.run(f.address, f.demoKey);
      for (const p of f.purposes) {
        insertPurpose.run(
          purposeIdOf(f.address, p.code), f.address, p.code,
          p.title.en, p.title.hi, p.title.kn, p.description.en, p.description.hi, p.description.kn,
          JSON.stringify(p.dataCategories), p.retentionDays, p.sharesThirdParty ? 1 : 0, descHash(p.description), p.required ? 1 : 0,
        );
      }
      for (const proc of f.processors) {
        insertProcessorKey.run(proc.address, proc.demoKey);
        insertProcessor.run(proc.address, proc.name, purposeIdOf(f.address, proc.purposeCode));
      }
    }
  })();
}

/** `createRealCore` plus the test companies, kept across a reset or a replaced chain. */
export async function createTestCore(config: Config, publish: (e: never) => void = () => {}, log: (m: string) => void = () => {}): Promise<RealCore> {
  const core = await createRealCore(config, publish as never, log);
  loadTestDirectory(core.db);
  const reset = core.reset.bind(core);
  core.reset = async () => {
    await reset();
    loadTestDirectory(core.db);
  };
  const replaced = core.indexer.onChainReplaced;
  core.indexer.onChainReplaced = async () => {
    await replaced?.();
    loadTestDirectory(core.db);
  };
  return core;
}
