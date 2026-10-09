// The Processor's logic (trd.md §6.7), free of HTTP so it can be tested directly. Plaintext exists in exactly one
// place, Enclave.decide; nothing in this file ever holds, logs or returns it.
import { isAddress, verifyMessage } from "ethers";
import {
  EnvelopeError,
  ciphertextHashOf,
  envelopeBytes,
  handleOf,
  parseEnvelope,
  submitMessage,
  type Envelope,
} from "@sammati/shared/src/envelope";
import { categoriesOfFields, type Hex, type LoanDecision, type ProcessorOutcome, type ReasonCode, type VaultEraseCause, type VaultEvent } from "@sammati/shared";
import type { ConsentReader, ConsentVerdict } from "./consent";
import type { Enclave } from "./enclave";
import type { Application, Scored } from "./rules";
import type { ProcessorConfig } from "./config";
import type { Vault, VaultRow } from "./vault";

/** Everything the Processor tells the outside world about a use of data goes through these three, none of which can carry plaintext. */
export interface EventSink {
  emit(event: VaultEvent): void;
}
export interface CompanyNotifier {
  notify(fiduciary: Hex, payload: { event: "stored" | "erased"; handle: Hex; principal: Hex; purposeCode: string; ciphertextHash: Hex }): void;
}
export interface AccessLogger {
  /** Appends to the company's hash-chained access log and returns the entry id (trd.md §7, `logAccess`). */
  logAccess(
    fiduciary: Hex,
    entry: { purpose: string; principal: Hex; decision: "ALLOWED" | "BLOCKED"; reason: "OK" | ReasonCode; latencyMs: number; dataCategories: string[]; outcome: string },
  ): string;
}

/** An answer that is not a 200. 451 carries `code` as the consent reason, like the gateway. */
export class ApiFailure extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly entryId?: string,
  ) {
    super(message);
  }
}

const REFUSAL_MESSAGES: Record<ReasonCode, string> = {
  CONSENT_WITHDRAWN: "The user withdrew consent for this purpose.",
  CONSENT_EXPIRED: "The user's consent for this purpose has expired.",
  NO_CONSENT: "The user has not given consent for this purpose.",
  LEDGER_UNAVAILABLE: "Consent could not be verified, so access is blocked.",
  NO_PRINCIPAL: "The request did not identify a data principal.",
};
const ERASE_CAUSE: Partial<Record<ReasonCode, VaultEraseCause>> = {
  CONSENT_WITHDRAWN: "withdrawn",
  CONSENT_EXPIRED: "expired",
  NO_CONSENT: "no_consent",
};
const CODE = /^[a-z][a-z0-9_]{0,63}$/;
const REQUEST_ID = /^[A-Za-z0-9_-]{8,64}$/;
const HANDLE = /^0x[0-9a-f]{64}$/;
const MAX_HANDLES = 4;
const MAX_VERSION = 1_000_000;

/** The customer's request (trd.md §6.13): whole INR 10,000 to 5,000,000 over whole months 6 to 60, or none. */
function parseApplication(v: unknown): Application | undefined {
  if (v === undefined) return undefined;
  const a = record(v);
  const { amount, tenureMonths } = a;
  const ok = (n: unknown, lo: number, hi: number): n is number => typeof n === "number" && Number.isInteger(n) && n >= lo && n <= hi;
  if ((amount !== undefined && !ok(amount, 10_000, 5_000_000)) || (tenureMonths !== undefined && !ok(tenureMonths, 6, 60))) {
    throw new ApiFailure(400, "BAD_APPLICATION", "amount is 10,000 to 5,000,000 INR and tenureMonths is 6 to 60, both whole numbers");
  }
  return { amount: amount as number | undefined, tenureMonths: tenureMonths as number | undefined };
}

