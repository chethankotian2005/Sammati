// Test rig: the real service, vault and enclave, with consent, events, webhooks and the access log replaced by recorders.
import { Wallet, getBytes } from "ethers";
import { seal, handleOf, submitMessage, type Envelope } from "@sammati/shared/src/envelope";
import { type Hex, type ReasonCode, type VaultEvent } from "@sammati/shared";
import { TEST_COMPANIES, testApiKey } from "@sammati/test-fixtures";
import { readConfig, type ProcessorConfig } from "../src/config";
import type { ConsentReader, ConsentVerdict } from "../src/consent";
import { Enclave } from "../src/enclave";
import { ProcessorService, type AccessLogger, type CompanyNotifier, type EventSink } from "../src/service";
import { Vault } from "../src/vault";

export const PAN = "ABCDE1234F";
export const PROFILE = { incomeBand: "6-9 LPA", pan: PAN, score: 742 };
export const QUICKLOAN = TEST_COMPANIES[0]!.address.toLowerCase() as Hex;
export const MEDICARE = TEST_COMPANIES[1]!.address.toLowerCase() as Hex;
export const QL_KEY = testApiKey("quickloan");
export const MC_KEY = testApiKey("medicare");

export class ScriptedConsent implements ConsentReader {
  /** "principal|fiduciary|purpose" -> verdict; anything unlisted is NO_CONSENT. */
  verdicts = new Map<string, ConsentVerdict>();
  unavailable = false;
  calls = 0;

  private key = (p: string, f: string, c: string) => `${p.toLowerCase()}|${f.toLowerCase()}|${c}`;
  allow(p: string, f: string, c: string): void {
    this.verdicts.set(this.key(p, f, c), { valid: true });
  }
  deny(p: string, f: string, c: string, reason: ReasonCode, expiresAt?: number): void {
    this.verdicts.set(this.key(p, f, c), { valid: false, reason, ...(expiresAt === undefined ? {} : { expiresAt }) });
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

export function rig(overrides: Partial<ProcessorConfig> = {}, privateKey: Uint8Array | null = null, clock?: () => number) {
  const companyKeys = new Map(TEST_COMPANIES.map((f) => [testApiKey(f.slug), f.address.toLowerCase() as Hex]));
  const callbacks = Object.fromEntries(TEST_COMPANIES.map((f) => [f.address.toLowerCase(), `http://localhost:${f.port}/vault/events`]));
  const config: ProcessorConfig = { ...readConfig({}), apiKeys: companyKeys, callbacks, dbPath: ":memory:", ...overrides };
  const vault = new Vault(":memory:");
  const enclave = new Enclave(privateKey);
  const consent = new ScriptedConsent();
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
  const service = new ProcessorService(config, vault, enclave, consent, sink, notifier, logger, clock);
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

/** What a database administrator could do to a stored row: flip one bit of the ciphertext. Returns false if nothing is live under the handle. */
export function tamperStored(vault: Vault, handle: string): boolean {
  const row = vault.get(handle);
  if (!row?.ciphertext) return false;
  const envelope = JSON.parse(row.ciphertext.toString("utf8")) as Envelope;
  const bytes = getBytes(envelope.ciphertext);
  bytes[0] = (bytes[0] ?? 0) ^ 0x01;
  const edited = Buffer.from(JSON.stringify({ ...envelope, ciphertext: "0x" + Buffer.from(bytes).toString("hex") }));
  const db = (vault as unknown as { db: { prepare(sql: string): { run(...args: unknown[]): { changes: number } } } }).db;
  return db.prepare("UPDATE vault SET ciphertext = ? WHERE handle = ? AND erased_at IS NULL").run(edited, handle).changes > 0;
}
