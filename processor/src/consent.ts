// Consent, read straight from the chain (trd.md §6.7): the Processor does not ask Core, so Core cannot make it
// decrypt. Anything but a clean answer is LEDGER_UNAVAILABLE, which blocks and erases nothing.
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { Contract, JsonRpcProvider, Network, type InterfaceAbi } from "ethers";
import { purposeIdOf, type Deployment, type Deployments, type Hex, type ReasonCode } from "@sammati/shared";
import type { ProcessorConfig } from "./config";

/** `expiresAt` (unix seconds) is given for CONSENT_EXPIRED, so the erasure grace period can be counted from it. */
export type ConsentVerdict = { valid: true } | { valid: false; reason: ReasonCode; expiresAt?: number };

export interface ConsentReader {
  check(principal: string, fiduciary: string, purposeCode: string): Promise<ConsentVerdict>;
}

const sharedDir = dirname(createRequire(import.meta.url).resolve("@sammati/shared/package.json"));
const STATUS_ACTIVE = 1n;
const STATUS_WITHDRAWN = 2n;
const UNAVAILABLE: ConsentVerdict = { valid: false, reason: "LEDGER_UNAVAILABLE" };

function readDeployment(config: ProcessorConfig): Deployment | null {
  if (config.deployment) return config.deployment;
  const file = resolve(sharedDir, "deployments.json");
  if (!existsSync(file)) return null;
  return (JSON.parse(readFileSync(file, "utf8")) as Deployments)[config.chainNetwork] ?? null;
}

interface RegistryReads {
  hasValidConsent(principal: string, fiduciary: string, purposeId: string): Promise<boolean>;
  getConsent(principal: string, fiduciary: string, purposeId: string): Promise<{ status: bigint; expiresAt: bigint }>;
}

export class ChainConsentReader implements ConsentReader {
  private registry: RegistryReads | null = null;

  constructor(private readonly config: ProcessorConfig) {}

  private connect(): RegistryReads | null {
    if (this.registry) return this.registry;
    const deployment = readDeployment(this.config);
    if (!deployment) return null;
    const network = Network.from(deployment.chainId);
    // cacheTimeout -1: ethers would otherwise reuse an identical answer for 250 ms, i.e. read "still consented"
    // just after a withdrawal.
    const provider = new JsonRpcProvider(this.config.chainRpc, network, { staticNetwork: network, cacheTimeout: -1 });
    const abi = JSON.parse(readFileSync(resolve(sharedDir, "abi", "ConsentRegistry.json"), "utf8")) as InterfaceAbi;
    this.registry = new Contract(deployment.consentRegistry, abi, provider) as unknown as RegistryReads;
    return this.registry;
  }

  async check(principal: string, fiduciary: string, purposeCode: string): Promise<ConsentVerdict> {
    try {
      const registry = this.connect();
      if (!registry) return UNAVAILABLE;
      const purposeId: Hex = purposeIdOf(fiduciary, purposeCode);
      if (await registry.hasValidConsent(principal, fiduciary, purposeId)) return { valid: true };
      // Not valid: say why, like the gateway does (drd.md §3).
      const { status, expiresAt } = await registry.getConsent(principal, fiduciary, purposeId);
      if (status === STATUS_ACTIVE) return { valid: false, reason: "CONSENT_EXPIRED", expiresAt: Number(expiresAt) };
      if (status === STATUS_WITHDRAWN) return { valid: false, reason: "CONSENT_WITHDRAWN" };
      return { valid: false, reason: "NO_CONSENT" };
    } catch {
      return UNAVAILABLE;
    }
  }
}
