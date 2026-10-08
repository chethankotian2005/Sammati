import { Contract, Wallet, isError, type TransactionReceipt } from "ethers";
import {
  ackSigner,
  notificationDigest,
  signNotification,
  type CascadeNotification,
  type SignedAck,
  type SignedNotification,
  type Hex,
  type WsEvent,
} from "@sammati/shared";
import type { Config } from "../config";
import { now } from "../clock";
import type { Chain } from "./chain";
import type { Indexer } from "./indexer";
import { InProcessProcessor } from "./processors";
import type { Repo } from "./repo";

/** A withdrawal that processors have to be told about. */
export interface Withdrawal {
  principal: Hex;
  fiduciary: Hex;
  purposeId: Hex;
  /** The withdrawal transaction. */
  txHash: Hex;
  /** Block time of the withdrawal. */
  at: number;
}

interface Processor {
  address: Hex;
  name: string;
}

/** How the engine reaches one processor: deliver a signed notification, get a signed acknowledgement back. */
export interface ProcessorTransport {
  /** Sends the acknowledgement transaction, so it must be the processor's key. */
  readonly wallet: Wallet;
  receive(signed: SignedNotification): Promise<SignedAck>;
}

/** Reverts that mean "nothing to do here", not "something broke". */
const SETTLED = new Set(["AlreadyAcknowledged", "NotWithdrawn", "NotProcessor"]);

/**
 * The withdrawal cascade (trd.md §9). When consent is withdrawn, every processor registered for that
 * purpose is told, signed by the company; it answers with a signed acknowledgement a second or two
 * later, and Core records it on chain (`acknowledgeWithdrawal`, sent from the processor's key). The
 * indexer then stores the acknowledgement and tells the wallet.
 *
 * The engine is idempotent. Before notifying it dry-runs the acknowledgement on chain, so replaying
 * old history, a re-granted consent or a processor that already acknowledged are all skipped.
 */
export class CascadeEngine {
  private readonly inFlight = new Map<string, Promise<void>>();
  private readonly sleepers = new Set<() => void>();
  private readonly inProcess = new Map<string, InProcessProcessor>();
  private txQueue: Promise<unknown> = Promise.resolve();
  private stopped = false;

  /**
   * Finds the way to reach a processor. The built-in answer is the in-process acknowledger Core runs for
   * each processor a company declared (Core holds its key: a disclosed shortcut); replace it to deliver over a real webhook, or to test misbehaving processors.
   */
  resolveProcessor: (p: Processor) => ProcessorTransport | undefined = (p) => this.inProcessProcessor(p);

  constructor(
    private readonly config: Config,
    private readonly repo: Repo,
    private readonly chain: Chain,
    private readonly indexer: Indexer,
    private readonly publish: (event: WsEvent) => void,
    private readonly log: (message: string) => void = console.warn,
  ) {}

  /** Tells the purpose's processors. Returns at once; the work happens in the background. */
  onWithdrawn(w: Withdrawal): void {
    for (const p of this.repo.processorsFor(w.purposeId)) this.launch(w, p);
  }

  /** Picks up withdrawals whose processors never acknowledged (Core was down, a send failed). */
  catchUp(): void {
    for (const row of this.repo.unacknowledgedWithdrawals()) {
      this.launch(
        { principal: row.principal, fiduciary: row.fiduciary, purposeId: row.purposeId, txHash: row.txHash, at: row.at },
        { address: row.processor, name: row.processorName },
      );
    }
  }

  /** Resolves when no cascade is in progress. */
  async idle(): Promise<void> {
    while (this.inFlight.size > 0) await Promise.allSettled([...this.inFlight.values()]);
  }

  stop(): void {
    this.stopped = true;
    for (const wake of this.sleepers) wake();
    this.sleepers.clear();
  }

