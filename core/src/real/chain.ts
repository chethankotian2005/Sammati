import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import {
  Contract,
  FeeData,
  Interface,
  JsonRpcProvider,
  Network,
  Wallet,
  isError,
  parseUnits,
  type InterfaceAbi,
  type JsonRpcApiProviderOptions,
  type Networkish,
  type TransactionRequest,
  type TransactionReceipt,
} from "ethers";
import type { Deployment, Deployments } from "@sammati/shared";
import type { Config, GasConfig } from "../config";
import { HttpError } from "../errors";

const sharedDir = dirname(createRequire(import.meta.url).resolve("@sammati/shared/package.json"));

function loadAbi(name: string): InterfaceAbi {
  return JSON.parse(readFileSync(resolve(sharedDir, "abi", `${name}.json`), "utf8")) as InterfaceAbi;
}

export function readDeployment(config: Config): Deployment | null {
  if (config.deployment) return config.deployment;
  const file = resolve(sharedDir, "deployments.json");
  if (!existsSync(file)) return null;
  return (JSON.parse(readFileSync(file, "utf8")) as Deployments)[config.chainNetwork] ?? null;
}

/**
 * Fee defaults by chain id (trd.md §10.7): what a public network insists on, so no setting is needed to send a
 * transaction. GAS_PRIORITY_FEE_GWEI and GAS_MAX_FEE_GWEI override them. Polygon Amoy rejects a priority fee below 25 gwei.
 */
export const NETWORK_FEES: Record<number, { priorityFeeGwei: number }> = {
  80002: { priorityFeeGwei: 25 },
  137: { priorityFeeGwei: 30 },
};

const gwei = (n: number): bigint => parseUnits(String(n), "gwei");

/** One fee policy for every transaction Core sends: the relayer's, a company's anchor, a processor's acknowledgement. */
export class TunedProvider extends JsonRpcProvider {
  constructor(url: string, network: Networkish, options: JsonRpcApiProviderOptions, private readonly gas: GasConfig, private readonly chainId: number) {
    super(url, network, options);
  }

  override async getFeeData(): Promise<FeeData> {
    const base = await super.getFeeData();
    const floor = NETWORK_FEES[this.chainId]?.priorityFeeGwei;
    const priority = this.gas.priorityFeeGwei ?? floor;
    const tip = priority === undefined || priority === null ? base.maxPriorityFeePerGas : gwei(priority);
    let max = this.gas.maxFeeGwei === null ? base.maxFeePerGas : gwei(this.gas.maxFeeGwei);
    // The cap must cover the tip, whatever the node suggested for its own smaller tip.
    if (tip !== null && max !== null && base.maxPriorityFeePerGas !== null && this.gas.maxFeeGwei === null) max = max - base.maxPriorityFeePerGas + tip;
    if (tip !== null && max !== null && max < tip) max = tip;
    return new FeeData(base.gasPrice, max, tip);
  }

  override async estimateGas(tx: TransactionRequest): Promise<bigint> {
    const estimate = await super.estimateGas(tx);
    return (estimate * BigInt(Math.round(this.gas.limitMultiplier * 100))) / 100n;
  }
}

/** The tuple getConsent returns, as ethers decodes it. */
export interface ConsentStruct {
  status: bigint;
  grantedAt: bigint;
  expiresAt: bigint;
  updatedAt: bigint;
  noticeHash: string;
  noticeVersion: bigint;
}

/** The registry reads Core makes, typed by hand so no codegen step is needed. */
export interface RegistryReads {
  getConsent(principal: string, fiduciary: string, purposeId: string): Promise<ConsentStruct>;
  hasValidConsent(principal: string, fiduciary: string, purposeId: string): Promise<boolean>;
  nonces(principal: string): Promise<bigint>;
}

/** The AccessAnchor reads Core makes. getBatch returns [root, fromSeq, toSeq, count, at]; read by position, because ethers' `at` is Array.prototype.at. */
export interface AnchorReads {
  batchCount(fiduciary: string): Promise<bigint>;
  getBatch(fiduciary: string, index: number | bigint): Promise<[string, bigint, bigint, bigint, bigint]>;
}

export interface Chain {
  provider: JsonRpcProvider;
  deployment: Deployment;
  registry: RegistryReads;
  /** The same contract, for building a signer-connected instance (the relayer). */
  registryContract: Contract;
  anchor: AnchorReads;
  /** The same contract, for building a signer-connected instance (a company anchoring its log). */
  anchorContract: Contract;
  registryInterface: Interface;
  anchorInterface: Interface;
}

