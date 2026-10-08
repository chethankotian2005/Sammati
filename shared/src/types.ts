// API contracts for Core (trd.md §6). Changing anything here is a shared
// interface change: tell the other lanes.
import type { FiduciaryRegisteredEvent, FiduciaryUpdatedEvent } from "./onboarding";
import type { Eip712Domain, GrantConsent, TypedData, WithdrawConsent } from "./eip712";

// --- Primitives ---

/** Exactly these five, per AGENTS.md. */
export const REASON_CODES = [
  "CONSENT_WITHDRAWN",
  "CONSENT_EXPIRED",
  "NO_CONSENT",
  "LEDGER_UNAVAILABLE",
  "NO_PRINCIPAL",
] as const;
export type ReasonCode = (typeof REASON_CODES)[number];

/** Stored reason on a log entry; ALLOWED entries carry "OK". */
export type AccessReason = "OK" | ReasonCode;

export type Decision = "ALLOWED" | "BLOCKED";

/** Mirrors the Solidity enum Status { None, Active, Withdrawn }. */
export const STATUS = { None: 0, Active: 1, Withdrawn: 2 } as const;
export type Status = keyof typeof STATUS;

export type Locale = "en" | "hi" | "kn";
export type LocalizedText = Record<Locale, string>;

/** Hex strings: addresses and bytes32 values, 0x-prefixed. */
export type Hex = string;
/** Unix seconds. */
export type UnixSeconds = number;

export interface ApiError {
  error: { code: string; message: string };
}

export type TxStatus = "submitted" | "confirmed";
export interface TxResponse {
  txHash: Hex;
  status: TxStatus;
}

// --- Access log entry (drd.md §4.1) ---

/** The hashed form. prevHash/hash are stored beside it, not inside it. */
export interface AccessLogEntry {
  at: UnixSeconds;
  decision: Decision;
  endpoint: string;
  fiduciary: Hex;
  id: string;
  latencyMs: number;
  principal: Hex;
  purposeCode: string;
  reason: AccessReason;
  seq: number;
}

export interface StoredAccessLogEntry extends AccessLogEntry {
  prevHash: Hex;
  hash: Hex;
  batchIndex: number | null;
}

/** Header the gateway SDK sets on every response: the id of the access-log entry for that decision. */
export const ENTRY_ID_HEADER = "x-sammati-entry-id";

export interface HealthResponse {
  ok: true;
  service: "sammati-core";
  mode: "stub" | "live";
  time: UnixSeconds;
}

// --- 6.1 Consent flow ---

export interface CreateRequestBody {
  purposes: string[]; // purpose codes
  customerAlias: string;
}

/** Contents of the QR code (trd.md §6.1). */
export interface QrPayload {
  v: 1;
  core: string;
  requestId: string;
  fiduciary: Hex;
  name: string;
}

export interface CreateRequestResponse {
  requestId: string;
  qrPayload: QrPayload;
}

export interface NoticePurpose {
  id: Hex; // purposeId
  code: string;
  title: LocalizedText;
  description: LocalizedText;
  dataCategories: string[];
  retentionDays: number;
  sharesThirdParty: boolean;
  required: boolean;
}

/**
 * Wallet notice. Grants are per purpose; the wallet signs purpose i with
 * nonce = `nonce + i` (order of `purposes`), choosing expiresAt and deadline.
 */
export interface RequestNotice {
  requestId: string;
  fiduciary: { address: Hex; name: string; color: string };
  purposes: NoticePurpose[];
  noticeHash: Hex;
  noticeVersion: number;
  /** True when Core runs with DEMO_FAST_EXPIRY: the wallet then offers a 2-minute expiry (trd.md §6.12). */
  fastExpiry?: boolean;
  domain: Eip712Domain;
  typedDataTemplate: TypedData<"GrantConsent", Omit<GrantConsent, "purposeId" | "expiresAt" | "deadline">>;
  nonce: string;
}

