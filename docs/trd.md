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
// views
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
- On every state change: `ledgerHead = keccak256(abi.encode(ledgerHead, actionHash))`.

Events:
```solidity
event FiduciaryRegistered(address indexed fiduciary, string name);
event PurposeRegistered(address indexed fiduciary, bytes32 indexed purposeId, bytes32 descHash);
event ProcessorRegistered(bytes32 indexed purposeId, address indexed processor);
event ConsentGranted(address indexed principal, address indexed fiduciary, bytes32 indexed purposeId, uint64 expiresAt, bytes32 noticeHash, bytes32 ledgerHead);
event ConsentWithdrawn(address indexed principal, address indexed fiduciary, bytes32 indexed purposeId, bytes32 ledgerHead);
event WithdrawalAcknowledged(address indexed principal, bytes32 indexed purposeId, address indexed processor, uint64 at);
```

### 3.2 AccessAnchor
```solidity
function anchorAccessBatch(bytes32 merkleRoot, uint64 fromSeq, uint64 toSeq, uint32 count) external; // onlyFiduciary
function getBatch(address fiduciary, uint256 index) external view returns (bytes32 root, uint64 fromSeq, uint64 toSeq, uint32 count, uint64 at);
function batchCount(address fiduciary) external view returns (uint256);
event AccessBatchAnchored(address indexed fiduciary, uint256 indexed index, bytes32 merkleRoot, uint64 fromSeq, uint64 toSeq, uint32 count);
```

### 3.3 Tests (must pass before integration)
1. Valid signature grants; wrong signer, replayed nonce, expired deadline all revert.
2. Withdraw flips state; `hasValidConsent` false immediately.
3. Expiry makes `hasValidConsent` false without any transaction.
4. Re-grant after withdrawal works.
5. `ledgerHead` changes on each action and is deterministic.
6. Processor ack only from registered processors.
7. Anchor stores roots and enforces monotonic `fromSeq`.

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

### 6.4 Demo controls (guarded by `DEMO_MODE=true`)
| Method | Path | Purpose |
|---|---|---|
| POST | `/v1/demo/tamper/:fid` | Mutate one stored access-log row |
| POST | `/v1/demo/reset` | Reset DB and redeploy seed |
| POST | `/v1/demo/fire` | Fire a simulated company request (used by the console simulator) |

### 6.5 WebSocket `/ws`
Subscribe message: `{ "sub": ["principal:0x..", "fiduciary:0x..", "auditor"] }`.
Events: `consent.updated`, `access.logged`, `cascade.updated`, `anchor.posted`, `tamper.alert`.
Payloads include the entity ids and the minimal fields the UI renders.

## 7. Gateway SDK

```ts
import { sammati } from '@sammati/gateway';

const gate = sammati({ coreUrl, fiduciary: QUICKLOAN_ADDRESS, signer: fiduciaryKey });

app.get('/customers/:id/credit-profile',
  gate.requireConsent({ purpose: 'credit_check', principalFrom: req => req.header('x-sammati-principal') }),
  handler);
```
Behaviour:
1. Resolve principal address. Missing principal returns 451 `NO_PRINCIPAL`.
2. Check local consent cache (kept fresh by WebSocket). If missing or older than 5 s, call `/v1/gateway/consent-state`.
3. Active and unexpired: `next()`. Otherwise respond `451 { code: "CONSENT_WITHDRAWN" | "CONSENT_EXPIRED" | "NO_CONSENT" | "LEDGER_UNAVAILABLE" }`.
4. Append a log entry (see `drd.md` §3) and POST it to Core asynchronously. Never block the response on logging.

## 8. Log hashing and anchoring
- Canonical JSON (sorted keys, no whitespace) of the entry without `hash`.
- `entry.hash = keccak256(prevHash || canonicalBytes)`; first entry uses a zero `prevHash` per fiduciary.
- Anchor job: every 10 seconds, or after 20 entries, build a Merkle tree over `entry.hash` values (sorted pairs, keccak), call `anchorAccessBatch`.
- Verification recomputes everything from stored rows and compares roots.

## 9. Cascade engine
On `ConsentWithdrawn`: look up processors for the purpose; for each, POST a signed notification to the processor's webhook (demo processors are in-process stubs). Each stub waits a random 1–3 s, signs an ack, and Core calls `acknowledgeWithdrawal` (processor keys are demo-held, disclosed in `demo.md`).

## 10. Deployment and environment

| Item | Value |
|---|---|
| Live demo | Laptop runs Hardhat node, Core, 3 companies, web. Phone on laptop hotspot (or shared hotspot) |
| Proof | `hardhat run scripts/deploy.ts --network amoy`; store addresses and an explorer link in `shared/deployments.json` |
| Env | `CHAIN_RPC`, `CHAIN_ID`, `RELAYER_KEY`, `ADMIN_KEY`, `DEMO_MODE`, `PORT`, `DB_PATH`, `STUB_MODE` (default `true` until the real Core lands: serves `core/fixtures/*.json` with light in-memory state, no chain) |
| Seed | `pnpm seed` registers 3 fiduciaries, purposes, processors, funds the relayer |
| One command | `pnpm demo:up` starts everything; `pnpm demo:reset` resets state |

## 11. Quality gates
- Contract tests green (§3.3).
- E2E script `pnpm e2e` runs: grant → allowed → withdraw → blocked → tamper → verify fails, in under 30 s. Run it before every rehearsal.
- Lint and type checks on every merge to `main`.

## 12. Security notes (say these out loud to judges)
- Replay protection via nonces, domain separation, deadlines.
- Relayer cannot forge consent.
- Fail-closed gateway on ledger outage.
- No personal data on chain; erasure of company-side data does not conflict with immutability.
- Demo shortcuts: company and processor keys are held by Core; production would use company-held keys or HSMs.
- Demo shortcut: the wallet talks to Core over plain HTTP on the venue LAN (Android `usesCleartextTraffic`, iOS `NSAllowsLocalNetworking`), because the laptop has no certificate. Production uses HTTPS only. The wallet sends only addresses, hashes and purpose ids to Core.
- The wallet key sits in secure storage and is read only after a device-credential prompt (app-level gate, not an OS key bound to biometrics).
