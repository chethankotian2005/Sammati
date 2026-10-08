# TRD — Sammati

## 1. Stack

| Layer | Choice | Notes |
|---|---|---|
| Contracts | Solidity ^0.8.24, Hardhat, OpenZeppelin (`EIP712`, `ECDSA`) | TypeScript tests |
| Core service | Node 20, TypeScript, Express, `ethers` v6, `better-sqlite3`, `ws` | Single process: relayer + indexer + cache + anchor + cascade + audit API |
| Gateway SDK | TypeScript package `@sammati/gateway` | Express middleware |
| Demo companies | 3 Express apps (ports 4101, 4102, 4103) | Fake data only |
| Processor | Node 20, TypeScript, Express, `better-sqlite3`, `ethers` v6, Node `crypto` (X25519, HKDF-SHA256, AES-256-GCM), `ws` | Separate process on port 4200 (`processor/`). §4.4, §6.7 |
| Web | Vite + React + TypeScript + Tailwind, `recharts`, `react-router` | One app, routes `/company/:id`, `/auditor`, `/stage` |
| Wallet | Flutter 3.x | See §5 |
| Chain | Hardhat node (chainId 31337) for live demo; Polygon Amoy (chainId 80002) for proof | |
| Tooling | pnpm workspaces, `scrcpy` for phone mirroring on stage | |

## 2. Repo layout

```
sammati/
  contracts/        # Hardhat project
  core/             # Node service
  gateway/          # @sammati/gateway SDK
  companies/
    quickloan/  medicare/  foodrush/
  processor/        # Sammati Processor: vault + confidential evaluation (port 4200)
  web/              # company console + auditor + stage
  wallet/           # Flutter app
  shared/           # TS types, EIP-712 definitions, canonical JSON, merkle utils, vault envelope
  docs/             # these specs
```

## 3. Smart contracts

### 3.1 ConsentRegistry

```solidity
enum Status { None, Active, Withdrawn }

struct Consent {
  Status  status;
  uint64  grantedAt;
  uint64  expiresAt;
  uint64  updatedAt;
  bytes32 noticeHash;   // hash of the exact notice text the user saw
  uint32  noticeVersion;
}

struct Purpose {
  address fiduciary;
  bytes32 descHash;       // hash of plain-language description
  uint32  retentionDays;
  bool    sharesWithThirdParties;
  bool    active;
}

struct GrantConsent {
  address principal;
  address fiduciary;
  bytes32 purposeId;
  uint64  expiresAt;
  bytes32 noticeHash;
  uint256 nonce;
  uint64  deadline;
}

struct WithdrawConsent {
  address principal;
  address fiduciary;
  bytes32 purposeId;
  uint256 nonce;
  uint64  deadline;
}

// admin
function registerFiduciary(address fiduciary, string name, bytes32 metaHash) external;           // onlyAdmin
// fiduciary
function registerPurpose(bytes32 purposeId, bytes32 descHash, uint32 retentionDays, bool shares) external; // onlyFiduciary
function registerProcessor(bytes32 purposeId, address processor, bytes32 metaHash) external;     // onlyFiduciary
// anyone (relayer) with principal signature
function grantConsent(GrantConsent calldata req, bytes calldata sig) external;
function withdrawConsent(WithdrawConsent calldata req, bytes calldata sig) external;
// processors
function acknowledgeWithdrawal(address principal, address fiduciary, bytes32 purposeId) external; // onlyRegisteredProcessor
// fiduciary (owner of the purpose)
function setPurposeActive(bytes32 purposeId, bool active) external;                              // onlyFiduciary; withdrawal never needs an active purpose
// views
function admin() external view returns (address);
function isFiduciary(address fiduciary) external view returns (bool);
function isProcessor(bytes32 purposeId, address processor) external view returns (bool);
function getPurpose(bytes32 purposeId) external view returns (Purpose memory);
function hasValidConsent(address principal, address fiduciary, bytes32 purposeId) external view returns (bool);
function getConsent(address principal, address fiduciary, bytes32 purposeId) external view returns (Consent memory);
function ledgerHead() external view returns (bytes32);
function nonces(address principal) external view returns (uint256);
```

Rules:
- `purposeId = keccak256(abi.encodePacked(fiduciary, code))` where `code` is a short string like `"credit_check"`.
- Grant requires `block.timestamp <= deadline`, `req.nonce == nonces[principal]++`, `expiresAt > block.timestamp`, signer == `principal`, purpose active. Re-granting after withdrawal is allowed.
- Withdraw requires an Active consent. Withdrawal is immediate and unconditional.
- `hasValidConsent` = `status == Active && block.timestamp < expiresAt`.
- On every state change (registrations, purpose activation, grant, withdraw, acknowledgement): `ledgerHead = keccak256(abi.encode(ledgerHead, actionHash))`. `actionHash` and the numeric action types are defined in `drd.md` §2; `shared/src/ledger.ts` recomputes them off chain.
- `registerPurpose` requires a registered fiduciary and a new `purposeId`, and creates it active. The contract cannot check the `code` behind `purposeId`; Core derives it with `purposeIdOf`. `registerProcessor` requires the caller to own the purpose.
- `noticeVersion` is not signed: it counts grants of the same (principal, fiduciary, purpose), starting at 1.
- `acknowledgeWithdrawal` requires the caller to be a processor of the purpose and the consent to be `Withdrawn`, and works once per processor.
- Errors (custom): `NotAdmin`, `NotFiduciary`, `NotProcessor`, `ZeroAddress`, `FiduciaryAlreadyRegistered`, `PurposeAlreadyRegistered`, `ProcessorAlreadyRegistered`, `UnknownPurpose`, `WrongFiduciary`, `PurposeInactive`, `SignatureExpired`, `InvalidNonce`, `InvalidExpiry`, `InvalidSignature`, `NotActive`, `NotWithdrawn`, `AlreadyAcknowledged`.