export interface GrantRequestBody {
  request: GrantConsent;
  signature: Hex;
}
export type GrantResponse = TxResponse;

export interface WithdrawRequestBody {
  request: WithdrawConsent;
  signature: Hex;
}
export type WithdrawResponse = TxResponse;

export interface ConsentView {
  purposeId: Hex;
  code: string;
  title: LocalizedText;
  status: Status;
  grantedAt: UnixSeconds | null;
  expiresAt: UnixSeconds | null;
  updatedAt: UnixSeconds | null;
  noticeHash: Hex | null;
  lastTx: Hex | null;
  required: boolean;
}

export interface FiduciaryConsents {
  fiduciary: { address: Hex; name: string; sector: string; color: string };
  consents: ConsentView[];
}

export interface PrincipalConsentsResponse {
  principal: Hex;
  /** Current on-chain nonce (decimal string): what a WithdrawConsent from this principal must carry. */
  nonce: string;
  /** EIP-712 domain to sign a WithdrawConsent under (the notice carries the same one for grants). */
  domain: Eip712Domain;
  fiduciaries: FiduciaryConsents[];
}

export interface ActivityItem {
  id: string;
  seq: number;
  fiduciary: Hex;
  fiduciaryName: string;
  purposeCode: string;
  decision: Decision;
  reason: AccessReason;
  endpoint: string;
  at: UnixSeconds;
  anchored: boolean;
}
export interface ActivityResponse {
  principal: Hex;
  items: ActivityItem[];
}

export interface CascadeItem {
  processor: Hex;
  name: string;
  notifiedAt: UnixSeconds | null;
  ackedAt: UnixSeconds | null;
  txHash: Hex | null;
}
export interface CascadeResponse {
  principal: Hex;
  purposeId: Hex;
  processors: CascadeItem[];
}

export interface ConsentProofResponse {
  txHash: Hex;
  type: "granted" | "withdrawn";
  principal: Hex;
  fiduciary: Hex;
  purposeId: Hex;
  expiresAt: UnixSeconds | null;
  noticeHash: Hex | null;
  ledgerHead: Hex;
  blockNumber: number;
  at: UnixSeconds;
  /** Public explorer page, or null on a chain that has none (the local demo chain). */
  explorerUrl: string | null;
}

export interface AccessProofResponse {
  entry: StoredAccessLogEntry;
  merklePath: Hex[];
  merkleRoot: Hex;
  batchIndex: number;
  anchorTxHash: Hex;
  /** Public explorer page, or null on a chain that has none (the local demo chain). */
  explorerUrl: string | null;
}

// --- Data rights (W-10; trd.md §6.1) ---

export const RIGHTS_TYPES = ["access", "erasure", "grievance"] as const;
export type RightsType = (typeof RIGHTS_TYPES)[number];
export type RightsStatus = "open" | "in_progress" | "resolved";

/** A data principal's request to a company: tracked as a status record, it never touches the chain. */
export interface RightsRequest {
  id: string;
  principal: Hex;
  fiduciary: Hex;
  type: RightsType;
  note: string;
  status: RightsStatus;
  createdAt: UnixSeconds;
  updatedAt: UnixSeconds;
}

export interface CreateRightsRequestBody {
  principal: Hex;
  fiduciary: Hex;
  type: RightsType;
  note?: string;
}

export interface RightsRequestView extends RightsRequest {
  fiduciaryName: string;
}

export interface RightsResponse {
  principal: Hex;
  rights: RightsRequestView[];
}

// --- 6.2 Company and gateway ---

export interface RegisterPurposeBody {
  code: string;
  title: LocalizedText;
  description: LocalizedText;
  dataCategories: string[];
  retentionDays: number;
  sharesThirdParty: boolean;
  required: boolean;
}
export interface RegisterPurposeResponse {
  purposeId: Hex;
  txHash: Hex;
}

export interface FiduciaryPurposesResponse {
  fiduciary: Hex;
  purposes: NoticePurpose[];
}

