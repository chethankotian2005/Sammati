import { Contract, Wallet, isError, type Interface, type TransactionReceipt } from "ethers";
import { merkleRoot, type Hex } from "@sammati/shared";
import type { Config } from "../config";
import type { Chain } from "./chain";
import type { Indexer } from "./indexer";
import type { Repo } from "./repo";

/** trd.md §8: anchor after this many waiting entries, or when the timer fires. */
export const EARLY_ANCHOR_AT = 20;
/** The most entries one batch covers. */
export const MAX_BATCH = 100;

export interface AnchoredBatch {
  fiduciary: Hex;
  index: number;
  fromSeq: number;
  toSeq: number;
  count: number;
  merkleRoot: Hex;
  txHash: Hex;
}

/**
 * Anchors each company's access log on chain (trd.md §8): a Merkle root over the stored entry hashes,
 * sent by the company itself (Core holds the companies' keys: a disclosed shortcut).
 *
 * The chain decides where a batch starts: the next one begins right after the last anchored `toSeq`.
 * If the stored log has a hole there, nothing is anchored and a warning is logged, because anchoring
 * around a hole would hide it. Verification reports the hole.
 */
export class AnchorJob {
  private timer: NodeJS.Timeout | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private readonly scheduled = new Set<string>();
  private readonly wallets = new Map<string, Contract>();

  constructor(
    private readonly config: Config,
    private readonly repo: Repo,
    private readonly chain: Chain,
    private readonly indexer: Indexer,
    private readonly log: (message: string) => void = console.warn,
  ) {}

  start(): void {
    if (this.config.anchorIntervalMs <= 0) return;
    this.timer = setInterval(() => {
      this.runOnce().catch((err) => this.log(`[anchor] run failed: ${err instanceof Error ? err.message : String(err)}`));
    }, this.config.anchorIntervalMs);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Called after each log write: anchors early once EARLY_ANCHOR_AT entries are waiting. Never throws or blocks. */
  notify(fiduciary: Hex): void {
    if (this.scheduled.has(fiduciary) || this.repo.pendingCount(fiduciary) < EARLY_ANCHOR_AT) return;
    this.scheduled.add(fiduciary);
    this.runOnce(fiduciary)
      .catch((err) => this.log(`[anchor] early run failed: ${err instanceof Error ? err.message : String(err)}`))
      .finally(() => this.scheduled.delete(fiduciary));
  }

  /** Anchors whatever is pending, for one company or all of them. Runs are queued, never overlapped. */
  runOnce(fiduciary?: Hex): Promise<AnchoredBatch[]> {
    const run = async (): Promise<AnchoredBatch[]> => {
      const done: AnchoredBatch[] = [];
      for (const f of this.repo.fiduciaries()) {
        if (fiduciary && f.address !== fiduciary) continue;
        try {
          const batch = await this.anchorPending(f.address);
          if (batch) done.push(batch);
        } catch (err) {
          this.log(`[anchor] ${f.name}: ${describe(err, this.chain.anchorInterface)}`);
        }
      }
      return done;
    };
    const result = this.queue.then(run, run);
    this.queue = result.catch(() => undefined);
    return result;
  }

  private async anchorPending(fiduciary: Hex): Promise<AnchoredBatch | null> {
    const contract = this.contractFor(fiduciary);
    if (!contract) return null; // not a company whose key Core holds

    const batches = Number(await this.chain.anchor.batchCount(fiduciary));
    const lastTo = batches === 0 ? 0 : Number((await this.chain.anchor.getBatch(fiduciary, batches - 1))[2]);
    const rows = this.repo.accessFrom(fiduciary, lastTo + 1, MAX_BATCH);
    if (rows.length === 0) return null;
    if (rows[0]!.seq !== lastTo + 1) {
      this.log(`[anchor] ${fiduciary}: stored log jumps from seq ${lastTo} to ${rows[0]!.seq}; not anchoring around the hole`);
      return null;
    }
    // Only the unbroken run from the first row: a hole later on waits for the next round.
    const run = rows.filter((r, i) => r.seq === lastTo + 1 + i).slice(0, MAX_BATCH);
    const root = merkleRoot(run.map((r) => r.hash));
    const fromSeq = run[0]!.seq;
    const toSeq = run[run.length - 1]!.seq;

    const tx = await contract.getFunction("anchorAccessBatch")(root, fromSeq, toSeq, run.length);
    const receipt = (await tx.wait()) as TransactionReceipt;
    await this.indexer.ingestReceipt(receipt); // fills anchor_batches and access_logs.batch_index, announces anchor.posted
    return { fiduciary, index: batches, fromSeq, toSeq, count: run.length, merkleRoot: root, txHash: receipt.hash as Hex };
  }

  private contractFor(fiduciary: Hex): Contract | null {
    const key = this.repo.fiduciaryKey(fiduciary);
    if (!key) return null;
    let contract = this.wallets.get(fiduciary);
    if (!contract) {
      contract = this.chain.anchorContract.connect(new Wallet(key, this.chain.provider)) as Contract;
      this.wallets.set(fiduciary, contract);
    }
    return contract;
  }
}

/** A short, readable cause for a failed anchor transaction (custom errors are decoded from the revert data). */
function describe(err: unknown, iface: Interface): string {
  if (isError(err, "CALL_EXCEPTION")) {
    const name = err.revert?.name ?? (err.data ? iface.parseError(err.data)?.name : undefined);
    return `the contract rejected the batch${name ? ` (${name})` : ""}`;
  }
  return err instanceof Error ? err.message : String(err);
}
