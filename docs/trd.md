# TRD — Sammati

## 1. Stack

| Layer | Choice | Notes |
|---|---|---|
| Contracts | Solidity ^0.8.24, Hardhat, OpenZeppelin (`EIP712`, `ECDSA`) | TypeScript tests |
| Core service | Node 20, TypeScript, Express, `ethers` v6, `better-sqlite3`, `ws` | Single process: relayer + indexer + cache + anchor + cascade + audit API |
| Gateway SDK | TypeScript package `@sammati/gateway` | Express middleware |
| Demo companies | 3 Express apps (ports 4101, 4102, 4103) | Fake data only |
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
  web/              # company console + auditor + stage
  wallet/           # Flutter app
  shared/           # TS types, EIP-712 definitions, canonical JSON, merkle utils
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

## 5. Wallet technical notes
Packages: `flutter_riverpod`, `go_router`, `dio`, `web_socket_channel`, `mobile_scanner`, `flutter_secure_storage`, `local_auth`, `web3dart`, `eth_sig_util`, `flutter_local_notifications`, `flutter_localizations` + `intl`, `url_launcher`.
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
| GET | `/v1/principals/:addr/cascade/:purposeId` | Processor acknowledgements |
| GET | `/v1/proof/consent/:txHash` | Event data, ledger head, explorer link |
| GET | `/v1/proof/access/:entryId` | Entry, Merkle path, anchor tx |

Multi-purpose grants: the contract needs consecutive nonces, so the wallet signs the i-th purpose the user switched on (in notice order) with `nonce + i` and posts the grants one after another. A purpose the user left off does not consume a nonce. Before signing, the wallet re-fetches the notice (fresh nonce) and refuses if its `noticeHash` differs from the one shown.

`qrPayload` (JSON in QR): `{ "v":1, "core":"http://...", "requestId":"...", "fiduciary":"0x..", "name":"QuickLoan" }`.

### 6.2 Company and gateway
| Method | Path | Purpose |
|---|---|---|
| GET | `/v1/fiduciaries/:fid/purposes` | List registered purposes |
| POST | `/v1/fiduciaries/:fid/purposes` | Register purpose (writes chain) |
| POST | `/v1/fiduciaries/:fid/processors` | Register downstream processor |
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
| POST | `/v1/demo/fire` | Fire a request (used by the console simulator). Body `{ fiduciary, purposeCode, principal }`. In real mode Core calls the company's own guarded endpoint for that purpose (`GUARDED_ENDPOINTS` in `shared/seed.ts`, with `x-sammati-principal`), so the gateway SDK decides and writes the log, and the answer is that decision with the log entry id from `x-sammati-entry-id`; an unreachable company is 502 `COMPANY_UNREACHABLE`. In stub mode Core simulates the decision itself (optional `endpoint` labels the simulated log entry) |

### 6.5 WebSocket `/ws`
Subscribe message: `{ "sub": ["principal:0x..", "fiduciary:0x..", "auditor"] }`.
Core answers a subscribe message with an acknowledgement `{ "event": "subscribed", "topics": [...] }` once the topics are active (the gateway trusts its consent cache only after this; other clients may ignore it).
Events: `consent.updated`, `access.logged`, `cascade.updated`, `anchor.posted`, `tamper.alert`.
Payloads include the entity ids and the minimal fields the UI renders.