export interface RegisterProcessorBody {
  purposeId: Hex;
  name: string;
  address: Hex;
  webhookUrl?: string;
}
export interface RegisterProcessorResponse {
  txHash: Hex;
}

export interface ConsentRow {
  principal: Hex;
  customerAlias: string | null;
  purposeId: Hex;
  purposeCode: string;
  status: Status;
  grantedAt: UnixSeconds | null;
  expiresAt: UnixSeconds | null;
  updatedAt: UnixSeconds | null;
  lastTx: Hex | null;
}
export interface FiduciaryConsentsResponse {
  fiduciary: Hex;
  rows: ConsentRow[];
}

export interface FiduciaryAccessResponse {
  fiduciary: Hex;
  items: StoredAccessLogEntry[];
}

export type GatewayLogBody = StoredAccessLogEntry;
export interface GatewayLogResponse {
  accepted: true;
  seq: number;
}

export interface ConsentStateResponse {
  principal: Hex;
  fiduciary: Hex;
  purposeId: Hex;
  status: Status;
  expiresAt: UnixSeconds | null;
  valid: boolean;
  /** Present when valid is false. */
  reason?: ReasonCode;
  /** Core clock at the time of the answer, for cache freshness. */
  checkedAt: UnixSeconds;
}

export interface ExportResponse {
  fiduciary: Hex;
  generatedAt: UnixSeconds;
  consents: ConsentRow[];
  access: StoredAccessLogEntry[];
  batches: AnchorBatchView[];
  ledgerHead: Hex;
}

// --- 6.3 Auditor ---

export type IntegrityState = "verified" | "unverified" | "tampered";

export interface Scorecard {
  fiduciary: Hex;
  /** Console route /company/<slug> (R-04). */
  slug: string;
  /** In the sandbox (R-03): only test customers can be asked. */
  sandbox: boolean;
  name: string;
  sector: string;
  color: string;
  activeConsents: number;
  withdrawnConsents: number;
  allowed: number;
  blocked: number;
  anchoredBatches: number;
  integrity: IntegrityState;
  /** ALLOWED log entries with no valid consent behind them (trd.md §6.3 for the exact rule). */
  violations: number;
  /**
   * Over withdrawals followed by at least one request: how long after the withdrawal the company
   * still allowed access. 0 means blocked from the first request after it; null means no data yet.
   */
  avgWithdrawalToBlockSeconds: number | null;
  /** Processors that have not acknowledged a withdrawal older than 30 s. */
  unacknowledgedCascades: number;
}
export interface AuditFiduciariesResponse {
  fiduciaries: Scorecard[];
}

export type LedgerEventType = "granted" | "withdrawn" | "ack" | "anchor" | "purpose";
export interface LedgerEventView {
  id: number;
  type: LedgerEventType;
  principal: Hex | null;
  fiduciary: Hex | null;
  purposeId: Hex | null;
  txHash: Hex;
  blockNumber: number;
  ledgerHead: Hex | null;
  at: UnixSeconds;
  payload: Record<string, unknown> | null;
  /** Public explorer page, or null on a chain that has none (the local demo chain). */
  explorerUrl: string | null;
}
export interface AuditLedgerResponse {
  events: LedgerEventView[];
}

export interface AnchorBatchView {
  index: number;
  merkleRoot: Hex;
  fromSeq: number;
  toSeq: number;
  count: number;
  txHash: Hex;
  at: UnixSeconds;
}

export interface BatchVerification {
  index: number;
  fromSeq: number;
  toSeq: number;
  anchoredRoot: Hex; // read from AccessAnchor on chain
  recomputedRoot: Hex; // rebuilt from stored rows
  ok: boolean;
  /** First stored row whose hash no longer matches, if any. */
  firstBadSeq: number | null;
}
/** What kind of evidence of tampering the Auditor found (trd.md §6.3). */
export type MismatchKind = "HASH_MISMATCH" | "BROKEN_LINK" | "MISSING_ENTRY" | "ROOT_MISMATCH";

