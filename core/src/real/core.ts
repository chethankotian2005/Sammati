import { formatEther, parseEther } from "ethers";
import { LOCAL_ADMIN_KEY, LOCAL_CHAIN_ID, LOCAL_RELAYER_KEY } from "@sammati/shared";
import type { VaultEvent, WsEvent } from "@sammati/shared";
import type { Config } from "../config";
import { AnchorJob } from "./anchor";
import { CascadeEngine } from "./cascade";
import { waitForChain, Relayer, type Chain } from "./chain";
import { clearAll, openDb, type Db } from "./db";
import { FINGERPRINT_KEY, chainFingerprint, storedFingerprint } from "./fingerprint";
import { ExpiryScheduler } from "./expiry";
import { Indexer } from "./indexer";
import { Onboarding } from "./onboarding";
import { Notifications } from "./notifications";
import { reconcile, type ReconcileResult } from "./reconcile";
import { Renewals } from "./renewals";
import { Repo } from "./repo";
import { TargetedRequests } from "./targeted";

const LOW_RELAYER_BALANCE = parseEther("0.1");
const FUNDING_WAIT_MS = 60_000;

/** Polls until the relayer can pay gas. Returns the last balance seen, funded or not, after the timeout. */
async function waitForRelayerFunds(chain: Chain, relayer: string, timeoutMs: number, log: (m: string) => void): Promise<bigint> {
  const deadline = Date.now() + timeoutMs;
  let announced = false;
  for (;;) {
    const balance = await chain.provider.getBalance(relayer);
    if (balance >= LOW_RELAYER_BALANCE || Date.now() >= deadline) return balance;
    if (!announced) {
      log("Waiting for the relayer to be funded (is `pnpm seed` running?)");
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
  /** Sammati IDs and targeted consent requests (trd.md §6.11). */
  targeted: TargetedRequests;
  /** Company applications, the regulator's decision, API keys and the sandbox (trd.md §6.12). */
  onboarding: Onboarding;
  /** The wallet's Alerts (trd.md §6.12). */
  notifications: Notifications;
  /** Renewal requests, from a company or from the customer pressing Renew. */
  renewals: Renewals;
  /** Tells customers a consent is about to expire, and that it has. */
  expiry: ExpiryScheduler;
  /** The Processor reported a vault event: erasures become "data erased" alerts. */
  onVaultEvent(event: VaultEvent): void;
  publish: (event: WsEvent) => void;
  /** Wipes Core's database and re-reads the chain (the chain itself is untouched). Used by tests; no route calls it. */
  reset(): Promise<void>;
  reconcile(): Promise<ReconcileResult>;
  /** The database answers and the chain answers (GET /readyz). Throws with the reason when not. */
  checkReady(): Promise<void>;
  /** Starts the background jobs: indexer polling and the reconcile loop. */
  start(): void;
  stop(): void;
}

/** The default keys are public. They are fine on the local node and an open invitation anywhere else (trd.md §6.6). */
export function guardLocalKeys(config: Config, chain: Chain): void {
  if (chain.deployment.chainId === LOCAL_CHAIN_ID) return;
  if (config.relayerKey === LOCAL_RELAYER_KEY || config.adminKey === LOCAL_ADMIN_KEY) {
    throw new Error(`RELAYER_KEY and ADMIN_KEY must be your own keys on chain ${chain.deployment.chainId}: the defaults are public`);
  }
}

export async function createRealCore(config: Config, publish: (event: WsEvent) => void, log = console.log): Promise<RealCore> {
  const db = openDb(config.dbPath);
  try {
    return await assemble(db, config, publish, log);
  } catch (err) {
    db.close(); // a Core that refuses to start (CHAIN_MISMATCH) must not keep the file open
    throw err;
  }
}

async function assemble(db: Db, config: Config, publish: (event: WsEvent) => void, log: (m: string) => void): Promise<RealCore> {
  const chain = await waitForChain(config, undefined, log);

  // Proof links come from the chain we are on: Polygon Amoy has a public explorer, the local chain has none.
  const explorerUrl = config.explorerUrl ?? chain.deployment.explorerUrl ?? null;
  const repo = new Repo(db, explorerUrl);

  // Everything in the database describes one particular chain. If this is a different one (the node was
  // restarted, or `hardhat_reset` and a redeploy happened while Core was off), none of it is true any
  // more: stale log rows would be anchored onto the new chain and fail verification. Start clean.
  const fingerprint = await chainFingerprint(chain, !config.wipeOnChainChange);
  const previous = storedFingerprint(repo);
  if (previous !== fingerprint) {
    // In production the database holds what exists nowhere else (the keys Core generated for companies): a flaky
    // RPC answer must never be taken for a replaced chain. Stop, say so, and let a person decide (deploy-guide.md).
    if (!config.wipeOnChainChange && previous !== undefined) {
      throw new Error(`CHAIN_MISMATCH: this database describes another chain than the one at CHAIN_RPC (${previous} vs ${fingerprint}). Not wiping it. Fix CHAIN_RPC, or delete the database on purpose to start over.`);
    }
    if (repo.hasData()) log(`The chain is not the one this database describes (${previous ? "it was reset or replaced" : "no chain recorded"}): wiping Core's database before serving.`);
    clearAll(db);
    repo.setState(FINGERPRINT_KEY, fingerprint);
  }

  guardLocalKeys(config, chain);
  const relayer = new Relayer(chain, config.relayerKey);
  const indexer = new Indexer(db, repo, chain, publish, console.warn, { chunkBlocks: config.logChunkBlocks, wipeOnChainChange: config.wipeOnChainChange });
  // The same wipe, if the chain is replaced while Core is running (a reset that did not go through `pnpm dev:reset`).
  indexer.onChainReplaced = async () => {
    clearAll(db);
    repo.setState(FINGERPRINT_KEY, await chainFingerprint(chain));
  };
  const anchors = new AnchorJob(config, repo, chain, indexer);
  const cascade = new CascadeEngine(config, repo, chain, indexer, publish);
  indexer.onWithdrawn = (w) => cascade.onWithdrawn(w);
  const onboarding = new Onboarding(db, repo, chain, config, indexer, publish, log);
  const targeted = new TargetedRequests(db, repo, publish, config, undefined, undefined, (f, principal) => onboarding.mayDealWith(f, principal));
  const notifications = new Notifications(db, repo, publish, config);
  indexer.onAcknowledged = (a) => notifications.onAcknowledged(a);
  const renewals = new Renewals(db, repo, targeted, notifications, (r) => targeted.publishRequested(r), config);
  const expiry = new ExpiryScheduler(db, notifications, config);

  // `pnpm demo:up` starts Core while the bootstrap is still funding the relayer: wait for it rather than answer
  // requests the chain cannot serve yet. A hosted Core does not wait: nobody is about to fund it from a script.
  const balance = await waitForRelayerFunds(chain, relayer.address, config.production ? 0 : FUNDING_WAIT_MS, log);
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
    targeted,
    notifications,
    renewals,
    expiry,
    onVaultEvent: (event) => notifications.onVaultEvent(event),
    onboarding,
    publish,
    async reset() {
      clearAll(db);
      repo.setState(FINGERPRINT_KEY, await chainFingerprint(chain));
      onboarding.forget();
      await indexer.resync();
    },
    reconcile: () => reconcile(repo, chain, indexer),
    async checkReady() {
      try {
        db.prepare("SELECT 1").get();
      } catch {
        throw new Error("the database did not answer");
      }
      try {
        await chain.provider.getBlockNumber();
      } catch {
        throw new Error("the chain did not answer");
      }
    },
    start() {
      indexer.start(config.indexerIntervalMs, config.rpcBackoffMaxMs);
      anchors.start();
      expiry.start();
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
      expiry.stop();
      cascade.stop();
      if (reconcileTimer) clearInterval(reconcileTimer);
      db.close();
    },
  };
  return core;
}
