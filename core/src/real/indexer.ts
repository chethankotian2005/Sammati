import type { Log, LogDescription, TransactionReceipt } from "ethers";
import type { Hex, WsEvent } from "@sammati/shared";
import type { Withdrawal } from "./cascade";
import type { Chain } from "./chain";
import { clearChainDerived, type Db } from "./db";
import { addr, statusOf, type LedgerInsert, type Repo } from "./repo";

const DEFAULT_CHUNK_BLOCKS = 2000;
/** With no new block the saved block's hash is still re-checked, but only every this many polls, to spare the RPC. */
const IDLE_HASH_CHECK_EVERY = 20;

export interface IndexerOptions {
  /** Most blocks one eth_getLogs asks for (public RPCs cap the range). */
  chunkBlocks?: number;
  /** A chain that is not the one this database describes: wipe and re-read (local) or refuse (production, trd.md §10.7). */
  wipeOnChainChange?: boolean;
}

/**
 * Reads ConsentRegistry and AccessAnchor events into ledger_events and consents_cache (drd.md §3),
 * and pushes the matching WebSocket events. Two paths feed it, polling and the receipt of every
 * relayed transaction; the unique (tx_hash, log_index) key makes them agree, so an event is
 * applied and announced exactly once.
 *
 * consents_cache is refreshed from the chain's own getConsent, not by replaying the event, so
 * the order in which events arrive can never leave it wrong.
 */
export class Indexer {
  private timer: NodeJS.Timeout | null = null;
  private stopped = true;
  private idleTicks = 0;
  private readonly chunkBlocks: number;
  private readonly wipeOnChainChange: boolean;
  private running: Promise<unknown> = Promise.resolve();
  private lastError: string | null = null;
  private readonly blockTimes = new Map<number, number>();

  /** Called for every *new* ConsentWithdrawn event (not for replays), after the cache is up to date. */
  onWithdrawn: ((w: Withdrawal) => void) | null = null;

  /** Called for every *new* WithdrawalAcknowledged event: a processor confirmed it stopped using the data. */
  onAcknowledged: ((a: { principal: Hex; purposeId: Hex; processor: Hex; txHash: string; at: number }) => void) | null = null;

  /** Called when the chain turns out to be a different one from what the database describes. */
  onChainReplaced: (() => Promise<void>) | null = null;

  constructor(
    private readonly db: Db,
    private readonly repo: Repo,
    private readonly chain: Chain,
    private readonly publish: (event: WsEvent) => void,
    private readonly log: (message: string) => void = console.warn,
    options: IndexerOptions = {},
  ) {
    this.chunkBlocks = options.chunkBlocks ?? DEFAULT_CHUNK_BLOCKS;
    this.wipeOnChainChange = options.wipeOnChainChange ?? true;
  }

  get startBlock(): number {
    return this.chain.deployment.startBlock ?? 0;
  }

  get error(): string | null {
    return this.lastError;
  }

  /**
   * Polls every `intervalMs`. After a failed poll (a rate-limited or unreachable RPC) the wait doubles up to
   * `maxBackoffMs`, with jitter, and returns to `intervalMs` after one success. A failure never moves the cursor.
   */
  start(intervalMs: number, maxBackoffMs = 60_000): void {
    this.stopped = false;
    let failures = 0;
    const tick = async (): Promise<void> => {
      if (this.stopped) return;
      try {
        await this.syncOnce();
        failures = 0;
      } catch (err) {
        failures += 1;
        this.log(`[indexer] poll failed (${err instanceof Error ? err.message.split("\n")[0] : String(err)}); retrying with backoff`);
      }
      if (this.stopped) return;
      const wait = failures === 0 ? intervalMs : Math.min(maxBackoffMs, intervalMs * 2 ** failures) * (0.8 + Math.random() * 0.4);
      this.timer = setTimeout(() => void tick(), wait);
      this.timer.unref();
    };
    void tick();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  /** Forget everything derived from the chain and read it again from the start block. */
  async resync(): Promise<void> {
    await this.serial(async () => {
      clearChainDerived(this.db);
      this.blockTimes.clear();
    });
    await this.syncOnce();
  }

  /** Reads any new blocks. Safe to call concurrently: runs are queued, never overlapped. */
  syncOnce(): Promise<void> {
    return this.serial(async () => {
      try {
        await this.sync();
        this.lastError = null;
      } catch (err) {
        this.lastError = err instanceof Error ? err.message : String(err);
        throw err;
      }
    });
  }

  /** Applies the events of a transaction we just relayed, without waiting for the next poll. */
  ingestReceipt(receipt: TransactionReceipt): Promise<void> {
    return this.serial(async () => {
      await this.processLogs(receipt.logs.filter((l) => this.isOurs(l)));
    });
  }

  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.running.then(fn, fn);
    this.running = result.catch(() => undefined);
    return result;
  }