/** The first record that does not check out. seq/entryId are null when no single row can be blamed. */
export interface Mismatch {
  kind: MismatchKind;
  seq: number | null;
  entryId: string | null;
  batchIndex: number | null;
}

export interface VerifyResponse {
  fiduciary: Hex;
  ok: boolean;
  chainOk: boolean; // hash chain recomputes end to end
  gaps: number[]; // missing seq numbers
  batches: BatchVerification[];
  /** Null when everything checks out. */
  firstMismatch: Mismatch | null;
  verifiedAt: UnixSeconds;
}

export interface AuditReportResponse {
  fiduciary: Hex;
  generatedAt: UnixSeconds;
  scorecard: Scorecard;
  verification: VerifyResponse;
  recentEvents: LedgerEventView[];
}

// --- 6.4 Demo controls (DEMO_MODE=true only) ---

export interface TamperResponse {
  fiduciary: Hex;
  seq: number;
  field: keyof AccessLogEntry;
  before: unknown;
  after: unknown;
}

export interface DemoFireBody {
  fiduciary: Hex;
  purposeCode: string;
  principal: Hex;
  endpoint?: string;
  /** "loan_decision" (QuickLoan, credit_check) calls the apply endpoint instead of the credit-profile one (trd.md §6.4). */
  action?: "loan_decision";
}
export interface DemoFireResponse {
  decision: Decision;
  reason: AccessReason;
  entryId: string;
  /** Only for the two QuickLoan endpoints that return no personal data by construction (trd.md §6.4). */
  result?: VaultView | LoanDecision;
}

export interface DemoAnchorBody {
  /** One company, or all of them when omitted. */
  fiduciary?: Hex;
}

export interface DemoAnchoredBatch {
  fiduciary: Hex;
  index: number;
  fromSeq: number;
  toSeq: number;
  count: number;
  merkleRoot: Hex;
  txHash: Hex;
}

/** The batches anchored by this call; empty when nothing was waiting. */
export interface DemoAnchorResponse {
  batches: DemoAnchoredBatch[];
}

export interface DemoResetResponse {
  ok: true;
}

// --- 6.5 WebSocket /ws ---

/** "principal:0x..", "fiduciary:0x..", or "auditor". */
export type WsTopic = string;
export interface WsSubscribe {
  sub: WsTopic[];
}

/** Core's answer to a subscribe message: the topics are active from here on (trd.md §6.5). */
export interface WsAck {
  event: "subscribed";
  topics: WsTopic[];
}

export interface ConsentUpdatedEvent {
  event: "consent.updated";
  principal: Hex;
  fiduciary: Hex;
  purposeId: Hex;
  purposeCode: string;
  status: Status;
  expiresAt: UnixSeconds | null;
  txHash: Hex;
  at: UnixSeconds;
}
export interface AccessLoggedEvent {
  event: "access.logged";
  principal: Hex;
  fiduciary: Hex;
  fiduciaryName: string;
  entryId: string;
  seq: number;
  purposeCode: string;
  decision: Decision;
  reason: AccessReason;
  endpoint: string;
  at: UnixSeconds;
}
export interface CascadeUpdatedEvent {
  event: "cascade.updated";
  principal: Hex;
  purposeId: Hex;
  processor: Hex;
  processorName: string;
  notifiedAt: UnixSeconds | null;
  ackedAt: UnixSeconds | null;
  txHash: Hex | null;
}
export interface AnchorPostedEvent {
  event: "anchor.posted";
  fiduciary: Hex;
  batchIndex: number;
  merkleRoot: Hex;
  fromSeq: number;
  toSeq: number;
  count: number;
  txHash: Hex;
}
export interface TamperAlertEvent {
  event: "tamper.alert";
  fiduciary: Hex;
  batchIndex: number | null;
  firstBadSeq: number | null;
  detectedAt: UnixSeconds;
}

// --- 6.5 / 6.7 confidential processing (V-06): handles, hashes, codes and timings, never plaintext ---