Events:
```solidity
event FiduciaryRegistered(address indexed fiduciary, string name);
event PurposeRegistered(address indexed fiduciary, bytes32 indexed purposeId, bytes32 descHash);
event ProcessorRegistered(bytes32 indexed purposeId, address indexed processor);
event ConsentGranted(address indexed principal, address indexed fiduciary, bytes32 indexed purposeId, uint64 expiresAt, bytes32 noticeHash, bytes32 ledgerHead);
event ConsentWithdrawn(address indexed principal, address indexed fiduciary, bytes32 indexed purposeId, bytes32 ledgerHead);
event WithdrawalAcknowledged(address indexed principal, bytes32 indexed purposeId, address indexed processor, uint64 at);
event PurposeActiveChanged(address indexed fiduciary, bytes32 indexed purposeId, bool active);
```

### 3.2 AccessAnchor
```solidity
function anchorAccessBatch(bytes32 merkleRoot, uint64 fromSeq, uint64 toSeq, uint32 count) external; // onlyFiduciary
function getBatch(address fiduciary, uint256 index) external view returns (bytes32 root, uint64 fromSeq, uint64 toSeq, uint32 count, uint64 at);
function batchCount(address fiduciary) external view returns (uint256);
event AccessBatchAnchored(address indexed fiduciary, uint256 indexed index, bytes32 merkleRoot, uint64 fromSeq, uint64 toSeq, uint32 count);
```

Rules:
- Constructor takes the `ConsentRegistry` address; "onlyFiduciary" means `registry.isFiduciary(msg.sender)`.
- Batches are **contiguous**: the first batch of a fiduciary starts at `fromSeq = 1`, every later one at `previous toSeq + 1`, and `count == toSeq - fromSeq + 1`. This is stricter than "monotonic" on purpose: a gap in `seq` is a tamper signal (`drd.md` §7), so the chain refuses to anchor one. `merkleRoot` must be non-zero.
- Errors: `NotFiduciary`, `InvalidRoot`, `InvalidRange`, `NonContiguous`, `BatchNotFound`.

### 3.3 Tests (must pass before integration)
1. Valid signature grants; wrong signer, replayed nonce, expired deadline all revert.
2. Withdraw flips state; `hasValidConsent` false immediately.
3. Expiry makes `hasValidConsent` false without any transaction.
4. Re-grant after withdrawal works.
5. `ledgerHead` changes on each action and is deterministic.
6. Processor ack only from registered processors.
7. Anchor stores roots and enforces contiguous, non-overlapping `fromSeq`/`toSeq` per fiduciary (see §3.2 rules).

## 4. Signing

### 4.1 EIP-712 domain
```
name: "Sammati", version: "1", chainId: <chain>, verifyingContract: <ConsentRegistry>
```
Types: exactly the `GrantConsent` and `WithdrawConsent` structs above (field names and order are part of the spec; `shared/` holds the single definition used by contracts tests, Core and wallet).

### 4.2 Wallet key
- secp256k1 key generated on first launch, stored with `flutter_secure_storage`, usable only after `local_auth` success.
- Address shown as a short alias, never as the primary identity.

### 4.3 Dart signing spike (hours 0–2, blocking)
- Try `eth_sig_util` `signTypedData` (V4) with the typed data above; verify the recovered address in a Hardhat test.
- **Fallback:** Core computes the EIP-712 digest and returns it; wallet signs the raw 32-byte digest with `web3dart`/`pointycastle` (no prefix). Contract still verifies with `ECDSA.recover(digest, sig)`. The wallet independently recomputes the notice hash and shows it, so the user is not signing blind.

### 4.4 Vault envelope (V-01)

Hybrid, ECIES-style encryption of a JSON payload for the Processor. Defined once in `shared/src/envelope.ts`; the Dart copy `wallet/lib/core/envelope.dart` matches it byte for byte, and both must pass `shared/test-vectors/envelope.json`.

```
Envelope = { v: 1, ephPub, nonce, ciphertext, tag }   // every binary field is lowercase 0x-hex
  ephPub      32 bytes   the wallet's ephemeral X25519 public key (fresh for every envelope)
  nonce       12 bytes   AES-GCM nonce, random
  ciphertext  n bytes    AES-256-GCM output, same length as the plaintext
  tag         16 bytes   AES-GCM tag
```

1. The Processor has an X25519 key pair `(p, P)`. `P` is published at `GET /v1/processor/pubkey`.
2. The wallet generates `(e, E)` and computes `shared = X25519(e, P)` (32 bytes). An all-zero `shared` is rejected.
3. `key = HKDF-SHA256(ikm = shared, salt = E ‖ P (64 bytes), info = utf8("sammati-vault-v1"), length = 32)`.
4. `plaintext = canonicalBytes(payload)` (`drd.md` §4.1: sorted keys, integers only). The demo payload is `{ "incomeBand": "6-9 LPA", "pan": "ABCDE1234F", "score": 742 }`.
5. `AAD = canonicalBytes({ fiduciary, principal, purposeCode, v: 1 })` with both addresses lowercased. The envelope is therefore bound to one customer, one company and one purpose: moving it to another purpose or principal fails authentication. The AAD is not stored in the envelope; the Processor rebuilds it from the vault row.
6. `AES-256-GCM(key, nonce, plaintext, AAD)` gives `ciphertext` and `tag`.
7. `handle = keccak256(canonicalBytes(envelope))`. `ciphertextHash = keccak256(ciphertext ‖ tag)`.
8. Submission is signed by the principal: EIP-191 personal message `sammati-vault-submit:v1:<handle>:<requestId>`, recovered address must equal `principal`. This is not an EIP-712 type and changes none of them (§4.1). It stops a stranger who knows an address from replacing that person's vault entry with junk, and `requestId` makes a replay of the same submission idempotent.

