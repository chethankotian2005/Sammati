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
                          │ handle in, decision out
                          ▼                      reads consent straight from the chain
        ┌─────────────────────────────────────┐  writes access log through the gateway SDK
 wallet │ SAMMATI PROCESSOR  (port 4200)      │◄── ciphertext only, from the wallet
 ──────►│ vault (ciphertext) · private key    │    (Core never sees an envelope or holds a key)
        │ simulated enclave, key in memory    │
        └─────────────────────────────────────┘
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
| Sammati Processor | Node + TypeScript + SQLite | The only place a vault envelope is opened. Stores ciphertext, checks consent on chain, runs the loan rules, returns a decision, erases on withdrawal or expiry, logs each use through the gateway SDK |

## 4. Trust model

| Party | Can do | Cannot do |
|---|---|---|
| Citizen | Grant/withdraw by signing | Be impersonated; the contract verifies the signature |
| Company | Register purposes, query data through the gateway, anchor logs | Forge or edit a consent, delete a withdrawal, hide a log without breaking the anchor. Read the customer's vault data: it gets handles and decisions only |
| Relayer | Submit signed messages, pay gas | Create consent on a user's behalf (no signature, no effect) |
| Regulator | Read everything, verify independently | Alter state |
| Sammati Core | Relay, index, cache, anchor, fan out events | Read vault data: it never receives an envelope, holds no key, and cannot make the Processor decrypt (the Processor reads consent from the chain itself) |
| Sammati Processor | Open an envelope in memory when the chain shows valid consent for that purpose, return a decision | Return plaintext to anyone, use data for another purpose (the envelope is bound to one purpose and the check is per purpose), keep data after consent ends, or hide a use (every evaluation is a hash-chained, anchored log entry). **In this build it is also the one component you must trust** (see the limitation below) |

**Honest limitation:** the gateway is run by the company, so a malicious company could bypass it. Sammati detects this: any data access not present in the anchored log, or any anchored access without valid consent at that time, is flagged by the Auditor. We provide *prevention for honest implementers and detection for dishonest ones*.

**Honest limitation, Processor:** in the hackathon build the Processor is a separate service with an in-memory key, a **simulated enclave**. Nothing stops whoever administers the machine it runs on from reading its memory, and the wallet takes its public key on trust from the address Core names. What the build does prove is the data flow: sensitive data leaves the phone encrypted, is stored only as ciphertext, is opened in one place, and the company still gets its answer. The production path is to run the Processor inside a TEE with remote attestation (for example AWS Nitro Enclaves or Intel SGX): the enclave proves what code it runs and holds the key sealed to that code, the wallet encrypts only to a key that attestation vouches for, and then even the operator cannot read the data. Sammati Core never holds a decryption key in either case.

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

### 5.5 Confidential processing
Use without reading: QuickLoan gets a loan decision from data it never sees.
1. **Fetch the key.** The wallet asks Core where the Processor is (`GET /v1/processor`), then fetches its public key (`GET /v1/processor/pubkey`, labelled `simulated-enclave`).
2. **Encrypt on the phone.** After the user has given consent for `credit_check`, the wallet seals the demo profile (PAN, income band, score) into an envelope for that key, bound to this customer, company and purpose (`trd.md` §4.4). Plaintext never leaves the phone. The user confirms with the device lock and the wallet signs the submission.
3. **Store ciphertext.** `POST /v1/vault/submit` to the Processor. It checks the signature and `hasValidConsent` on chain, stores only the ciphertext under `handle = keccak256(envelope)`, and tells QuickLoan's webhook the handle. QuickLoan stores the handle and nothing else. Events `vault.encrypted` and `vault.stored` reach the wallet and the console.
4. **Ask for a decision.** QuickLoan's apply endpoint calls `POST /v1/processor/evaluate` with its API key and the handle. The Processor checks consent on chain again (fail closed), opens the envelope in memory, applies the rules, and returns `{ decision, limit, reasonCodes }`. The plaintext goes out of scope with the function. The use is written to QuickLoan's hash-chained access log through the gateway SDK, so it is anchored and visible in the wallet's activity feed and to the Auditor.
5. **Withdraw.** The user withdraws `credit_check`. The Processor sees the consent change (and re-checks on every call and every sweep), erases the ciphertext (`vault.erased`), and the next evaluate answers `451 CONSENT_WITHDRAWN`. The data is gone, not just blocked. Cascade (5.3) is separate: it tells downstream processors, while this erases at the Processor itself.

```
wallet ──ciphertext──► Processor ──handle──► QuickLoan (webhook, stores handle only)
QuickLoan ──handle + API key──► Processor ──decision only──► QuickLoan
Processor ──consent read──► chain        Processor ──access-log entry──► Core (via SDK) ──► anchor
Processor ──events (hashes, no data)──► Core ──► wallet · console · stage
```