export type LoanDecisionKind = "approved" | "declined";
/** What QuickLoan holds for a customer: a reference, never the data (trd.md §6.8). */
export interface VaultView {
  handle: Hex | null;
  ciphertextHash: Hex | null;
  status: "stored" | "erased" | "none";
}
/** The Processor's answer to an evaluate call (trd.md §6.7). */
export interface LoanDecision {
  decision: LoanDecisionKind;
  /** Integer INR; null when declined. */
  limit: number | null;
  /** Decision codes (PAN_INVALID, INCOME_UNKNOWN, SCORE_LOW, SCORE_FAIR, SCORE_GOOD): not consent reason codes. */
  reasonCodes: string[];
}
export type VaultEraseCause = "withdrawn" | "expired" | "no_consent" | "superseded";
export type ProcessorOutcome = LoanDecisionKind | "blocked" | "error";

interface VaultEventBase {
  principal: Hex;
  fiduciary: Hex;
  purposeCode: string;
  handle: Hex;
  at: UnixSeconds;
  /** The same instant in milliseconds (the Data Flow Inspector times its steps with it). */
  atMs: number;
}
export interface VaultEncryptedEvent extends VaultEventBase {
  event: "vault.encrypted";
  ciphertextHash: Hex;
  sizeBytes: number;
}
export interface VaultStoredEvent extends VaultEventBase {
  event: "vault.stored";
  ciphertextHash: Hex;
  sizeBytes: number;
}
export interface ProcessorRequestedEvent extends VaultEventBase {
  event: "processor.requested";
  action: "loan_decision";
  requestedAt: number;
}
export interface ProcessorDecryptingEvent extends VaultEventBase {
  event: "processor.decrypting";
  decryptingAt: number;
}
export interface ProcessorDecidedEvent extends VaultEventBase {
  event: "processor.decided";
  decision: ProcessorOutcome;
  limit: number | null;
  reasonCodes: string[];
  entryId: string;
  durationMs: number;
}
export interface VaultErasedEvent extends VaultEventBase {
  event: "vault.erased";
  cause: VaultEraseCause;
}
export type VaultEvent =
  | VaultEncryptedEvent
  | VaultStoredEvent
  | ProcessorRequestedEvent
  | ProcessorDecryptingEvent
  | ProcessorDecidedEvent
  | VaultErasedEvent;
export type VaultEventName = VaultEvent["event"];
/** The extra fields each vault event carries beyond VaultEventBase: Core copies exactly these and nothing else. */
export const VAULT_EVENT_FIELDS: Readonly<Record<VaultEventName, readonly string[]>> = {
  "vault.encrypted": ["ciphertextHash", "sizeBytes"],
  "vault.stored": ["ciphertextHash", "sizeBytes"],
  "processor.requested": ["action", "requestedAt"],
  "processor.decrypting": ["decryptingAt"],
  "processor.decided": ["decision", "limit", "reasonCodes", "entryId", "durationMs"],
  "vault.erased": ["cause"],
};
export const VAULT_EVENT_BASE_FIELDS = ["principal", "fiduciary", "purposeCode", "handle", "at"] as const;

// --- 6.11 targeted consent requests (N-02, W-14) ---

export type TargetedStatus = "sent" | "seen" | "granted" | "declined" | "expired";

/** To `principal:<addr>` only: a company asked this wallet for consent. */
export interface ConsentRequestedEvent {
  event: "consent.requested";
  principal: Hex;
  requestId: string;
  fiduciary: Hex;
  fiduciaryName: string;
  purposeCodes: string[];
  message: string | null;
  expiresAt: UnixSeconds;
  at: UnixSeconds;
}
/** To `fiduciary:<addr>` only. It carries no principal: a company never learns who from it. */
export interface RequestUpdatedEvent {
  event: "request.updated";
  fiduciary: Hex;
  requestId: string;
  status: TargetedStatus;
  at: UnixSeconds;
}

