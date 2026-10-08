# Architecture — Sammati

## 1. Design principles
1. **Consent is the source of truth on chain; everything else reads it.** Companies never hold the authoritative copy.
2. **No personal data on chain.** Only pseudonymous addresses, hashes, purpose codes, expiry and status.
3. **Enforcement beats logging.** The gateway makes the decision at request time.
4. **Do not trust the audited party.** The regulator verifies against on-chain anchors, not company logs.
5. **Same model as India's Account Aggregator rails:** a neutral consent layer between the user and many institutions. Judges know this pattern.

## 2. System overview

```
                       ┌────────────────────────────────────────────┐
                       │          CHAIN (Hardhat local / Amoy)      │
                       │  ConsentRegistry          AccessAnchor     │
                       │  - consent state          - Merkle roots   │
                       │  - ledgerHead             - ack events     │
                       └───────▲───────────┬──────────────▲─────────┘
                    signed tx  │   events  │              │ anchor tx
                       (relayer)│          │              │
┌──────────────┐   HTTPS/WS   ┌┴───────────▼─────────────┴──────────┐
│ Sammati      │◄────────────►│          SAMMATI CORE (Node/TS)     │
│ Wallet       │              │  Relayer · Indexer · Cache · Anchor │
│ (Flutter)    │              │  Cascade engine · Audit API · WS    │
│ keys on      │              └───▲──────────────▲───────────▲──────┘
│ device       │                  │ consent       │ logs       │ audit
└──────▲───────┘                  │ cache         │            │ reads
       │ scan QR        ┌─────────┴───────┐  ┌───┴──────────┐ ┌┴──────────────┐
       │                │ GATEWAY SDK     │  │ COMPANY      │ │ AUDITOR WEB   │
       └────────────────┤ requireConsent  │  │ CONSOLE (web)│ │ (regulator)   │
        company QR      │ in each company │  └──────────────┘ └───────────────┘
                        └───▲─────▲─────▲─┘
                            │     │     │
                      QuickLoan MediCare+ FoodRush   (3 demo company backends)
```

## 3. Components

| Component | Tech | Responsibility |
|---|---|---|
| Wallet | Flutter | Key custody, QR scan, consent UI, signing, live feed, proofs, rights |
| Sammati Core | Node + TypeScript + SQLite | Relayer (pays gas), chain indexer, consent cache, cascade engine, log anchoring, audit APIs, WebSocket hub |
| Gateway SDK | TypeScript package | Express middleware used by every company backend; reads consent cache with chain fallback; writes hash-chained access logs |
| Demo companies | 3 small Express apps | Hold fake customer data behind guarded endpoints |
| Company Console | React web | Purposes, QR requests, live feed, consent table, processors |
| Auditor | React web | Scorecards, ledger explorer, tamper verification, report export |
| Contracts | Solidity + Hardhat | ConsentRegistry, AccessAnchor |

## 4. Trust model

| Party | Can do | Cannot do |
|---|---|---|
| Citizen | Grant/withdraw by signing | Be impersonated; the contract verifies the signature |
| Company | Register purposes, query data through the gateway, anchor logs | Forge or edit a consent, delete a withdrawal, hide a log without breaking the anchor |
| Relayer | Submit signed messages, pay gas | Create consent on a user's behalf (no signature, no effect) |
| Regulator | Read everything, verify independently | Alter state |

**Honest limitation:** the gateway is run by the company, so a malicious company could bypass it. Sammati detects this: any data access not present in the anchored log, or any anchored access without valid consent at that time, is flagged by the Auditor. We provide *prevention for honest implementers and detection for dishonest ones*.

## 5. Key flows

### 5.1 Grant consent
1. Company console creates a consent request (fiduciary, purposes, notice text hash) and shows a QR.
2. Wallet scans, fetches the notice, user toggles purposes and picks expiry.
3. Wallet builds `GrantConsent` typed data and signs with the device key (biometric).
4. Core relayer calls `grantConsent(req, sig)`. Contract verifies signature, nonce, deadline, then stores state and updates `ledgerHead`.
5. Indexer sees `ConsentGranted`, updates the cache, pushes `consent.updated` over WebSocket to wallet, console and gateways.

### 5.2 Enforce at request time
1. A company endpoint wrapped in `requireConsent('credit_check')` receives a request carrying a principal address.
2. SDK checks the cache (`status == Active && now < expiresAt`). On cache miss or staleness it calls `hasValidConsent` on chain.
3. Decision is ALLOWED (continue) or BLOCKED (HTTP 451 + reason). Either way an access-log entry is appended.
4. Log entry hash = `keccak(prevHash, canonicalEntry)`. Entries are batched into a Merkle tree; the root is anchored via `anchorAccessBatch`.
5. WebSocket pushes `access.logged` to the wallet feed and company console.

### 5.3 Withdraw and cascade
1. User toggles a purpose off and confirms. Wallet signs `WithdrawConsent`.
2. Relayer submits. Contract flips status to Withdrawn and emits `ConsentWithdrawn`.
3. Indexer updates cache; gateways block the next request immediately.
4. Cascade engine notifies each registered downstream processor for that purpose.
5. Each processor returns a signed acknowledgement; Core records it and emits `WithdrawalAcknowledged`. Wallet shows the cascade list filling in.

### 5.4 Tamper detection
1. Auditor selects a company and runs **Verify**.
2. Core recomputes the access-log hash chain from the company's stored logs, rebuilds the Merkle roots per batch, compares to `AccessAnchor` roots.
3. Any mismatch points to the exact batch and record. Demo control `Tamper` edits one stored row beforehand to show the alarm.

## 6. Why blockchain here (the answer to "why not a database?")
- **Consent is a dispute between a user and a company.** The company cannot be the one holding the evidence.
- **User-signed state** gives non-repudiation both ways.
- **One shared state for many companies and a regulator**, with no single owner. A withdrawal reaches every company at once.
- **Independent verifiability:** auditors and users check proofs without asking anyone's permission.
- We deliberately keep it light: hashes only, gasless for users, testnet or permissioned in practice.

## 7. Production path (for the pitch's last 20 seconds)
- Permissioned or L2 chain operated by a consortium of consent managers (similar to the Account Aggregator ecosystem).
- Hardware-backed keys with social or Aadhaar-linked recovery.
- Gateway delivered as a sidecar or API-gateway plugin.
- Zero-knowledge proofs for "consent exists" checks without revealing purpose details.

## 8. Failure modes

| Failure | Behaviour |
|---|---|
| Chain node down | Gateway uses last cached state up to a short TTL, then fails closed (BLOCKED, reason `LEDGER_UNAVAILABLE`) |
| Core down | Wallet shows offline banner; no signing without a notice fetched |
| Relayer out of funds | Alert in console; demo wallet topped up at start |
| Clock skew | Expiry uses block timestamp on chain; cache re-validates |
