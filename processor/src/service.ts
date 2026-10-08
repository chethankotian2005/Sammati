// The Processor's logic (trd.md §6.7), free of HTTP so it can be tested directly. Plaintext exists in exactly one
// place, Enclave.decide; nothing in this file ever holds, logs or returns it.
import { getBytes, isAddress, verifyMessage } from "ethers";
import {
  EnvelopeError,
  ciphertextHashOf,
  envelopeBytes,
  handleOf,
  parseEnvelope,
  submitMessage,
  type Envelope,
} from "@sammati/shared/src/envelope";
import type { Hex, LoanDecision, ReasonCode, VaultEraseCause, VaultEvent } from "@sammati/shared";
import type { ConsentReader, ConsentVerdict } from "./consent";
import type { Enclave } from "./enclave";
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
  logAccess(fiduciary: Hex, entry: { purpose: string; principal: Hex; decision: "ALLOWED" | "BLOCKED"; reason: "OK" | ReasonCode; latencyMs: number }): string;
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
const EVALUATE_ENDPOINT = "POST /v1/processor/evaluate";

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
    return { principal: row.principal, fiduciary: row.fiduciary, purposeCode: row.purposeCode, handle: row.handle, at: this.seconds() };
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

    let envelope: Envelope;
    try {
      envelope = parseEnvelope(o.envelope);
    } catch (err) {
      throw new ApiFailure(400, "BAD_ENVELOPE", err instanceof EnvelopeError ? err.message : "The envelope is not valid");
    }
    const handle = handleOf(envelope);

    let signer: string;
    try {
      signer = verifyMessage(submitMessage(handle, requestId), String(o.signature)).toLowerCase();
    } catch {
      throw new ApiFailure(400, "BAD_SIGNATURE", "The signature is not valid");
    }
    if (signer !== principal) throw new ApiFailure(400, "BAD_SIGNATURE", "The envelope was not signed by the principal");

    const ctx = { principal, fiduciary, purposeCode, handle };
    this.events.emit({ event: "vault.encrypted", ...this.base(ctx), ciphertextHash: ciphertextHashOf(envelope), sizeBytes: envelopeBytes(envelope).length });

    // A replay of an earlier submission, even one since erased, must not resurrect data.
    const existing = this.vault.get(handle);
    if (existing) return { created: false, handle, ciphertextHash: existing.ciphertextHash };

    const verdict = await this.consent.check(principal, fiduciary, purposeCode);
    if (!verdict.valid) throw refusal(verdict.reason);

    const blob = Buffer.from(envelopeBytes(envelope));
    const ciphertextHash = ciphertextHashOf(envelope);
    const older = this.vault.live(principal, fiduciary, purposeCode);
    try {
      this.vault.insert({ handle, principal, fiduciary, purposeCode, ciphertextHash, ciphertext: blob, requestId, createdAt: this.seconds() });
    } catch {
      // A concurrent identical submission won the race: same handle, same answer.
      const winner = this.vault.get(handle);
      if (winner) return { created: false, handle, ciphertextHash: winner.ciphertextHash };
      throw new ApiFailure(500, "INTERNAL", "Could not store the envelope");
    }
    for (const row of older) this.erase(row, "superseded");
    this.events.emit({ event: "vault.stored", ...this.base(ctx), ciphertextHash, sizeBytes: blob.length });
    this.companies.notify(fiduciary, { event: "stored", handle, principal, purposeCode, ciphertextHash });
    return { created: true, handle, ciphertextHash };
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
      createdAt: row.createdAt,
      erasedAt: row.erasedAt,
      envelope: row.ciphertext ? (JSON.parse(row.ciphertext.toString("utf8")) as Envelope) : null,
    };
  }

  // --- evaluate (V-03) ---

  async evaluate(apiKey: string | undefined, body: unknown): Promise<EvaluateResult> {
    const started = this.clock();
    const company = apiKey ? this.config.apiKeys.get(apiKey) : undefined;
    if (!company) throw new ApiFailure(401, "UNAUTHORIZED", "A valid x-sammati-api-key is required");

    const o = record(body);
    if (address(o.fiduciary, "fiduciary") !== company) throw new ApiFailure(403, "WRONG_FIDUCIARY", "The API key belongs to another company");
    if (o.action !== "loan_decision") throw new ApiFailure(400, "UNSUPPORTED_ACTION", 'Only "loan_decision" is supported');
    if (typeof o.purposeCode !== "string" || !CODE.test(o.purposeCode)) throw new ApiFailure(400, "BAD_REQUEST", '"purposeCode" must be a short code such as credit_check');
    const purposeCode = o.purposeCode;

    const row = typeof o.handle === "string" && /^0x[0-9a-f]{64}$/.test(o.handle) ? this.vault.get(o.handle) : undefined;
    // Another company's handle and a made-up one look the same on purpose.
    if (!row || row.fiduciary !== company) throw new ApiFailure(404, "HANDLE_NOT_FOUND", "No vault entry has that handle");

    const ctx = { principal: row.principal, fiduciary: row.fiduciary, purposeCode: row.purposeCode, handle: row.handle };
    this.events.emit({ event: "processor.requested", ...this.base(ctx), action: "loan_decision", requestedAt: this.clock() });

    const log = (decision: "ALLOWED" | "BLOCKED", reason: "OK" | ReasonCode): string =>
      this.logger.logAccess(company, { purpose: purposeCode, principal: row.principal, decision, reason, latencyMs: this.clock() - started });
    const decided = (outcome: "approved" | "declined" | "blocked" | "error", limit: number | null, reasonCodes: string[], entryId: string) =>
      this.events.emit({ event: "processor.decided", ...this.base(ctx), decision: outcome, limit, reasonCodes, entryId, durationMs: this.clock() - started });

    // Consent for the purpose the company names, read from the chain now. An envelope submitted for one purpose
    // is refused for another: it is also bound to it cryptographically (AAD), so this is the second lock.
    const verdict = await this.consent.check(row.principal, row.fiduciary, purposeCode);
    const reason: ReasonCode | null = !verdict.valid ? verdict.reason : purposeCode !== row.purposeCode ? "NO_CONSENT" : null;
    if (reason) {
      const entryId = log("BLOCKED", reason);
      decided("blocked", null, [reason], entryId);
      // Only the consent behind this very data decides erasure, and never an outage.
      const cause = ERASE_CAUSE[reason];
      if (cause && purposeCode === row.purposeCode && !verdict.valid) this.erase(row, cause);
      throw refusal(reason, entryId);
    }

    if (row.erasedAt !== null || !row.ciphertext) {
      const entryId = log("ALLOWED", "OK");
      decided("error", null, ["VAULT_ERASED"], entryId);
      throw new ApiFailure(410, "VAULT_ERASED", "The stored data was erased; the customer must send it again", entryId);
    }

    this.events.emit({ event: "processor.decrypting", ...this.base(ctx), decryptingAt: this.clock() });
    let decision: LoanDecision;
    try {
      decision = this.enclave.decide(JSON.parse(row.ciphertext.toString("utf8")) as Envelope, { principal: row.principal, fiduciary: row.fiduciary, purposeCode: row.purposeCode });
    } catch {
      // Authentication failed (edited ciphertext, another key) or the payload was not a profile: an error, never a guess.
      const entryId = log("ALLOWED", "OK");
      decided("error", null, ["CIPHERTEXT_INVALID"], entryId);
      throw new ApiFailure(422, "CIPHERTEXT_INVALID", "The stored data could not be opened", entryId);
    }
    const entryId = log("ALLOWED", "OK");
    decided(decision.decision, decision.limit, decision.reasonCodes, entryId);
    return { ...decision, entryId };
  }

  // --- erasure (V-04) ---

  erase(row: VaultRow, cause: VaultEraseCause): boolean {
    if (!this.vault.erase(row.handle, cause, this.seconds())) return false;
    this.events.emit({ event: "vault.erased", ...this.base(row), cause });
    // A superseded copy is replaced by a newer one, which the company already heard about.
    if (cause !== "superseded") this.companies.notify(row.fiduciary, { event: "erased", handle: row.handle, principal: row.principal, purposeCode: row.purposeCode, ciphertextHash: row.ciphertextHash });
    return true;
  }

  /** Re-reads consent from the chain for one live row; erases it if consent is gone. An unreadable chain erases nothing. */
  async recheck(row: VaultRow): Promise<void> {
    const verdict: ConsentVerdict = await this.consent.check(row.principal, row.fiduciary, row.purposeCode);
    if (verdict.valid) return;
    const cause = ERASE_CAUSE[verdict.reason];
    if (cause) this.erase(row, cause);
  }

  async recheckFor(principal: string, fiduciary: string, purposeCode: string): Promise<void> {
    for (const row of this.vault.live(principal, fiduciary, purposeCode)) await this.recheck(row);
  }

  /** Covers expiry (no event announces it) and any event the Core socket missed. */
  async sweep(): Promise<void> {
    for (const row of this.vault.allLive()) await this.recheck(row);
  }

  // --- demo controls (DEMO_MODE) ---

  /** Flips one bit of the stored ciphertext, like someone editing the database. Returns false if there is nothing live to edit. */
  tamper(handle: string): boolean {
    const row = this.vault.get(handle);
    if (!row?.ciphertext) return false;
    const envelope = JSON.parse(row.ciphertext.toString("utf8")) as Envelope;
    const bytes = getBytes(envelope.ciphertext);
    bytes[0] = (bytes[0] ?? 0) ^ 0x01;
    const edited = { ...envelope, ciphertext: "0x" + Buffer.from(bytes).toString("hex") };
    return this.vault.overwrite(handle, Buffer.from(JSON.stringify(edited)));
  }

  reset(): void {
    this.vault.clear();
  }
}