/** Connects to the node and checks that the recorded contracts really are there. */
export async function connectChain(config: Config, deployment: Deployment): Promise<Chain> {
  const network = Network.from(deployment.chainId);
  // staticNetwork: the chain id is configuration, so a stopped node is a clean error, not a retry storm.
  // pollingInterval: ethers waits for receipts by polling (default 4 s); RECEIPT_POLL_MS trades speed for RPC calls.
  // cacheTimeout -1: by default ethers reuses an identical RPC answer for 250 ms. That would let the gateway read
  // "still consented" just after a withdrawal, and let two relayed transactions in a row reuse one nonce.
  const provider = new TunedProvider(config.chainRpc, network, { staticNetwork: network, pollingInterval: config.receiptPollMs, cacheTimeout: -1 }, config.gas, deployment.chainId);
  const actual = (await provider.send("eth_chainId", []) as string).toLowerCase();
  if (BigInt(actual) !== BigInt(deployment.chainId)) {
    throw new Error(`Node at ${config.chainRpc} is chain ${BigInt(actual)}, deployments.json says ${deployment.chainId}`);
  }
  for (const address of [deployment.consentRegistry, deployment.accessAnchor]) {
    if ((await provider.getCode(address)) === "0x") throw new Error(`No contract at ${address}`);
  }
  const registryInterface = new Interface(loadAbi("ConsentRegistry"));
  const anchorInterface = new Interface(loadAbi("AccessAnchor"));
  const registryContract = new Contract(deployment.consentRegistry, registryInterface, provider);
  const anchorContract = new Contract(deployment.accessAnchor, anchorInterface, provider);
  return {
    provider,
    deployment,
    registry: registryContract as unknown as RegistryReads,
    registryContract,
    anchor: anchorContract as unknown as AnchorReads,
    anchorContract,
    registryInterface,
    anchorInterface,
  };
}

/** Startup helper: `pnpm demo:up` starts Core while the chain is still deploying, so wait instead of dying. */
export async function waitForChain(config: Config, timeoutMs = 120_000, log = console.log): Promise<Chain> {
  const deadline = Date.now() + timeoutMs;
  let lastNote = 0;
  let delay = 1000;
  for (;;) {
    let reason: string;
    try {
      const deployment = readDeployment(config);
      if (deployment) return await connectChain(config, deployment);
      reason = `no "${config.chainNetwork}" entry in shared/deployments.json`;
    } catch (err) {
      reason = err instanceof Error ? err.message.split("\n")[0]! : String(err);
    }
    if (Date.now() > deadline) throw new Error(`Chain not ready after ${timeoutMs / 1000}s: ${reason}`);
    if (Date.now() - lastNote > 5000) {
      log(`Waiting for the chain at ${config.chainRpc} (${reason})`);
      lastNote = Date.now();
    }
    await new Promise((r) => setTimeout(r, delay));
    delay = Math.min(delay * 2, config.production ? config.rpcBackoffMaxMs : 2000); // a rate-limited RPC needs room, a local node that is starting does not
  }
}

// --- error mapping (trd.md §6.6) ---

const REVERTS: Record<string, [status: number, code: string]> = {
  InvalidSignature: [400, "BAD_SIGNATURE"],
  InvalidNonce: [409, "BAD_NONCE"],
  SignatureExpired: [400, "DEADLINE_PASSED"],
  InvalidExpiry: [400, "BAD_EXPIRY"],
  UnknownPurpose: [404, "PURPOSE_NOT_FOUND"],
  WrongFiduciary: [400, "WRONG_FIDUCIARY"],
  PurposeInactive: [409, "PURPOSE_INACTIVE"],
  NotActive: [409, "NOT_ACTIVE"],
};

/**
 * Turns whatever ethers threw into the HttpError the client should see. Reads decode custom errors
 * themselves; a failed gas estimation on a write only carries the raw revert data, so `iface`
 * decodes that.
 */
export function toHttpError(err: unknown, iface?: Interface): HttpError {
  if (err instanceof HttpError) return err;
  if (isError(err, "CALL_EXCEPTION")) {
    const name = err.revert?.name ?? (err.data ? iface?.parseError(err.data)?.name : undefined);
    const mapped = name ? REVERTS[name] : undefined;
    if (mapped) return new HttpError(mapped[0], mapped[1], `Contract rejected the request (${name})`);
    return new HttpError(502, "CHAIN_ERROR", `Contract call failed${name ? ` (${name})` : ""}`);
  }
  return new HttpError(503, "LEDGER_UNAVAILABLE", "Could not reach the ledger");
}

// --- relayer ---

/**
 * Pays gas for signed user actions. Transactions go out one at a time so concurrent requests
 * cannot collide on the account nonce. The relayer cannot forge consent: the contract checks the
 * principal's signature, not the sender.
 */
export class Relayer {
  readonly wallet: Wallet;
  private readonly registry: Contract;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(chain: Chain, privateKey: string) {
    this.wallet = new Wallet(privateKey, chain.provider);
    this.registry = chain.registryContract.connect(this.wallet) as Contract;
  }

  get address(): string {
    return this.wallet.address;
  }

  /** Sends a registry write and waits for it to be mined. */
  send(method: "grantConsent" | "withdrawConsent", args: unknown[]): Promise<TransactionReceipt> {
    const run = async (): Promise<TransactionReceipt> => {
      try {
        const tx = await this.registry.getFunction(method)(...args);
        const receipt = (await tx.wait()) as TransactionReceipt | null;
        if (!receipt || receipt.status !== 1) throw new HttpError(502, "CHAIN_ERROR", "Transaction was not mined successfully");
        return receipt;
      } catch (err) {
        const mapped = toHttpError(err, this.registry.interface);
        // Contract rejections are the user's doing; anything else is ours to know about.
        if (mapped.status >= 500) console.warn(`[relayer] ${method} failed:`, err instanceof Error ? err.message : err);
        throw mapped;
      }
    };
    const result = this.queue.then(run, run);
    this.queue = result.catch(() => undefined);
    return result;
  }
}