  private isOurs(log: Log): boolean {
    const a = log.address.toLowerCase();
    return a === this.chain.deployment.consentRegistry.toLowerCase() || a === this.chain.deployment.accessAnchor.toLowerCase();
  }

  private async sync(): Promise<void> {
    const { provider } = this.chain;
    const latest = await provider.getBlockNumber();
    let last = Number(this.repo.getState("last_block") ?? this.startBlock - 1);

    // A node that was reset (hardhat_reset, a fresh `pnpm demo:up`) invalidates everything we derived from it.
    // Looking costs a call, so with no new block it is done only now and then.
    const savedHash = this.repo.getState("last_block_hash");
    const mustCheck = latest !== last || ++this.idleTicks >= IDLE_HASH_CHECK_EVERY;
    if (savedHash !== undefined && last >= this.startBlock && mustCheck) {
      this.idleTicks = 0;
      const block = last <= latest ? await provider.getBlock(last) : null;
      if (!block || block.hash !== savedHash) {
        // A missing block can be a lagging or flaky RPC node as easily as a replaced chain, and in production the
        // database is the only copy of what Core holds (company keys): never wipe it on that evidence.
        if (!this.wipeOnChainChange) throw new Error(`CHAIN_MISMATCH: block ${last} is not the one this database indexed; not indexing until the RPC agrees again`);
        this.log("[indexer] chain changed under us (reset?): re-reading from the start");
        // A replaced chain makes the whole database stale, not just what was derived from events: log rows
        // would otherwise be anchored onto the new chain. Without the hook (tests) only the derived part goes.
        if (this.onChainReplaced) await this.onChainReplaced();
        else clearChainDerived(this.db);
        this.blockTimes.clear();
        last = this.startBlock - 1;
      }
    }

    for (let from = last + 1; from <= latest; from += this.chunkBlocks) {
      const to = Math.min(from + this.chunkBlocks - 1, latest);
      const logs = await provider.getLogs({
        address: [this.chain.deployment.consentRegistry, this.chain.deployment.accessAnchor],
        fromBlock: from,
        toBlock: to,
      });
      await this.processLogs(logs);
      const tip = await provider.getBlock(to);
      this.repo.setState("last_block", String(to));
      if (tip?.hash) this.repo.setState("last_block_hash", tip.hash);
    }
  }

  private async processLogs(logs: readonly Log[]): Promise<void> {
    const ordered = [...logs].sort((a, b) => a.blockNumber - b.blockNumber || a.index - b.index);
    for (const log of ordered) {
      const isAnchor = log.address.toLowerCase() === this.chain.deployment.accessAnchor.toLowerCase();
      const iface = isAnchor ? this.chain.anchorInterface : this.chain.registryInterface;
      const parsed = iface.parseLog({ topics: [...log.topics], data: log.data });
      if (parsed) await this.apply(log, parsed);
    }
  }

  private async blockTime(blockNumber: number): Promise<number> {
    const cached = this.blockTimes.get(blockNumber);
    if (cached !== undefined) return cached;
    const block = await this.chain.provider.getBlock(blockNumber);
    if (!block) throw new Error(`block ${blockNumber} not found`);
    this.blockTimes.set(blockNumber, block.timestamp);
    if (this.blockTimes.size > 256) this.blockTimes.delete(this.blockTimes.keys().next().value!);
    return block.timestamp;
  }