export interface TargetedRequestBody {
  handle: string;
  purposes: string[];
  message?: string;
  expiresInHours?: number;
}
/** The answer to a targeted request: the same whether or not the handle exists (trd.md §6.11). */
export interface TargetedRequestResponse {
  requestId: string;
  status: "sent";
  expiresAt: UnixSeconds;
}
export interface TargetedRequestRow {
  requestId: string;
  /** The text the company typed. */
  handle: string;
  purposes: string[];
  message: string | null;
  status: TargetedStatus;
  createdAt: UnixSeconds;
  expiresAt: UnixSeconds;
}
export interface TargetedRequestsResponse {
  requests: TargetedRequestRow[];
}

export interface InboxRequest {
  requestId: string;
  fiduciary: { address: Hex; name: string; color: string; sector?: string };
  purposes: Array<{ code: string; title: LocalizedText }>;
  message: string | null;
  createdAt: UnixSeconds;
  expiresAt: UnixSeconds;
  status: "sent" | "seen";
}
export interface InboxResponse {
  requests: InboxRequest[];
}
export interface RegisterIdentityBody {
  handle: string;
  principal: Hex;
  issuedAt: UnixSeconds;
  signature: string;
}
export interface IdentityResponse {
  handle: string | null;
}
export interface BlocksResponse {
  blocked: Array<{ fiduciary: { address: Hex; name: string }; blockedAt: UnixSeconds }>;
}

// --- Expiry, renewal and notifications (trd.md §6.12) ---

export type NotificationType = "consent.expiring" | "consent.expired" | "consent.renewal_requested" | "data.erased" | "cascade.acknowledged";
export type NotificationAction = "renewed" | "let_expire" | "viewed_proof";

/** A notification's body is data: the wallet writes the sentence. No personal data is ever in `payload`. */
export interface NotificationItem {
  id: string;
  /** Dedupe key: the same notification raised live and scheduled on the phone shares it. */
  key: string;
  type: NotificationType;
  fiduciary: { address: Hex; name: string; color: string };
  purposeId: Hex | null;
  purposeCode: string | null;
  payload: {
    expiresAt?: number;
    thresholdSeconds?: number;
    message?: string | null;
    cause?: "withdrawn" | "expired";
    processor?: Hex;
    processorName?: string;
  };
  createdAt: UnixSeconds;
  readAt: UnixSeconds | null;
  actionTaken: NotificationAction | null;
}
/** To `principal:<addr>` only. The event name is the notification type. */
export interface NotificationEvent {
  event: NotificationType;
  principal: Hex;
  notification: NotificationItem;
  at: UnixSeconds;
}
export interface NotificationsResponse {
  notifications: NotificationItem[];
  unread: number;
  config: { thresholdsSeconds: number[]; fastExpiry: boolean };
}
export interface NotificationPatchBody {
  read?: true;
  action?: "let_expire" | "viewed_proof";
}
export interface RenewalOpenBody {
  fiduciary: Hex;
  purposeCode: string;
}
export interface RenewalOpenResponse {
  requestId: string;
}
export interface RenewalRequestBody {
  principal: Hex;
  purposeCode: string;
  message?: string;
}
export interface ExpiringRow {
  principal: Hex;
  customerAlias: string | null;
  purposeCode: string;
  expiresAt: UnixSeconds;
  state: "expiring" | "expired";
  renewal: { requestId: string; status: TargetedStatus; requestedAt: UnixSeconds } | null;
}
export interface ExpiringResponse {
  rows: ExpiringRow[];
}

export type WsEvent =
  | ConsentRequestedEvent
  | RequestUpdatedEvent
  | NotificationEvent
  | ConsentUpdatedEvent
  | AccessLoggedEvent
  | CascadeUpdatedEvent
  | AnchorPostedEvent
  | TamperAlertEvent
  | VaultEvent
  | FiduciaryRegisteredEvent
  | FiduciaryUpdatedEvent;
export type WsEventName = WsEvent["event"];