const refusal = (reason: ReasonCode, entryId?: string): ApiFailure => new ApiFailure(451, reason, REFUSAL_MESSAGES[reason], entryId);
const record = (v: unknown): Record<string, unknown> => {
  if (typeof v !== "object" || v === null || Array.isArray(v)) throw new ApiFailure(400, "BAD_REQUEST", "The body must be a JSON object");
  return v as Record<string, unknown>;
};
const address = (v: unknown, field: string): Hex => {
  if (typeof v !== "string" || !isAddress(v)) throw new ApiFailure(400, "BAD_REQUEST", `"${field}" must be an address`);
  return v.toLowerCase() as Hex;
};

export interface SubmitResult {
  created: boolean;
  handle: Hex;
  ciphertextHash: Hex;
  version: number;
}

export interface EvaluateResult extends LoanDecision {
  entryId: string;
}

export interface VaultView {
  handle: Hex;
  principal: Hex;
  fiduciary: Hex;
  purposeCode: string;
  ciphertextHash: Hex;
  status: "stored" | "erased";
  version: number;
  createdAt: number;
  erasedAt: number | null;
  /** The stored envelope: ciphertext, never plaintext. Null once erased. */
  envelope: Envelope | null;
}

export class ProcessorService {
  constructor(
    private readonly config: ProcessorConfig,
    private readonly vault: Vault,
    private readonly enclave: Enclave,
    private readonly consent: ConsentReader,
    private readonly events: EventSink,
    private readonly companies: CompanyNotifier,
    private readonly logger: AccessLogger,
    private readonly clock: () => number = () => Date.now(),
  ) {}

  get publicKey(): Hex {
    return this.enclave.publicKey;
  }

  private seconds(): number {
    return Math.floor(this.clock() / 1000);
  }

  private base(row: Pick<VaultRow, "principal" | "fiduciary" | "purposeCode" | "handle">) {
    const now = this.clock();
    return { principal: row.principal, fiduciary: row.fiduciary, purposeCode: row.purposeCode, handle: row.handle, at: Math.floor(now / 1000), atMs: now };
  }

  // --- submit (V-02) ---