**Seeing it.** The Data Flow Inspector (`ui.md` §5.1, `trd.md` §6.9) draws these hops from the real events and responses: the phone's own fields, the ciphertext in transit, what QuickLoan's staff and database administrators can reach (ciphertext only), and the sealed Processor's states. It is a viewer; it never decrypts, and it checks every event of the session for the demo values before it claims that no plaintext was visible.

**What each party can see.** Wallet: everything, it is the owner. Processor: plaintext for the duration of one evaluation. QuickLoan, Core, the web apps, the Auditor, a database dump: handles, hashes, ciphertext, decisions, never the data.

**What stops a company asking for another purpose.** The envelope is authenticated with the purpose in its AAD, the evaluate call is checked against consent for the purpose it names, and the attempt, allowed or blocked, is an anchored log entry. A company that asks for `marketing` with a `credit_check` handle is refused (`NO_CONSENT`) and the refusal is on the record.

### 5.6 Asking a specific customer (no QR)
1. The customer registers a Sammati ID in the wallet (`asha@sammati`): a signed message, `trd.md` §4.5. Core stores handle to address; nothing else.
2. A company's console posts a request to that handle. Core answers the company with an opaque request id and `sent`, **the same answer for any well-formed handle**. If the handle is registered and the customer has not blocked the company or reached the open-request limit, Core pushes `consent.requested` to the wallet's socket; otherwise nothing is pushed and the request quietly expires.
3. The wallet shows the request in its inbox within a second or two. **Review** opens the ordinary consent notice (W3): the notice hash is recomputed on the phone and the grant is an ordinary EIP-712 `GrantConsent`. Opening it makes the company's status Seen; granting makes it Granted; **Decline** and **Block this company** are signed messages that Core stores and respects.
4. The company never learns the customer's address from any of this. It hears Seen, Granted or Declined by request id; the address appears in its consents table only once consent exists, as with a QR.

Trust: Core is trusted to apply the rules above (it holds the handle map). It cannot grant consent for anyone (no signature, no effect). The honest limit is in `trd.md` §6.11: a company may still infer registration by other means.

### 5.7 Expiry, renewal and alerts
1. Core's scheduler (every 30 s; seconds in `DEMO_FAST_EXPIRY`) looks at every Active consent in its cache. As expiry approaches it records `consent.expiring` once per threshold, and when it passes `consent.expired` once, in `notifications`, and pushes each to the customer's socket. Enforcement does not wait for it: the gateway and the Processor read the chain, so the consent stops working at the second it expires and the scheduler only tells the customer.
2. The Processor refuses use on expiry at once, keeps the ciphertext for a short grace period so a renewal needs no resend, then erases it and reports `vault.erased`; Core turns that into **data erased** for the wallet. Cascade acknowledgements become notifications the same way.
3. A company may ask a customer to renew (console, **Request renewal**). That is an ordinary request for one purpose: it appears in the wallet's inbox and Alerts, goes through the same notice and EIP-712 grant, and the company hears Sent, Seen, Granted by request id. Pressing **Renew** on a reminder does the same with a request Core opens on the customer's behalf.
4. The phone: a live event raises a local notification; reminders for consents the wallet knows are also scheduled on the device from the expiry time, so they fire with the app closed. Closed-app delivery of company-initiated alerts needs Firebase and is not built (`trd.md` §6.12).

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
- The Processor in a TEE (AWS Nitro Enclaves or Intel SGX) with remote attestation, so even its operator cannot read the data (`§4`, honest limitation).

## 8. Failure modes

| Failure | Behaviour |
|---|---|
| Chain node down | Gateway uses last cached state up to a short TTL, then fails closed (BLOCKED, reason `LEDGER_UNAVAILABLE`) |
| Core down | Wallet shows offline banner; no signing without a notice fetched. The inbox keeps its last known list, and Decline and Block wait for a connection |
| Wallet offline when a request is sent | Nothing is lost: the request waits in the inbox until it expires, and the wallet fetches the list when it reconnects |
| Relayer out of funds | Alert in console; demo wallet topped up at start |
| Clock skew | Expiry uses block timestamp on chain; cache re-validates |
| Processor cannot read the chain | Submit and evaluate answer `451 LEDGER_UNAVAILABLE`, nothing is decrypted, **nothing is erased** (an outage must not destroy data) |
| Processor down | The wallet's secure-send fails with a retry; QuickLoan's apply answers an error (502), never a decision from anywhere else. Vault rows survive a restart; the key does not unless `PROCESSOR_KEY` is set, so after a restart without it old ciphertext answers `CIPHERTEXT_INVALID` until the wallet submits again |
| Ciphertext edited in storage | AES-GCM authentication fails; evaluate answers 422 `CIPHERTEXT_INVALID`, never a guess |
| Core down | The Processor keeps working (it reads the chain itself); its log entries queue in the SDK and events are dropped with a warning, never blocking a response |