  private launch(w: Withdrawal, p: Processor): void {
    if (this.stopped) return;
    const key = `${w.principal}|${w.purposeId}|${p.address}`;
    if (this.inFlight.has(key)) return;
    const run = this.process(w, p)
      .catch((err) => {
        if (!this.stopped) this.log(`[cascade] ${p.name}: ${err instanceof Error ? err.message : String(err)}`);
      })
      .finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, run);
  }

  private async process(w: Withdrawal, p: Processor): Promise<void> {
    const acknowledger = this.resolveProcessor(p);
    const fiduciaryKey = this.repo.fiduciaryKey(w.fiduciary);
    if (!acknowledger || !fiduciaryKey) {
      this.log(`[cascade] no way to reach ${p.name} (Core holds no ${acknowledger ? "company" : "processor"} key for it); skipping`);
      return;
    }
    const registry = this.chain.registryContract.connect(acknowledger.wallet) as Contract;

    if (await this.alreadySettled(registry, w)) return;

    const notification: CascadeNotification = {
      principal: w.principal,
      fiduciary: w.fiduciary,
      purposeId: w.purposeId,
      purposeCode: this.repo.purposeById(w.purposeId)?.code ?? "",
      processor: p.address,
      withdrawalTx: w.txHash,
      withdrawnAt: w.at,
    };
    const signed = await signNotification(notification, new Wallet(fiduciaryKey));

    const notifiedAt = now();
    this.repo.markNotified(w.principal, w.purposeId, p.address, notifiedAt);
    this.publish({
      event: "cascade.updated",
      principal: w.principal,
      purposeId: w.purposeId,
      processor: p.address,
      processorName: p.name,
      notifiedAt,
      ackedAt: null,
      txHash: null,
    });

    const answer = await acknowledger.receive(signed);
    if (this.stopped) return;
    if (ackSigner(answer)?.toLowerCase() !== p.address.toLowerCase() || answer.ack.notificationDigest !== notificationDigest(notification)) {
      throw new Error("acknowledgement is not signed by the processor for this notification; not recording it");
    }

    const receipt = await this.send(registry, w);
    if (receipt) await this.indexer.ingestReceipt(receipt); // stores the ack and announces it
  }

  /** True if the chain says there is nothing to acknowledge (and why is not worth a warning). */
  private async alreadySettled(registry: Contract, w: Withdrawal): Promise<boolean> {
    try {
      await registry.getFunction("acknowledgeWithdrawal").staticCall(w.principal, w.fiduciary, w.purposeId);
      return false;
    } catch (err) {
      if (isError(err, "CALL_EXCEPTION") && err.revert && SETTLED.has(err.revert.name)) return true;
      throw err;
    }
  }

  /** Sends the acknowledgement; transactions go one at a time so a processor's nonce is never reused. */
  private send(registry: Contract, w: Withdrawal): Promise<TransactionReceipt | null> {
    const run = async (): Promise<TransactionReceipt | null> => {
      try {
        const tx = await registry.getFunction("acknowledgeWithdrawal")(w.principal, w.fiduciary, w.purposeId);
        return (await tx.wait()) as TransactionReceipt;
      } catch (err) {
        // Re-granted while the processor was thinking: the cascade is simply moot.
        const name = isError(err, "CALL_EXCEPTION") ? (err.revert?.name ?? this.chain.registryInterface.parseError(err.data ?? "")?.name) : undefined;
        if (name && SETTLED.has(name)) return null;
        throw err;
      }
    };
    const result = this.txQueue.then(run, run);
    this.txQueue = result.catch(() => undefined);
    return result;
  }

  private inProcessProcessor(p: Processor): InProcessProcessor | undefined {
    let acknowledger = this.inProcess.get(p.address.toLowerCase());
    if (!acknowledger) {
      const key = this.repo.processorKey(p.address);
      if (!key) return undefined;
      const [min, max] = this.config.cascadeDelayMs;
      acknowledger = new InProcessProcessor(
        p.name,
        new Wallet(key, this.chain.provider),
        (ms) => this.wait(ms),
        () => min + Math.random() * (max - min),
      );
      this.inProcess.set(p.address.toLowerCase(), acknowledger);
    }
    return acknowledger;
  }

  /** A sleep that ends early when the engine stops. */
  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const done = () => {
        clearTimeout(timer);
        this.sleepers.delete(done);
        resolve();
      };
      const timer = setTimeout(done, ms);
      timer.unref();
      this.sleepers.add(done);
    });
  }
}