### 6.6 Real mode (`STUB_MODE=false`)
Same paths, shapes and error codes as the stub, backed by SQLite (`drd.md` §3), the chain and a relayer wallet.
- **Grant/withdraw:** the relayer submits `grantConsent` / `withdrawConsent` and waits for the receipt, so `status` is `"confirmed"`. Contract reverts map to HTTP errors: `InvalidSignature` → 400 `BAD_SIGNATURE`, `InvalidNonce` → 409 `BAD_NONCE`, `SignatureExpired` → 400 `DEADLINE_PASSED`, `InvalidExpiry` → 400 `BAD_EXPIRY`, `UnknownPurpose` → 404 `PURPOSE_NOT_FOUND`, `WrongFiduciary` → 400 `WRONG_FIDUCIARY`, `PurposeInactive` → 409 `PURPOSE_INACTIVE`, `NotActive` → 409 `NOT_ACTIVE`. An unreachable node is 503 `LEDGER_UNAVAILABLE`.
- **Indexer:** polls chain events into `ledger_events` and `consents_cache` (and `anchor_batches`, `cascade_acks`), pushes `consent.updated`, `cascade.updated` and `anchor.posted`, and resumes from `indexer_state`. It also ingests the receipt of every relayed transaction immediately; the unique `(tx_hash, log_index)` key makes the two paths agree.
- **`/v1/gateway/consent-state`** reads the chain directly (the cache can lag), and answers 503 `LEDGER_UNAVAILABLE` when it cannot, which the SDK treats as BLOCKED (fail closed).
- **Request notices:** `GET /v1/requests/:id` expires a request after `REQUEST_TTL_SECONDS` (default 1800) with 410 `REQUEST_EXPIRED`. The seeded `req_demo_quickloan` never expires.
- **Not built yet in real mode (501 `NOT_IMPLEMENTED`):** `POST /v1/fiduciaries/:fid/purposes` and `/processors` (the seed registers them). The cascade engine (§9) is also not built: `GET .../cascade/:purposeId` lists processors with null timestamps until a `WithdrawalAcknowledged` event arrives, and until then every withdrawal older than 30 s counts as an unacknowledged cascade in the scorecard. The audit report is not signed (A-04 asks for it); `reportHash` and signing are future work.
- **Config:** `STUB_MODE=false`, `CHAIN_RPC` (default `http://127.0.0.1:8545`), `CHAIN_NETWORK` (the key in `shared/deployments.json`, default `localhost`), `RELAYER_KEY` (default the demo relayer), `DB_PATH` (default `./data/sammati.sqlite`). Core waits for the chain and contracts at startup rather than exiting. Start it with `pnpm demo:up:real`.

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
| Seed | `pnpm seed` registers 3 fiduciaries, purposes, processors, funds the relayer (idempotent). Fiduciary keys are Hardhat accounts #1 to #3 (`shared/seed.ts`); the relayer is its own demo key (`RELAYER_KEY`, default `DEMO_RELAYER_KEY` in `shared/seed.ts`), topped up to 100 ETH from the admin (account #0) |
| Deployments | `shared/deployments.json`, keyed by network name: `{ "<network>": { chainId, admin, consentRegistry, accessAnchor, startBlock, [explorerUrl, links] } }`. `pnpm deploy:local` writes `localhost`, which is deterministic on a fresh node and has no explorer; `pnpm deploy:amoy` writes `amoy` with `explorerUrl` and `links { consentRegistry, accessAnchor, consentRegistryDeployTx, accessAnchorDeployTx }` |
| Explorer links | Proof responses (`/v1/proof/consent/:txHash`, `/v1/proof/access/:entryId`) and the ledger explorer carry `explorerUrl`: `<explorer>/tx/<hash>` when the deployment has an explorer (Amoy) or `CHAIN_EXPLORER_URL` is set, otherwise `null` (the local chain has none). Stub mode returns fixture links to Amoy's explorer |
| Reset | `pnpm demo:reset` wipes the chain (`hardhat_reset`), redeploys, reseeds, then resets Core's DB |
| One command | `pnpm demo:up` starts everything; `pnpm demo:reset` resets state |

## 11. Quality gates
- Contract tests green (§3.3).
- E2E script `pnpm e2e` (`core/scripts/e2e.ts`) plays: reset → create request → sign and grant → ALLOWED → unconsented purpose BLOCKED → withdraw → BLOCKED → processor acknowledgement → verify (clean) → tamper → verify (mismatch pinpointed), and checks the WebSocket feeds. It starts the real stack itself if none is running, uses `POST /v1/demo/anchor` rather than waiting for the timer, completes in under 30 s (`E2E_BUDGET_MS`) and exits non-zero naming the failing step. Run it before every rehearsal.
- Lint and type checks on every merge to `main`.

## 12. Security notes (say these out loud to judges)
- Replay protection via nonces, domain separation, deadlines.
- Relayer cannot forge consent.
- Fail-closed gateway on ledger outage.
- No personal data on chain; erasure of company-side data does not conflict with immutability.
- Demo shortcuts: company and processor keys are held by Core; production would use company-held keys or HSMs.
- Demo shortcut: the wallet talks to Core over plain HTTP on the venue LAN (Android `usesCleartextTraffic`, iOS `NSAllowsLocalNetworking`), because the laptop has no certificate. Production uses HTTPS only. The wallet sends only addresses, hashes and purpose ids to Core.
- The wallet key sits in secure storage and is read only after a device-credential prompt (app-level gate, not an OS key bound to biometrics).
