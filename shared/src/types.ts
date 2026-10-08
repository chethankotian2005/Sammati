// API contracts for Core (trd.md §6). Changing anything here is a shared
// interface change: tell the other lanes.
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
}
export interface DemoFireResponse {
  decision: Decision;
  reason: AccessReason;
  entryId: string;
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

export type WsEvent =
  | ConsentUpdatedEvent
  | AccessLoggedEvent
  | CascadeUpdatedEvent
  | AnchorPostedEvent
  | TamperAlertEvent;
export type WsEventName = WsEvent["event"];
