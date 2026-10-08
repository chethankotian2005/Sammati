// Test rig: the real service, vault and enclave, with consent, events, webhooks and the access log replaced by recorders.
import { Wallet } from "ethers";
import { seal, handleOf, submitMessage, type Envelope } from "@sammati/shared/src/envelope";
import { SEED_FIDUCIARIES, demoApiKey, type Hex, type ReasonCode, type VaultEvent } from "@sammati/shared";
import { readConfig, type ProcessorConfig } from "../src/config";
import type { ConsentReader, ConsentVerdict } from "../src/consent";
import { Enclave } from "../src/enclave";
import { ProcessorService, type AccessLogger, type CompanyNotifier, type EventSink } from "../src/service";
import { Vault } from "../src/vault";

export const PAN = "ABCDE1234F";
export const PROFILE = { incomeBand: "6-9 LPA", pan: PAN, score: 742 };
export const QUICKLOAN = SEED_FIDUCIARIES[0]!.address.toLowerCase() as Hex;
export const MEDICARE = SEED_FIDUCIARIES[1]!.address.toLowerCase() as Hex;
export const QL_KEY = demoApiKey("quickloan");
export const MC_KEY = demoApiKey("medicare");

export class FakeConsent implements ConsentReader {
  /** "principal|fiduciary|purpose" -> verdict; anything unlisted is NO_CONSENT. */
  verdicts = new Map<string, ConsentVerdict>();
  unavailable = false;
  calls = 0;

  private key = (p: string, f: string, c: string) => `${p.toLowerCase()}|${f.toLowerCase()}|${c}`;
  allow(p: string, f: string, c: string): void {
    this.verdicts.set(this.key(p, f, c), { valid: true });
  }
  deny(p: string, f: string, c: string, reason: ReasonCode): void {
    this.verdicts.set(this.key(p, f, c), { valid: false, reason });
  }
  async check(p: string, f: string, c: string): Promise<ConsentVerdict> {
    this.calls++;
    if (this.unavailable) return { valid: false, reason: "LEDGER_UNAVAILABLE" };
    return this.verdicts.get(this.key(p, f, c)) ?? { valid: false, reason: "NO_CONSENT" };
  }
}

export interface LogRecord {
  fiduciary: Hex;
  purpose: string;
  principal: Hex;
  decision: "ALLOWED" | "BLOCKED";
  reason: string;
  id: string;
}

export function rig(overrides: Partial<ProcessorConfig> = {}, privateKey: Uint8Array | null = null) {
  const config: ProcessorConfig = { ...readConfig({}), dbPath: ":memory:", ...overrides };
  const vault = new Vault(":memory:");
  const enclave = new Enclave(privateKey);
  const consent = new FakeConsent();
  const events: VaultEvent[] = [];
  const webhooks: Array<Parameters<CompanyNotifier["notify"]>> = [];
  const logs: LogRecord[] = [];
  const sink: EventSink = { emit: (e) => void events.push(e) };
  const notifier: CompanyNotifier = { notify: (f, p) => void webhooks.push([f, p]) };
  const logger: AccessLogger = {
    logAccess: (fiduciary, entry) => {
      const id = `00000000-0000-4000-8000-${String(logs.length).padStart(12, "0")}`;
      logs.push({ fiduciary, id, purpose: entry.purpose, principal: entry.principal, decision: entry.decision, reason: entry.reason });
      return id;
    },
  };
  const service = new ProcessorService(config, vault, enclave, consent, sink, notifier, logger);
  const wallet = Wallet.createRandom();
  const principal = wallet.address.toLowerCase() as Hex;

  /** What the wallet does: seal the profile for this purpose, sign the submission. */
  async function walletSubmission(purposeCode = "credit_check", fiduciary: Hex = QUICKLOAN, payload: unknown = PROFILE, requestId = `req-${Math.random().toString(36).slice(2, 12)}`) {
    const envelope: Envelope = seal(payload, enclave.publicKey, { fiduciary, principal, purposeCode });
    const signature = await wallet.signMessage(submitMessage(handleOf(envelope), requestId));
    return { principal, fiduciary, purposeCode, envelope, requestId, signature };
  }

  async function submitted(purposeCode = "credit_check", fiduciary: Hex = QUICKLOAN) {
    consent.allow(principal, fiduciary, purposeCode);
    const body = await walletSubmission(purposeCode, fiduciary);
    const result = await service.submit(body);
    return { ...result, body };
  }

  const evaluateBody = (handle: Hex, purposeCode = "credit_check", fiduciary: Hex = QUICKLOAN) => ({ handle, fiduciary, purposeCode, action: "loan_decision" });

  return { config, vault, enclave, consent, events, webhooks, logs, service, wallet, principal, walletSubmission, submitted, evaluateBody };
}