  private async apply(log: Log, e: LogDescription): Promise<void> {
    const at = await this.blockTime(log.blockNumber);
    const base = { txHash: log.transactionHash as Hex, blockNumber: log.blockNumber, logIndex: log.index, at };
    const a = e.args;
    const row = (r: Pick<LedgerInsert, "type" | "principal" | "fiduciary" | "purposeId" | "ledgerHead" | "payload">): LedgerInsert => ({ ...base, ...r });

    switch (e.name) {
      case "ConsentGranted": {
        const [principal, fiduciary, purposeId] = [addr(a.principal), addr(a.fiduciary), (a.purposeId as string).toLowerCase() as Hex];
        const expiresAt = Number(a.expiresAt);
        const isNew = this.repo.insertLedger(
          row({ type: "granted", principal, fiduciary, purposeId, ledgerHead: a.ledgerHead, payload: { expiresAt, noticeHash: a.noticeHash } }),
        );
        if (!isNew) return;
        this.repo.clearCascade(principal, purposeId); // a new grant has no cascade yet
        await this.refreshConsent(principal, fiduciary, purposeId);
        this.publish({
          event: "consent.updated",
          principal,
          fiduciary,
          purposeId,
          purposeCode: this.repo.purposeById(purposeId)?.code ?? "",
          status: "Active",
          expiresAt,
          txHash: base.txHash,
          at,
        });
        return;
      }
      case "ConsentWithdrawn": {
        const [principal, fiduciary, purposeId] = [addr(a.principal), addr(a.fiduciary), (a.purposeId as string).toLowerCase() as Hex];
        const isNew = this.repo.insertLedger(row({ type: "withdrawn", principal, fiduciary, purposeId, ledgerHead: a.ledgerHead, payload: null }));
        if (!isNew) return;
        await this.refreshConsent(principal, fiduciary, purposeId);
        this.publish({
          event: "consent.updated",
          principal,
          fiduciary,
          purposeId,
          purposeCode: this.repo.purposeById(purposeId)?.code ?? "",
          status: "Withdrawn",
          expiresAt: this.repo.cachedConsent(principal, fiduciary, purposeId)?.expiresAt ?? null,
          txHash: base.txHash,
          at,
        });
        this.onWithdrawn?.({ principal, fiduciary, purposeId, txHash: base.txHash, at });
        return;
      }
      case "WithdrawalAcknowledged": {
        const [principal, processor, purposeId] = [addr(a.principal), addr(a.processor), (a.purposeId as string).toLowerCase() as Hex];
        const isNew = this.repo.insertLedger(
          row({ type: "ack", principal, fiduciary: this.repo.purposeById(purposeId)?.fiduciary ?? null, purposeId, ledgerHead: null, payload: { processor } }),
        );
        if (!isNew) return;
        this.repo.recordAck(principal, purposeId, processor, at, base.txHash);
        const ack = this.repo.cascadeFor(principal, purposeId).find((c) => c.processor === processor);
        this.publish({
          event: "cascade.updated",
          principal,
          purposeId,
          processor,
          processorName: this.repo.processorName(processor),
          notifiedAt: ack?.notifiedAt ?? null,
          ackedAt: at,
          txHash: base.txHash,
        });
        this.onAcknowledged?.({ principal, purposeId, processor, txHash: base.txHash, at });
        return;
      }
      case "FiduciaryRegistered": {
        const fiduciary = addr(a.fiduciary);
        const isNew = this.repo.insertLedger(row({ type: "purpose", principal: null, fiduciary, purposeId: null, ledgerHead: null, payload: { kind: "fiduciary", name: a.name } }));
        if (isNew) this.repo.markFiduciaryRegistered(fiduciary, base.txHash);
        return;
      }
      case "PurposeRegistered":
      case "PurposeActiveChanged": {
        const kind = e.name === "PurposeRegistered" ? "purpose" : "purposeActive";
        const payload = e.name === "PurposeRegistered" ? { kind, descHash: a.descHash } : { kind, active: a.active };
        this.repo.insertLedger(row({ type: "purpose", principal: null, fiduciary: addr(a.fiduciary), purposeId: (a.purposeId as string).toLowerCase() as Hex, ledgerHead: null, payload }));
        return;
      }
      case "ProcessorRegistered": {
        this.repo.insertLedger(
          row({ type: "purpose", principal: null, fiduciary: null, purposeId: (a.purposeId as string).toLowerCase() as Hex, ledgerHead: null, payload: { kind: "processor", processor: addr(a.processor) } }),
        );
        return;
      }
      case "AccessBatchAnchored": {
        const fiduciary = addr(a.fiduciary);
        const batch = {
          fiduciary,
          index: Number(a.index),
          merkleRoot: a.merkleRoot as Hex,
          fromSeq: Number(a.fromSeq),
          toSeq: Number(a.toSeq),
          count: Number(a.count),
        };
        const { merkleRoot, fromSeq, toSeq, count } = batch;
        const isNew = this.repo.insertLedger(row({ type: "anchor", principal: null, fiduciary, purposeId: null, ledgerHead: null, payload: { merkleRoot, fromSeq, toSeq, count } }));
        if (!isNew) return;
        this.repo.insertAnchor({ ...batch, txHash: base.txHash, at });
        this.publish({ event: "anchor.posted", fiduciary, batchIndex: batch.index, merkleRoot: batch.merkleRoot, fromSeq: batch.fromSeq, toSeq: batch.toSeq, count: batch.count, txHash: base.txHash });
        return;
      }
    }
  }

  /** Copies one consent from the chain into consents_cache (or removes it if the chain has none). */
  async refreshConsent(principal: Hex, fiduciary: Hex, purposeId: Hex): Promise<"updated" | "removed" | "unchanged"> {
    const c = await this.chain.registry.getConsent(principal, fiduciary, purposeId);
    const status = statusOf(c.status);
    const existing = this.repo.cachedConsent(principal, fiduciary, purposeId);
    if (status === "None") {
      if (!existing) return "unchanged";
      this.repo.deleteConsent(principal, fiduciary, purposeId);
      return "removed";
    }
    const next = {
      principal,
      fiduciary,
      purposeId,
      status,
      grantedAt: Number(c.grantedAt),
      expiresAt: Number(c.expiresAt),
      updatedAt: Number(c.updatedAt),
      noticeHash: c.noticeHash as Hex,
      lastTx: this.repo.lastConsentTx(principal, fiduciary, purposeId) ?? existing?.lastTx ?? null,
    };
    this.repo.upsertConsent(next);
    return "updated";
  }
}