`shared/test-vectors/envelope.json`: `{ processor: { privateKey, publicKey }, cases: [{ name, ephemeralPrivateKey, nonce, fiduciary, principal, purposeCode, payload, aad, plaintext, envelope, handle, ciphertextHash }], negative: [{ name, envelope, aad, expect: "fail" }] }`. Sealing with the given ephemeral key and nonce must reproduce `envelope` exactly; opening with the processor key must reproduce `plaintext`; each negative case (flipped tag, flipped ciphertext, wrong AAD, wrong version, all-zero `ephPub`) must fail to open. Generated by `pnpm --filter @sammati/shared vectors`.

## 5. Wallet technical notes
Packages: `flutter_riverpod`, `go_router`, `dio`, `web_socket_channel`, `mobile_scanner`, `flutter_secure_storage`, `local_auth`, `web3dart`, `eth_sig_util`, `flutter_local_notifications`, `flutter_localizations` + `intl`, `url_launcher`, `cryptography` (V-01: X25519, HKDF and AES-GCM in pure Dart, which also runs on web; chosen because `web3dart` has none of the three and `pointycastle` has no X25519).
- State: Riverpod providers for `consents`, `activity`, `cascade`, `locale`.
- Networking: REST for actions, one WebSocket for live updates, auto-reconnect.
- Config: `CORE_URL` and `CHAIN_EXPLORER_URL` in a build-time `.env`; QR "dev settings" screen to change the Core URL on the phone without rebuilding.
- Build: `flutter build apk --release`; install via `adb install`.

## 6. Core service APIs

Base: `http://<lan-ip>:4000`. JSON everywhere. Errors: `{ "error": { "code": "...", "message": "..." } }`.