  async submit(body: unknown): Promise<SubmitResult> {
    const o = record(body);
    const principal = address(o.principal, "principal");
    const fiduciary = address(o.fiduciary, "fiduciary");
    const purposeCode = typeof o.purposeCode === "string" && CODE.test(o.purposeCode) ? o.purposeCode : null;
    const requestId = typeof o.requestId === "string" && REQUEST_ID.test(o.requestId) ? o.requestId : null;
    if (!purposeCode) throw new ApiFailure(400, "BAD_REQUEST", '"purposeCode" must be a short code such as credit_check');
    if (!requestId) throw new ApiFailure(400, "BAD_REQUEST", '"requestId" must be 8 to 64 letters, digits, - or _');
    const version = typeof o.version === "number" && Number.isInteger(o.version) && o.version >= 1 && o.version <= MAX_VERSION ? o.version : null;
    if (version === null) throw new ApiFailure(400, "BAD_REQUEST", `"version" must be a whole number from 1 to ${MAX_VERSION}`);
    if (o.consentRef !== undefined && !(typeof o.consentRef === "string" && /^0x[0-9a-fA-F]{64}$/.test(o.consentRef))) {
      throw new ApiFailure(400, "BAD_REQUEST", '"consentRef" must be a 32-byte hex notice hash');
    }
    const consentRef = typeof o.consentRef === "string" ? o.consentRef.toLowerCase() : null;

    let envelope: Envelope;
    try {
      envelope = parseEnvelope(o.envelope);
    } catch (err) {
      throw new ApiFailure(400, "BAD_ENVELOPE", err instanceof EnvelopeError ? err.message : "The envelope is not valid");
    }
    const handle = handleOf(envelope);

    let signer: string;
    try {
      signer = verifyMessage(submitMessage(handle, requestId, version), String(o.signature)).toLowerCase();
    } catch {
      throw new ApiFailure(400, "BAD_SIGNATURE", "The signature is not valid");
    }
    if (signer !== principal) throw new ApiFailure(400, "BAD_SIGNATURE", "The envelope was not signed by the principal");

    const ctx = { principal, fiduciary, purposeCode, handle };
    this.events.emit({ event: "vault.encrypted", ...this.base(ctx), ciphertextHash: ciphertextHashOf(envelope), sizeBytes: envelopeBytes(envelope).length });

    // A replay of an earlier submission, even one since erased, must not resurrect data.
    const existing = this.vault.get(handle);
    if (existing) return { created: false, handle, ciphertextHash: existing.ciphertextHash, version: existing.version };

    // A correction is a newer version; an equal or lower one is a stale client (V-08).
    if (version <= this.vault.maxVersion(principal, fiduciary, purposeCode)) throw new ApiFailure(409, "STALE_VERSION", "A newer version of these details was already sent");

    const verdict = await this.consent.check(principal, fiduciary, purposeCode);
    if (!verdict.valid) throw refusal(verdict.reason);
    // Bound to the notice the customer signed: a different notice means this is not the consent they agreed to.
    if (consentRef && verdict.noticeHash && verdict.noticeHash.toLowerCase() !== consentRef) throw new ApiFailure(409, "CONSENT_MISMATCH", "The consent on the ledger is for a different notice");

    const blob = Buffer.from(envelopeBytes(envelope));
    const ciphertextHash = ciphertextHashOf(envelope);
    const older = this.vault.live(principal, fiduciary, purposeCode);
    try {
      this.vault.insert({ handle, principal, fiduciary, purposeCode, ciphertextHash, ciphertext: blob, requestId, createdAt: this.seconds(), version, consentRef });
    } catch {
      // A concurrent identical submission won the race: same handle, same answer.
      const winner = this.vault.get(handle);
      if (winner) return { created: false, handle, ciphertextHash: winner.ciphertextHash, version: winner.version };
      throw new ApiFailure(500, "INTERNAL", "Could not store the envelope");
    }
    for (const row of older) this.erase(row, "superseded");
    this.events.emit({ event: "vault.stored", ...this.base(ctx), ciphertextHash, sizeBytes: blob.length, version });
    this.companies.notify(fiduciary, { event: "stored", handle, principal, purposeCode, ciphertextHash });
    return { created: true, handle, ciphertextHash, version };
  }

  /** Metadata and ciphertext for a handle. There is no way to ask for plaintext. */
  view(handle: string): VaultView {
    const row = /^0x[0-9a-f]{64}$/.test(handle) ? this.vault.get(handle) : undefined;
    if (!row) throw new ApiFailure(404, "HANDLE_NOT_FOUND", "No vault entry has that handle");
    return {
      handle: row.handle,
      principal: row.principal,
      fiduciary: row.fiduciary,
      purposeCode: row.purposeCode,
      ciphertextHash: row.ciphertextHash,
      status: row.erasedAt === null ? "stored" : "erased",
      version: row.version,
      createdAt: row.createdAt,
      erasedAt: row.erasedAt,
      envelope: row.ciphertext ? (JSON.parse(row.ciphertext.toString("utf8")) as Envelope) : null,
    };
  }

  /** A company says where to tell it about stored and erased entries (trd.md §6.7). Memory only: it registers again after a restart. */
  async registerCallback(apiKey: string | undefined, body: unknown): Promise<void> {
    const company = apiKey ? await this.companyOf(apiKey) : undefined;
    if (!company) throw new ApiFailure(401, "UNAUTHORIZED", "A valid x-sammati-api-key is required");
    const url = record(body).url;
    if (typeof url !== "string" || url.length > 300 || !/^https?:\/\/[^\s]+$/.test(url)) throw new ApiFailure(400, "BAD_REQUEST", '"url" must be an http or https address');
    this.config.callbacks[company] = url;
    this.config.registeredKeys.set(company, apiKey!);
  }

  // --- evaluate (V-03) ---

