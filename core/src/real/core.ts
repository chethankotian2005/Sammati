import { formatEther, parseEther } from "ethers";
import type { WsEvent } from "@sammati/shared";
import type { Config } from "../config";
import { AnchorJob } from "./anchor";
import { CascadeEngine } from "./cascade";
import { waitForChain, Relayer, type Chain } from "./chain";
import { clearAll, openDb, type Db } from "./db";
import { FINGERPRINT_KEY, chainFingerprint, storedFingerprint } from "./fingerprint";
import { Indexer } from "./indexer";
import { reconcile, type ReconcileResult } from "./reconcile";
import { Repo } from "./repo";

const LOW_RELAYER_BALANCE = parseEther("0.1");
const SEED_WAIT_MS = 60_000;

/** Polls until the relayer can pay gas. Returns the last balance seen, funded or not, after the timeout. */
async function waitForRelayerFunds(chain: Chain, relayer: string, timeoutMs: number, log: (m: string) => void): Promise<bigint> {
  const deadline = Date.now() + timeoutMs;
  let announced = false;
  for (;;) {
    const balance = await chain.provider.getBalance(relayer);
    if (balance >= LOW_RELAYER_BALANCE || Date.now() > deadline) return balance;
    if (!announced) {
      log("Waiting for the seed to fund the relayer (is `pnpm seed` running?)");
      announced = true;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
}

/** Everything real mode needs, wired once and shared by the routes. */
export interface RealCore {
  config: Config;
  db: Db;
  repo: Repo;
  chain: Chain;
  /** Where proof links point; null on a chain with no public explorer. */
  explorerUrl: string | null;
  relayer: Relayer;
  indexer: Indexer;
  /** Anchors each company's access log on chain (trd.md §8). */
  anchors: AnchorJob;
  /** Tells processors about withdrawals and records their acknowledgements (trd.md §9). */
  cascade: CascadeEngine;
  publish: (event: WsEvent) => void;
  /** Wipes Core's database back to the seed and re-reads the chain (the chain itself is untouched). */
  reset(): Promise<void>;
  reconcile(): Promise<ReconcileResult>;
  /** Starts the background jobs: indexer polling and the reconcile loop. */
  start(): void;
  stop(): void;
}

export async function createRealCore(config: Config, publish: (event: WsEvent) => void, log = console.log): Promise<RealCore> {
  const db = openDb(config.dbPath);
  const chain = await waitForChain(config, undefined, log);

  // Proof links come from the chain we are on: Polygon Amoy has a public explorer, the local chain has none.
  const explorerUrl = config.explorerUrl ?? chain.deployment.explorerUrl ?? null;
  const repo = new Repo(db, explorerUrl);

  // Everything in the database describes one particular chain. If this is a different one (the node was
  // restarted, or `hardhat_reset` and a redeploy happened while Core was off), none of it is true any
  // more: stale log rows would be anchored onto the new chain and fail verification. Start clean.
  const fingerprint = await chainFingerprint(chain);
  const previous = storedFingerprint(repo);
  if (previous !== fingerprint) {
    if (repo.hasData()) log(`The chain is not the one this database describes (${previous ? "it was reset or replaced" : "no chain recorded"}): wiping Core's database before serving.`);
    clearAll(db);
    repo.setState(FINGERPRINT_KEY, fingerprint);
  }
  repo.seedDirectory();

  const relayer = new Relayer(chain, config.relayerKey);
  const indexer = new Indexer(db, repo, chain, publish);
  // The same wipe, if the chain is replaced while Core is running (a reset that did not go through demo:reset).
  indexer.onChainReplaced = async () => {
    clearAll(db);
    repo.setState(FINGERPRINT_KEY, await chainFingerprint(chain));
    repo.seedDirectory();
  };
  const anchors = new AnchorJob(config, repo, chain, indexer);
  const cascade = new CascadeEngine(config, repo, chain, indexer, publish);
  indexer.onWithdrawn = (w) => cascade.onWithdrawn(w);

  // `pnpm demo:up` starts Core while the seed is still registering companies; funding the relayer is
  // the seed's last step, so wait for it rather than answer requests the chain cannot serve yet.
  const balance = await waitForRelayerFunds(chain, relayer.address, SEED_WAIT_MS, log);
  if (balance < LOW_RELAYER_BALANCE) {
    log(`WARNING: relayer ${relayer.address} has only ${formatEther(balance)} ETH; grants will fail. Run \`pnpm seed\` to fund it.`);
  }

  let reconcileTimer: NodeJS.Timeout | null = null;
  const core: RealCore = {
    config,
    db,
    repo,
    chain,
    explorerUrl,
    relayer,
    indexer,
    anchors,
    cascade,
    publish,
    async reset() {
      clearAll(db);
      repo.setState(FINGERPRINT_KEY, await chainFingerprint(chain));
      repo.seedDirectory();
      await indexer.resync();
    },
    reconcile: () => reconcile(repo, chain, indexer),
    start() {
      indexer.start(config.indexerIntervalMs);
      anchors.start();
      cascade.catchUp();
      reconcileTimer = setInterval(() => {
        cascade.catchUp();
        core.reconcile().catch((err) => console.warn("[reconcile] failed:", err instanceof Error ? err.message : err));
      }, config.reconcileIntervalMs);
      reconcileTimer.unref();
    },
    stop() {
      indexer.stop();
      anchors.stop();
      cascade.stop();
      if (reconcileTimer) clearInterval(reconcileTimer);
      db.close();
    },
  };
  return core;
}