### 6.1 Consent flow
| Method | Path | Purpose |
|---|---|---|
| POST | `/v1/fiduciaries/:fid/requests` | Body `{ purposes:[code], customerAlias }` returns `{ requestId, qrPayload }` |
| GET | `/v1/health` | Liveness: `{ ok, service, mode: "stub" \| "live", time }` |
| GET | `/v1/requests/:requestId?principal=0x..` | Wallet fetches notice: fiduciary, purposes (localised text), noticeHash, typed-data template, nonce (the principal's current on-chain nonce; `"0"` if `principal` omitted) |
| POST | `/v1/consents/grant` | Body `{ request: GrantConsent, signature }` returns `{ txHash, status }` |
| POST | `/v1/consents/withdraw` | Body `{ request: WithdrawConsent, signature }` returns `{ txHash, status }` |
| GET | `/v1/principals/:addr/consents` | All consents grouped by fiduciary, plus `nonce` (the principal's current on-chain nonce, decimal string) and `domain` (the EIP-712 domain). The wallet needs both to sign a withdraw, which has no request to read them from |
| GET | `/v1/principals/:addr/activity?limit=` | Access feed |
| POST | `/v1/rights` | Data-rights request (W-10, `prd.md`). Body `{ principal, fiduciary, type: "access" \| "erasure" \| "grievance", note? }`; returns 201 and the record `{ id, principal, fiduciary, type, note, status: "open", createdAt, updatedAt }`. 400 for an unknown `type`, a malformed address or a non-text `note`; 404 `FIDUCIARY_NOT_FOUND` for a company that does not exist. Stored in `rights_requests` (`drd.md` §3); a status record only, it never touches the chain |
| GET | `/v1/principals/:addr/rights` | `{ principal, rights: [record + fiduciaryName] }`, oldest first. `status` moves `open` → `in_progress` → `resolved` (nothing advances it yet) |
| GET | `/v1/principals/:addr/cascade/:purposeId` | Processor acknowledgements |
| GET | `/v1/proof/consent/:txHash` | Event data, ledger head, explorer link |
| GET | `/v1/proof/access/:entryId` | Entry, Merkle path, anchor tx |
| GET | `/v1/processor` | `{ url }`: where the wallet finds the Processor (`PROCESSOR_PUBLIC_URL`, §10). Core only points at it: it holds no key and never sees an envelope |
| POST | `/v1/events/vault` | The Processor reports a vault or processing event (§6.5) for Core to fan out. Header `x-sammati-processor-key: <PROCESSOR_EVENT_KEY>`, else 401 `UNAUTHORIZED`. Core copies only the allow-listed fields of the event (handles, hashes, codes, timings), so even a misbehaving sender cannot push other data through the hub. 202 `{ ok: true }`; 400 `BAD_EVENT` for an unknown event name or a missing field |

Multi-purpose grants: the contract needs consecutive nonces, so the wallet signs the i-th purpose the user switched on (in notice order) with `nonce + i` and posts the grants one after another. A purpose the user left off does not consume a nonce. Before signing, the wallet re-fetches the notice (fresh nonce) and refuses if its `noticeHash` differs from the one shown.

`qrPayload` (JSON in QR): `{ "v":1, "core":"http://...", "requestId":"...", "fiduciary":"0x..", "name":"QuickLoan" }`.

### 6.2 Company and gateway
| Method | Path | Purpose |
|---|---|---|
| GET | `/v1/fiduciaries/:fid/purposes` | List registered purposes |
| POST | `/v1/fiduciaries/:fid/purposes` | Register purpose (writes chain) |
| POST | `/v1/fiduciaries/:fid/processors` | Register downstream processor |
| GET | `/v1/fiduciaries/:fid/purposes` | The company's purposes: `{ fiduciary, purposes: NoticePurpose[] }` (id, code, localised title and description, data categories, retention, sharing flag, `required`) |
| GET | `/v1/fiduciaries/:fid/consents` | Console table |
| GET | `/v1/fiduciaries/:fid/access?limit=` | Console feed and history, newest first (the SDK reads `limit=1` to resume `seq`/`prevHash`) |
| POST | `/v1/gateway/log` | SDK posts each decision entry |
| GET | `/v1/gateway/consent-state?principal=&fid=&purpose=` | SDK fallback check |
| POST | `/v1/fiduciaries/:fid/export` | Compliance pack (C-08) |

### 6.3 Auditor
| Method | Path | Purpose |
|---|---|---|
| GET | `/v1/audit/fiduciaries` | List with scorecards |
| GET | `/v1/audit/ledger?fid=&principal=&type=` | Ledger explorer |
| POST | `/v1/audit/verify/:fid` | Recompute chain and roots vs anchors, returns per-batch results |
| GET | `/v1/audit/report/:fid` | Report JSON (PDF rendered client side) |

#### Audit semantics (real mode)
- **Anchor job.** Core anchors each demo company's pending log entries every 10 s (`ANCHOR_INTERVAL_MS`), or as soon as 20 are waiting, in batches of at most 100: Merkle root over the stored `entry.hash` values, then `anchorAccessBatch` from the company's own key (a disclosed demo shortcut, `shared/seed.ts`). The next batch always starts at the chain's last `toSeq + 1`, so a hole in the stored log stops anchoring instead of being papered over; the indexer then fills `anchor_batches` and `access_logs.batch_index`.
- **Verify** (`POST /v1/audit/verify/:fid`) reads the batches from the **chain**, not from Core's tables, and checks each stored row three ways: its `hash` against `keccak256(prevHash || canonical entry)`; its `prevHash` against the previous row's `hash`; and `seq` for gaps. Each batch's Merkle root is rebuilt from the *recomputed* hashes and compared with the on-chain root and `count`. `firstMismatch` is the lowest `seq` with a row-level problem: `HASH_MISMATCH` (a row was edited), `BROKEN_LINK` (the row after an edit that was re-hashed, or after a deletion), `MISSING_ENTRY` (a gap); when every row is self-consistent but a root differs it is `ROOT_MISMATCH` with `seq: null` and the `batchIndex`. A failed verification pushes `tamper.alert`.
- **Scorecard.** `integrity` is the result of the last verify (`unverified` until one runs). `violations` counts `ALLOWED` log entries that happened with no valid consent, judged against the ledger with a one-second tolerance in the company's favour (an entry in the same second as a grant or withdrawal is not a violation). `avgWithdrawalToBlockSeconds` is, over withdrawals followed by at least one request, how long after the withdrawal the company still allowed access (0 = blocked from the first request after it). `unacknowledgedCascades` counts processors that have not acknowledged a withdrawal older than 30 s.
- **Proofs.** `GET /v1/proof/access/:entryId` returns the entry, the Merkle path built from the stored rows, and the root of the on-chain batch. A client checks two things: that `keccak256(prevHash || canonical entry)` equals the entry's `hash` (this catches an edited row), and that the path leads from that hash to the on-chain root (this catches a row whose hash was rewritten to match).

### 6.4 Demo controls (guarded by `DEMO_MODE=true`)
| Method | Path | Purpose |
|---|---|---|
| POST | `/v1/demo/tamper/:fid` | Mutate one stored access-log row: flips `decision` on the newest anchored `BLOCKED` entry (else the newest anchored one, else any), leaving its hash untouched, like someone hiding a refusal in the company database |
| POST | `/v1/demo/anchor` | Anchor pending log entries now instead of at the next 10 s tick. Optional body `{ fiduciary }`, else every company; returns the batches it anchored (`{ batches: [] }` in stub mode, whose fixtures are anchored already) |
| POST | `/v1/demo/reset` | Reset DB and redeploy seed |
| POST | `/v1/demo/fire` | Fire a request (used by the console simulator). Body `{ fiduciary, purposeCode, principal, action? }`. `action: "loan_decision"` (QuickLoan, purpose `credit_check` only) calls the company's apply endpoint (`LOAN_DECISION_ENDPOINT` in `shared/seed.ts`, `POST`) instead of the credit-profile one. For the two QuickLoan endpoints that return no personal data by construction (credit-profile and apply) the answer also carries `result`: `{ handle, ciphertextHash, status }` or `{ decision, limit, reasonCodes }`; no other endpoint's body is ever relayed. In real mode Core calls the company's own guarded endpoint for that purpose (`GUARDED_ENDPOINTS` in `shared/seed.ts`, with `x-sammati-principal`), so the gateway SDK decides and writes the log, and the answer is that decision with the log entry id from `x-sammati-entry-id`; an unreachable company is 502 `COMPANY_UNREACHABLE`. In stub mode Core simulates the decision itself (optional `endpoint` labels the simulated log entry) |

### 6.5 WebSocket `/ws`
Subscribe message: `{ "sub": ["principal:0x..", "fiduciary:0x..", "auditor"] }`.
Core answers a subscribe message with an acknowledgement `{ "event": "subscribed", "topics": [...] }` once the topics are active (the gateway trusts its consent cache only after this; other clients may ignore it).
Events: `consent.updated`, `access.logged`, `cascade.updated`, `anchor.posted`, `tamper.alert`, and the confidential-processing events below.
Payloads include the entity ids and the minimal fields the UI renders.

Confidential-processing events (V-06). The Processor posts them to Core (`POST /v1/events/vault`), Core publishes them to `principal:<principal>`, `fiduciary:<fiduciary>` and `auditor`. **No payload ever carries plaintext, an envelope or a ciphertext**: only addresses, the `handle`, hashes, purpose code, timings and the decision. Common fields: `principal`, `fiduciary`, `purposeCode`, `handle`, `at` (unix seconds).

| Event | When | Extra fields |
|---|---|---|
| `vault.encrypted` | The Processor received a well-formed envelope with a valid principal signature (still ciphertext; consent not yet checked) | `ciphertextHash`, `sizeBytes` |
| `vault.stored` | The consent was verified on chain and the ciphertext persisted | `ciphertextHash`, `sizeBytes` |
| `processor.requested` | A company's authenticated evaluate call for a known handle was accepted | `action`, `requestedAt` (ms) |
| `processor.decrypting` | Consent verified; the envelope is being opened in memory | `decryptingAt` (ms) |
| `processor.decided` | The call finished | `decision` (`approved`, `declined`, `blocked` or `error`), `limit` (integer INR or `null`), `reasonCodes` (decision codes, §6.7, or for `blocked` the one consent reason code), `entryId` (the access-log entry), `durationMs` |
| `vault.erased` | The ciphertext was erased | `cause` (`withdrawn`, `expired`, `no_consent` or `superseded`) |

`decision` here is the Processor's outcome and is not the ALLOWED/BLOCKED of `access.logged`. A blocked evaluate emits both.

### 6.6 Real mode (`STUB_MODE=false`)
Same paths, shapes and error codes as the stub, backed by SQLite (`drd.md` §3), the chain and a relayer wallet.
- **Grant/withdraw:** the relayer submits `grantConsent` / `withdrawConsent` and waits for the receipt, so `status` is `"confirmed"`. Contract reverts map to HTTP errors: `InvalidSignature` → 400 `BAD_SIGNATURE`, `InvalidNonce` → 409 `BAD_NONCE`, `SignatureExpired` → 400 `DEADLINE_PASSED`, `InvalidExpiry` → 400 `BAD_EXPIRY`, `UnknownPurpose` → 404 `PURPOSE_NOT_FOUND`, `WrongFiduciary` → 400 `WRONG_FIDUCIARY`, `PurposeInactive` → 409 `PURPOSE_INACTIVE`, `NotActive` → 409 `NOT_ACTIVE`. An unreachable node is 503 `LEDGER_UNAVAILABLE`.
- **Indexer:** polls chain events into `ledger_events` and `consents_cache` (and `anchor_batches`, `cascade_acks`), pushes `consent.updated`, `cascade.updated` and `anchor.posted`, and resumes from `indexer_state`. It also ingests the receipt of every relayed transaction immediately; the unique `(tx_hash, log_index)` key makes the two paths agree.
- **`/v1/gateway/consent-state`** reads the chain directly (the cache can lag), and answers 503 `LEDGER_UNAVAILABLE` when it cannot, which the SDK treats as BLOCKED (fail closed).
- **Request notices:** `GET /v1/requests/:id` expires a request after `REQUEST_TTL_SECONDS` (default 1800) with 410 `REQUEST_EXPIRED`. The seeded `req_demo_quickloan` never expires.
- **Not built yet in real mode (501 `NOT_IMPLEMENTED`):** `POST /v1/fiduciaries/:fid/purposes` and `/processors` (the seed registers them). The cascade engine (§9) is also not built: `GET .../cascade/:purposeId` lists processors with null timestamps until a `WithdrawalAcknowledged` event arrives, and until then every withdrawal older than 30 s counts as an unacknowledged cascade in the scorecard. The audit report is not signed (A-04 asks for it); `reportHash` and signing are future work.
- **Config:** `STUB_MODE=false`, `CHAIN_RPC` (default `http://127.0.0.1:8545`), `CHAIN_NETWORK` (the key in `shared/deployments.json`, default `localhost`), `RELAYER_KEY` (default the demo relayer), `DB_PATH` (default `./data/sammati.sqlite`). Core waits for the chain and contracts at startup rather than exiting. Start it with `pnpm demo:up` (real mode is its default).

### 6.7 Sammati Processor (`processor/`, port 4200)

A separate process from Core and from every company. It is the only place where a vault envelope is opened. Base `http://<lan-ip>:4200`. Errors `{ "error": { "code", "message" } }`, except consent refusals, which are `451 { "code": <reason code>, "message" }` like the gateway's.

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/v1/processor/pubkey` | none | `{ v: 1, alg: "X25519", publicKey: "0x…", mode: "simulated-enclave" }`. `mode` is shown in the wallet and the console: the Processor is not a real enclave (`architecture.md` §5.5) |
| POST | `/v1/vault/submit` | principal signature | Body `{ principal, fiduciary, purposeCode, envelope, requestId, signature }`. Returns 201 `{ handle, ciphertextHash }` (200 with the same body when the handle already exists) |
| GET | `/v1/vault/:handle` | none | `{ handle, principal, fiduciary, purposeCode, ciphertextHash, status: "stored" \| "erased", createdAt, erasedAt, envelope }`; `envelope` is `null` once erased. Never plaintext, for anyone |
| POST | `/v1/processor/evaluate` | company API key | Body `{ handle, fiduciary, purposeCode, action: "loan_decision" }`. 200 `{ decision, limit, reasonCodes, entryId }`; header `x-sammati-entry-id` |
| GET | `/health` | none | `{ ok, service: "processor", mode: "simulated-enclave", time }` |
| POST | `/v1/demo/reset` | `DEMO_MODE` | Empties the vault (and keeps the key) |
| POST | `/v1/demo/tamper/:handle` | `DEMO_MODE` | Flips one bit of the stored ciphertext, like a database administrator editing a row. The next evaluate must answer `CIPHERTEXT_INVALID` |

**Submit.** (1) Validate shape: lowercase-hex fields of the right length (`ephPub` 32, `nonce` 12, `tag` 16), `v == 1`, `purposeCode` a short code, envelope at most 4 KiB; else 400 `BAD_ENVELOPE`. (2) Compute `handle`; verify the EIP-191 signature (§4.4.8): else 400 `BAD_SIGNATURE`. Emit `vault.encrypted`. (3) Read `hasValidConsent(principal, fiduciary, purposeIdOf(fiduciary, purposeCode))` **from the chain**, not from Core: Core cannot make the Processor accept data. (Chain access needs `shared/deployments.json` and the registry ABI, like Core.) Not valid: 451 with the reason (`NO_CONSENT`, `CONSENT_WITHDRAWN`, `CONSENT_EXPIRED`); chain unreachable: 451 `LEDGER_UNAVAILABLE`. (4) Store `{ handle, principal, fiduciary, purposeCode, ciphertextHash, ciphertext }` (`drd.md` §3); erase older live rows for the same principal, fiduciary and purpose (`cause: "superseded"`) so one live copy exists. Emit `vault.stored`. (5) Tell the company's webhook (below). The Processor does **not** open the envelope at submit: a malformed ciphertext is discovered at evaluate, which answers `CIPHERTEXT_INVALID`.

**Evaluate.** (1) `x-sammati-api-key` identifies a fiduciary (`FIDUCIARY_API_KEYS`); unknown key 401 `UNAUTHORIZED`; `fiduciary` in the body must be that company, `action` must be `loan_decision` (else 400 `UNSUPPORTED_ACTION`). (2) Unknown handle, or a handle of another company: 404 `HANDLE_NOT_FOUND` (the two are indistinguishable). Emit `processor.requested`. (3) Consent, from the chain, for the **requested** `purposeCode`: not valid, or the handle was submitted for a different purpose, is refused with 451 and the reason code (a different purpose answers `NO_CONSENT`); chain unreachable is `LEDGER_UNAVAILABLE` and **erases nothing**. (4) A refusal writes a BLOCKED access-log entry and emits `processor.decided` (`blocked`). When the reason is `CONSENT_WITHDRAWN`, `CONSENT_EXPIRED` or `NO_CONSENT`, the ciphertext is erased now (`vault.erased`). (5) Consent valid but the row is already erased: 410 `VAULT_ERASED` (the customer must submit again). (6) Emit `processor.decrypting`; open the envelope in memory. Authentication failure or a payload that is not the expected JSON: 422 `CIPHERTEXT_INVALID`, `processor.decided` (`error`), never a guessed decision. (7) Run the rules below, drop the plaintext reference, respond. (8) Write an ALLOWED access-log entry (`endpoint: "POST /v1/processor/evaluate"`, `reason: "OK"`; an authentication failure is ALLOWED too, since consent was valid and the data was handled) and emit `processor.decided`.

**Rules (deterministic, `processor/src/rules.ts`).** Decision codes are not consent reason codes and never appear in `access_logs.reason`.

| Check | Outcome |
|---|---|
| `pan` does not match `^[A-Z]{5}[0-9]{4}[A-Z]$` | declined, `PAN_INVALID` |
| `incomeBand` not one of `0-3 LPA`, `3-6 LPA`, `6-9 LPA`, `9+ LPA` | declined, `INCOME_UNKNOWN` |
| `score < 650` (integer) | declined, `SCORE_LOW` |
| otherwise | approved. `base` = 100000, 250000, 500000 or 1000000 for the four bands. `score >= 750`: `limit = base`, code `SCORE_GOOD`. `650..749`: `limit = base * 60 / 100`, code `SCORE_FAIR` |

For the demo profile (6-9 LPA, score 742) the answer is `approved`, `limit: 300000`, `["SCORE_FAIR"]`. A declined answer has `limit: null`. The decision itself reveals coarse facts (a score band): that is the point of data minimisation, and `demo.md` says so.

**Erasure.** A row is erased by overwriting `ciphertext` with `NULL` and setting `erased_at`; the metadata row stays so a later call can still be told why. Triggers: evaluate refusals above; the Processor's subscription to Core's `fiduciary:<address>` topic (a `consent.updated` that is no longer Active for a stored row erases it at once); a sweep every `PROCESSOR_SWEEP_MS` that re-checks every live row on chain (covers expiry and missed events); a newer submission. It never erases when the chain cannot be read.

**Company webhook.** After `vault.stored` and `vault.erased` the Processor POSTs `{ event: "stored" \| "erased", handle, principal, purposeCode, ciphertextHash }` to the company's callback (`FIDUCIARY_CALLBACKS`, default `http://localhost:<company port>/vault/events`) with the company's API key in `x-sammati-api-key`, 3 s timeout, failures only warned about. QuickLoan keeps the handle and nothing else (§6.8).

**No plaintext outside the Processor, enforced.** The plaintext exists as a local variable inside one function (`evaluate`), is never assigned to a longer-lived object, never interpolated into a log line, error message or event, and is not in any thrown error (errors on the decrypt path carry fixed messages only). The request logger prints method, path, status and duration, never bodies. `processor/test` and `pnpm e2e` search for the demo PAN in logs, events, HTTP responses and database files (§11).

### 6.8 QuickLoan with the Processor (V-05)

`companies/quickloan` no longer holds or returns a credit profile.
- `POST /vault/events`: the Processor's webhook (API key checked). Stores `{ handle, ciphertextHash, status }` per principal, in memory.
- `GET /customers/:id/credit-profile` (still `requireConsent("credit_check")`, the admin view): `{ handle, ciphertextHash, status: "stored" \| "erased" \| "none" }` and nothing else.
- `POST /customers/:id/apply` (principal in `x-sammati-principal`): calls the Processor's evaluate with the stored handle and QuickLoan's API key, and returns its answer or its refusal unchanged (a 451 keeps its reason code and `x-sammati-entry-id`). It is **not** wrapped in `requireConsent`: the Processor checks consent and writes the log entry, so the access is logged once, by the party that touched the data. No handle on record: 409 `NO_SUBMISSION`. A request with no valid principal is `451 NO_PRINCIPAL`, logged BLOCKED through `gate.logAccess`, and goes no further. The apply answer of any status keeps the Processor's body, and `x-sammati-entry-id` when it sent one.

## 7. Gateway SDK

```ts
import { sammati } from '@sammati/gateway';

const gate = sammati({ coreUrl, fiduciary: QUICKLOAN_ADDRESS, signer: fiduciaryKey });

app.get('/customers/:id/credit-profile',
  gate.requireConsent({ purpose: 'credit_check', principalFrom: req => req.header('x-sammati-principal') }),
  handler);
```
Behaviour:
1. Resolve principal address. Missing or malformed principal returns 451 `NO_PRINCIPAL`.
2. Check the local consent cache. The SDK keeps a WebSocket to Core subscribed to `fiduciary:<address>`; each `consent.updated` replaces that consent's cache entry immediately. If the entry is missing or older than 5 s, call `/v1/gateway/consent-state`.
   - The cache is used **only while the WebSocket is subscribed and acknowledged**. While it is down (or before the acknowledgement) every request calls `/v1/gateway/consent-state`, and the cache is emptied on every (re)connect, because events may have been missed. Otherwise a withdrawal could be ignored for up to 5 s.
   - A `consent-state` answer that was in flight when an event for the same consent arrived is not cached.
3. Active and unexpired: `next()`. Otherwise respond `451 { code: "CONSENT_WITHDRAWN" | "CONSENT_EXPIRED" | "NO_CONSENT" | "LEDGER_UNAVAILABLE" | "NO_PRINCIPAL", message }`. If the state cannot be fetched (Core down, 5xx, timeout) the answer is `LEDGER_UNAVAILABLE`: fail closed. Every response, allowed or blocked, carries the log entry's id in the `x-sammati-entry-id` header.
4. Append a log entry (see `drd.md` §3) and POST it to Core asynchronously, after the response is sent, so logging never blocks it. The SDK owns the per-fiduciary `seq`/`prevHash`: it resumes from `GET /v1/fiduciaries/:fid/access?limit=1` and again after any rejection. At most 5000 entries wait for Core; beyond that new entries are dropped with a warning rather than growing memory without bound.
5. `gate.close()` stops the WebSocket; `gate.flush()` resolves when queued log entries have been delivered.
6. Addresses an entry carries (the company's and the principal's) are written in EIP-55 form whatever case the caller used. Core stores them that way and re-derives each entry's hash from the stored row, so an entry hashed with a lower-case address would be rejected as out of sync with its chain.
7. `gate.logAccess({ purpose, principal, decision, reason, endpoint, latencyMs })` appends an entry decided by someone else to the same hash chain and queue, and returns its id. The Processor uses it: it decides from the chain itself (§6.7) and logs through the normal path. Two processes (a company's app and the Processor) may then write one fiduciary's chain; a sequence collision is rejected by Core (409) and the SDK resumes and retries (up to 5 attempts), so neither loses an entry in normal use.

## 8. Log hashing and anchoring
- Canonical JSON (sorted keys, no whitespace) of the entry without `hash`.
- `entry.hash = keccak256(prevHash || canonicalBytes)`; first entry uses a zero `prevHash` per fiduciary.
- Anchor job: every 10 seconds, or after 20 entries, build a Merkle tree over `entry.hash` values (sorted pairs, keccak), call `anchorAccessBatch`.
- Verification recomputes everything from stored rows and compares roots.

## 9. Cascade engine
On `ConsentWithdrawn`: look up processors for the purpose; for each, POST a signed notification to the processor's webhook (demo processors are in-process stubs). Each stub waits a random 1–3 s, signs an ack, and Core calls `acknowledgeWithdrawal` (processor keys are demo-held, disclosed in `demo.md`).

Real mode, in detail (`core/src/real/cascade.ts`):
1. **Trigger.** The indexer hands every *new* `ConsentWithdrawn` event to the engine, whoever relayed it. A background catch-up (at start and with each reconcile) also picks up withdrawn consents whose processors never acknowledged, so a Core restart does not lose a cascade.
2. **Skip what is already settled.** Before notifying, the engine dry-runs `acknowledgeWithdrawal` from the processor: `AlreadyAcknowledged` (a replay of old history), `NotWithdrawn` (re-granted meanwhile) or `NotProcessor` end the attempt silently. So re-reading the chain never re-notifies or double-acknowledges.
3. **Notify.** The company (its key is held by Core, like the processors') signs a notification `{ principal, fiduciary, purposeId, purposeCode, processor, withdrawalTx, withdrawnAt }` (EIP-191 over the keccak256 of its canonical JSON, `shared/src/cascade.ts`). `cascade_acks.notified_at` is set and `cascade.updated` is pushed with `ackedAt: null`: this is the wallet's "told, waiting" state (`ui.md` W-08).
4. **Acknowledge.** The processor stub checks the notification really is signed by the fiduciary, waits `CASCADE_DELAY_MS` (default `1000,3000`), then signs `{ principal, purposeId, processor, notificationDigest, ackedAt }`. Core checks that signature, then sends `acknowledgeWithdrawal` from the processor's key. The indexer sees `WithdrawalAcknowledged`, sets `acked_at` and `tx_hash`, and pushes `cascade.updated` again with the acknowledgement.
5. **Only built-in processors.** Webhook delivery to a processor Core holds no key for is not built: such a processor is skipped with a warning (`webhook_url` is unused for now).

## 10. Deployment and environment

| Item | Value |
|---|---|
| Live demo | Laptop runs Hardhat node, Core, 3 companies, web. Phone on laptop hotspot (or shared hotspot) |
| Proof | `pnpm deploy:amoy` (`hardhat run scripts/deploy.ts --network amoy`). The network comes from the environment: `DEPLOYER_KEY` (a funded account) and optionally `AMOY_RPC_URL`. The addresses, the explorer base and links to both contracts and both deploy transactions go in `shared/deployments.json` under `amoy` |
| Env | `CHAIN_RPC`, `CHAIN_ID`, `RELAYER_KEY`, `ADMIN_KEY`, `DEMO_MODE`, `PORT`, `DB_PATH`, `STUB_MODE` (default `true` until the real Core lands: serves `core/fixtures/*.json` with light in-memory state, no chain) |
| Env (Core, V-06) | `PROCESSOR_PUBLIC_URL` (what `GET /v1/processor` returns; `pnpm demo:up` sets it to the laptop's LAN address on port 4200 like `CORE_PUBLIC_URL`), `PROCESSOR_EVENT_KEY` (default `demo-processor-events`, a disclosed demo secret) |
| Env (Processor) | `PROCESSOR_PORT` (4200), `PROCESSOR_KEY` (`0x` + 64 hex: the X25519 private key; absent means generate at start. Never logged, never sent anywhere), `PROCESSOR_DB_PATH` (`./data/processor.sqlite`), `CORE_URL`, `CHAIN_RPC`, `CHAIN_NETWORK` (as Core), `FIDUCIARY_API_KEYS` (JSON `{ "<key>": "<fiduciary address>" }`, default `sk_demo_<slug>` for the three seed companies), `FIDUCIARY_CALLBACKS` (JSON `{ "<address>": "<url>" }`), `PROCESSOR_EVENT_KEY`, `PROCESSOR_SWEEP_MS` (30000), `DEMO_MODE` |
| Env (QuickLoan) | `PROCESSOR_URL` (default `http://localhost:4200`), `QUICKLOAN_API_KEY` (default `sk_demo_quickloan`) |
| Seed | `pnpm seed` registers 3 fiduciaries, purposes, processors, funds the relayer (idempotent). Fiduciary keys are Hardhat accounts #1 to #3 (`shared/seed.ts`); the relayer is its own demo key (`RELAYER_KEY`, default `DEMO_RELAYER_KEY` in `shared/seed.ts`), topped up to 100 ETH from the admin (account #0) |
| Deployments | `shared/deployments.json`, keyed by network name: `{ "<network>": { chainId, admin, consentRegistry, accessAnchor, startBlock, [explorerUrl, links] } }`. `pnpm deploy:local` writes `localhost`, which is deterministic on a fresh node and has no explorer; `pnpm deploy:amoy` writes `amoy` with `explorerUrl` and `links { consentRegistry, accessAnchor, consentRegistryDeployTx, accessAnchorDeployTx }` |
| Explorer links | Proof responses (`/v1/proof/consent/:txHash`, `/v1/proof/access/:entryId`) and the ledger explorer carry `explorerUrl`: `<explorer>/tx/<hash>` when the deployment has an explorer (Amoy) or `CHAIN_EXPLORER_URL` is set, otherwise `null` (the local chain has none). Stub mode returns fixture links to Amoy's explorer |
| Reset | `pnpm demo:reset` wipes the chain (`hardhat_reset`), redeploys, reseeds, then resets Core's DB and empties the Processor's vault (`POST /v1/demo/reset`; a stopped Processor is not an error). The Processor's own sweep would erase the stale rows anyway, since the chain they referred to is gone |
| One command | `pnpm demo:up` starts everything (the Processor too, on :4200) with Core in real mode (`pnpm demo:up:stub`: Core serves fixtures, no chain; `demo:up:real` is an alias of `demo:up`); `pnpm demo:reset` resets state. It prints the address the QR code will give the phone: the laptop's LAN IPv4, or `CORE_PUBLIC_URL` if set |

## 11. Quality gates
- Contract tests green (§3.3).
- E2E script `pnpm e2e` (`core/scripts/e2e.ts`) plays: reset → create request → sign and grant → ALLOWED → unconsented purpose BLOCKED → withdraw → BLOCKED → processor acknowledgement → verify (clean) → tamper → verify (mismatch pinpointed), and checks the WebSocket feeds. It starts the real stack itself if none is running, uses `POST /v1/demo/anchor` rather than waiting for the timer, completes in under 30 s (`E2E_BUDGET_MS`) and exits non-zero naming the failing step. Run it before every rehearsal.
- Lint and type checks on every merge to `main`.
- Confidential processing (V-01 to V-06) extends `pnpm e2e` with: wallet-side seal → `submit` → evaluate approved → the QuickLoan admin view shows a handle and hash only → withdraw → evaluate answers 451 `CONSENT_WITHDRAWN` → the vault row is erased, and the run's WebSocket events, HTTP responses, process output and database files contain no trace of `ABCDE1234F`. Package tests: envelope vectors (`shared`), no endpoint returns plaintext, tampered ciphertext gives `CIPHERTEXT_INVALID`, erasure rules, rules table (`processor`); the same vectors in Dart, plus a wallet integration test that seals with the Dart code and has the real Processor open it (`wallet/test/integration/real_processor_test.dart`, run with `--dart-define=CORE_URL=...` against `pnpm demo:up`). The e2e searches the stack's console output only when it started the stack itself; against a stack that was already running it searches responses, events and database files, and says so.

## 12. Security notes (say these out loud to judges)
- Replay protection via nonces, domain separation, deadlines.
- Relayer cannot forge consent.
- Fail-closed gateway on ledger outage.
- No personal data on chain; erasure of company-side data does not conflict with immutability.
- Demo shortcuts: company and processor keys are held by Core; production would use company-held keys or HSMs.
- Demo shortcut: the wallet talks to Core over plain HTTP on the venue LAN (Android `usesCleartextTraffic`, iOS `NSAllowsLocalNetworking`), because the laptop has no certificate. Production uses HTTPS only. The wallet sends only addresses, hashes and purpose ids to Core.
- The wallet key sits in secure storage and is read only after a device-credential prompt (app-level gate, not an OS key bound to biometrics).
- Confidential processing: only ciphertext leaves the phone, only the Processor can open it, and Core holds no decryption key. Demo shortcut, said out loud: the Processor is an ordinary process with an in-memory key (a simulated enclave), so whoever administers that machine could read memory. The wallet fetches the Processor's public key over plain HTTP from the address Core names; production uses remote attestation of a TEE so the wallet encrypts only to a key the hardware vouches for (`architecture.md` §5.5). The demo profile is fictional.