  /** Companies registered after the Processor started are asked of Core, which alone knows their keys (trd.md §6.2a). */
  private async companyOf(apiKey: string): Promise<Hex | undefined> {
    const configured = this.config.apiKeys.get(apiKey);
    if (configured) return configured;
    try {
      const res = await fetch(`${this.config.coreUrl}/v1/gateway/whoami`, { headers: { "x-sammati-api-key": apiKey }, signal: AbortSignal.timeout(3000) });
      if (!res.ok) return undefined;
      const { fiduciary } = (await res.json()) as { fiduciary?: string };
      if (typeof fiduciary !== "string" || !isAddress(fiduciary)) return undefined;
      const company = fiduciary.toLowerCase() as Hex;
      this.config.registeredKeys.set(company, apiKey);
      return company;
    } catch {
      return undefined; // Core unreachable: an unknown key stays unknown, so the call fails closed
    }
  }

  async evaluate(apiKey: string | undefined, body: unknown): Promise<EvaluateResult> {
    const started = this.clock();
    const company = apiKey ? await this.companyOf(apiKey) : undefined;
    if (!company) throw new ApiFailure(401, "UNAUTHORIZED", "A valid x-sammati-api-key is required");

    const o = record(body);
    if (address(o.fiduciary, "fiduciary") !== company) throw new ApiFailure(403, "WRONG_FIDUCIARY", "The API key belongs to another company");
    if (o.action !== "loan_decision") throw new ApiFailure(400, "UNSUPPORTED_ACTION", 'Only "loan_decision" is supported');
    if (typeof o.purposeCode !== "string" || !CODE.test(o.purposeCode)) throw new ApiFailure(400, "BAD_REQUEST", '"purposeCode" must be a short code such as credit_check');
    const purposeCode = o.purposeCode;
    const application = parseApplication(o.application);
    const wanted = o.handles !== undefined ? o.handles : o.handle !== undefined ? [o.handle] : undefined;
    if (!Array.isArray(wanted) || wanted.length < 1 || wanted.length > MAX_HANDLES || !wanted.every((h) => typeof h === "string" && HANDLE.test(h))) {
      throw new ApiFailure(400, "BAD_REQUEST", `"handle" or "handles" must name 1 to ${MAX_HANDLES} vault handles`);
    }

    const rows = [...new Set(wanted as string[])].map((h) => this.vault.get(h));
    // Another company's handle, a made-up one and one of another customer look the same on purpose.
    if (rows.some((r) => !r || r.fiduciary !== company) || new Set(rows.map((r) => r!.principal)).size !== 1) {
      throw new ApiFailure(404, "HANDLE_NOT_FOUND", "No vault entry has that handle");
    }
    const held = rows as VaultRow[];
    const row = held[0]!;

    const ctx = { principal: row.principal, fiduciary: row.fiduciary, purposeCode: row.purposeCode, handle: row.handle };
    this.events.emit({ event: "processor.requested", ...this.base(ctx), action: "loan_decision", requestedAt: this.clock() });

    const log = (decision: "ALLOWED" | "BLOCKED", reason: "OK" | ReasonCode, outcome: ProcessorOutcome, dataCategories: string[] = []): string =>
      this.logger.logAccess(company, { purpose: purposeCode, principal: row.principal, decision, reason, latencyMs: this.clock() - started, dataCategories, outcome });
    const decided = (outcome: ProcessorOutcome, limit: number | null, rateBps: number | null, dataCategories: string[], reasonCodes: string[], entryId: string) =>
      this.events.emit({ event: "processor.decided", ...this.base(ctx), decision: outcome, limit, rateBps, dataCategories, reasonCodes, entryId, durationMs: this.clock() - started });

    // Consent for the purpose the company names, read from the chain now. An envelope submitted for one purpose
    // is refused for another: it is also bound to it cryptographically (AAD), so this is the second lock.
    const verdict = await this.consent.check(row.principal, row.fiduciary, purposeCode);
    const reason: ReasonCode | null = !verdict.valid ? verdict.reason : held.some((r) => r.purposeCode !== purposeCode) ? "NO_CONSENT" : null;
    if (reason) {
      const entryId = log("BLOCKED", reason, "blocked");
      decided("blocked", null, null, [], [reason], entryId);
      // Only the consent behind this very data decides erasure, and never an outage.
      const cause = !verdict.valid && held.every((r) => r.purposeCode === purposeCode) ? this.eraseCauseFor(verdict) : undefined;
      if (cause) for (const r of held) this.erase(r, cause);
      throw refusal(reason, entryId);
    }

    if (held.some((r) => r.erasedAt !== null || !r.ciphertext)) {
      const entryId = log("ALLOWED", "OK", "error");
      decided("error", null, null, [], ["VAULT_ERASED"], entryId);
      throw new ApiFailure(410, "VAULT_ERASED", "The stored data was erased; the customer must send it again", entryId);
    }

    this.events.emit({ event: "processor.decrypting", ...this.base(ctx), decryptingAt: this.clock() });
    let scored: Scored;
    try {
      scored = this.enclave.decide(
        held.map((r) => ({ envelope: JSON.parse(r.ciphertext!.toString("utf8")) as Envelope, ctx: { principal: r.principal, fiduciary: r.fiduciary, purposeCode: r.purposeCode } })),
        application,
      );
    } catch {
      // Authentication failed (edited ciphertext, another key) or the payload was not a profile: an error, never a guess.
      const entryId = log("ALLOWED", "OK", "error");
      decided("error", null, null, [], ["CIPHERTEXT_INVALID"], entryId);
      throw new ApiFailure(422, "CIPHERTEXT_INVALID", "The stored data could not be opened", entryId);
    }
    // The usage record names the categories the rules read, not everything that was opened (drd.md §4.5).
    const dataCategories = categoriesOfFields(scored.used);
    const entryId = log("ALLOWED", "OK", scored.decision.decision, dataCategories);
    decided(scored.decision.decision, scored.decision.limit, scored.decision.rateBps, dataCategories, scored.decision.reasonCodes, entryId);
    return { ...scored.decision, entryId };
  }

  // --- erasure (V-04) ---

  erase(row: VaultRow, cause: VaultEraseCause): boolean {
    if (!this.vault.erase(row.handle, cause, this.seconds())) return false;
    this.events.emit({ event: "vault.erased", ...this.base(row), cause });
    // A superseded copy is replaced by a newer one, which the company already heard about.
    if (cause !== "superseded") this.companies.notify(row.fiduciary, { event: "erased", handle: row.handle, principal: row.principal, purposeCode: row.purposeCode, ciphertextHash: row.ciphertextHash });
    return true;
  }

  /**
   * Why a refused row should be erased now, if it should. Expiry is the one reason with a grace period: the data stays
   * (unusable, every evaluate is refused) so a renewal inside the window needs no resend. An expiry whose date is not
   * known erases at once, which is the safe direction.
   */
  private eraseCauseFor(verdict: Extract<ConsentVerdict, { valid: false }>): VaultEraseCause | undefined {
    const cause = ERASE_CAUSE[verdict.reason];
    if (cause === "expired" && verdict.expiresAt !== undefined && this.seconds() < verdict.expiresAt + this.config.expiryGraceSeconds) return undefined;
    return cause;
  }

  /** Re-reads consent from the chain for one live row; erases it if consent is gone. An unreadable chain erases nothing. */
  async recheck(row: VaultRow): Promise<void> {
    const verdict: ConsentVerdict = await this.consent.check(row.principal, row.fiduciary, row.purposeCode);
    if (verdict.valid) return;
    const cause = this.eraseCauseFor(verdict);
    if (cause) this.erase(row, cause);
  }

  async recheckFor(principal: string, fiduciary: string, purposeCode: string): Promise<void> {
    for (const row of this.vault.live(principal, fiduciary, purposeCode)) await this.recheck(row);
  }

  /** Covers expiry (no event announces it) and any event the Core socket missed. */
  async sweep(): Promise<void> {
    for (const row of this.vault.allLive()) await this.recheck(row);
  }
}
