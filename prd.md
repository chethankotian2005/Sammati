# PRD — Sammati

## 1. Vision
Make consent behave like payments in India: one wallet, instant, revocable, verifiable. Just as UPI made it trivial to pay any merchant, Sammati makes it trivial to control who may use your data, and makes "withdraw" actually stop the data flow.

## 2. Problem
- India's DPDP Act requires clear, purpose-specific consent, withdrawal "as easy as" giving it, and proof of compliance.
- Today consent lives in each company's own database. Users cannot see it in one place, companies can quietly edit it, and withdrawal rarely stops anything downstream.
- Regulators must trust the audited party's own logs.

## 3. Personas

| Persona | Name | Needs |
|---|---|---|
| Data Principal (citizen) | Asha, 29, uses a loan app, a health app and a food app | One place to see and control consent; certainty that "withdraw" works; plain language in her own language |
| Data Fiduciary (company) | Ravi, compliance lead at QuickLoan | Drop-in way to ask for consent, enforce it in code, and produce audit evidence |
| Regulator | Meera, auditor at the Data Protection Board | Independently verify a company's consent history without asking them for logs |

## 4. Goals
1. Judges understand the product in under 30 seconds and the demo in 4 minutes.
2. Show the full loop live: grant, allowed access, withdraw, **blocked access**, tamper detected, audit proof.
3. Feel like a real product, not a hackathon prototype.

## 5. Non-goals
- Real Aadhaar/DigiLocker integration, real KYC, real company data.
- Production-grade key recovery, mainnet deployment, legal certification.
- Handling personal data itself: Sammati stores consent metadata only. The Processor (§6.5) handles only a fictional demo profile, as ciphertext, and decrypts it in memory.
- A real trusted execution environment. The Processor is a simulated enclave (`architecture.md` §5.5).

## 6. Features

Priority: **P0** = golden demo path, must work flawlessly. **P1** = strong differentiator. **P2** = stretch.

### 6.1 Citizen Wallet (Flutter)

| ID | Feature | Pri | Acceptance criteria |
|---|---|---|---|
| W-01 | Create wallet | P0 | First launch generates a keypair on device, stored in secure storage, gated by biometric/PIN. No seed phrase shown in the main flow |
| W-02 | Scan to connect | P0 | Scanning a company QR opens that company's consent notice in under 2 seconds |
| W-03 | Purpose-wise consent | P0 | Each purpose has its own toggle, plain-language description, data categories, retention, and expiry choice (30 days / 6 months / 1 year). Nothing is pre-ticked |
| W-04 | Consent home | P0 | Cards per company showing each purpose as Active, Expired or Withdrawn, updated live |
| W-05 | One-tap withdraw | P0 | Withdrawing a purpose takes at most 2 taps (toggle + confirm), no more steps than granting it |
| W-06 | Live activity feed | P0 | Shows each data access by company and purpose with ALLOWED or BLOCKED, within 2 seconds of the event |
| W-07 | Proof screen | P1 | For any consent or access: tx hash, ledger head, "Verify on chain" action and block explorer link; Merkle proof check for an access record |
| W-08 | Cascade status | P1 | After withdrawal, shows each downstream processor and when it acknowledged |
| W-09 | Languages | P1 | English, Hindi, Kannada, switchable at runtime, applied to consent notices too |
| W-10 | Data rights | P1 | Request access, request erasure, raise grievance, each logged and visible in status |
| W-11 | Expiry reminders | P2 | Local notification 3 days before a consent expires |
| W-12 | Nominee | P2 | Nominate a trusted person (DPDP right) |
| W-13 | Share your details securely | P1 | After consenting to a data-using purpose, the wallet offers a screen (W10) that collects the sensitive fields (PAN, income band, employment) from the local demo profile or by manual entry, validates them on the device, encrypts them for the Processor (V-01) and uploads only the ciphertext. The fields are never stored by the wallet, never sent anywhere in plain form and are cleared from memory once sent. Available in English, Hindi and Kannada |

### 6.2 Gateway + Company Console

| ID | Feature | Pri | Acceptance criteria |
|---|---|---|---|
| C-01 | Purpose registry | P0 | Company defines purposes (code, plain description, data categories, retention, third-party sharing flag); registered on chain |
| C-02 | Consent request QR | P0 | Console generates a QR for a customer + chosen purposes |
| C-03 | Gateway SDK | P0 | `requireConsent(purpose)` middleware wraps any endpoint. No valid consent returns HTTP 451 with a reason code. Valid consent passes through |
| C-04 | Live request feed | P0 | Console shows each request as ALLOWED or BLOCKED with purpose, principal alias, latency |
| C-05 | Demo data simulator | P0 | Buttons that fire real requests at the company's guarded endpoints (e.g. "Run credit check", "Send marketing SMS") |
| C-06 | Downstream processors | P1 | Company lists processors per purpose; on withdrawal each receives a notification and returns a signed acknowledgement |
| C-07 | Consent table | P1 | Live table of customers and per-purpose status |
| C-08 | Compliance export | P1 | One-click evidence pack for the regulator |
| C-09 | Demo company portal | P1 | A QuickLoan customer page (`/portal/quickloan`): demo login with a company-side alias, a loan application form with one unticked consent checkbox and the purposes listed beneath it in plain language; ticking it creates the consent request and shows the QR inline with a live status; the page follows the customer through consent received, data submitted securely, decided and withdrawn from real events. It never asks for, receives, shows or logs a PAN or an income, and no text input of the login or the form takes one. Apply calls the QuickLoan backend, which calls the Processor with the handle only; the decision card shows approved or declined, the limit and the reasons, never the data |

### 6.2b Reaching a customer without a QR

A company can ask a specific customer for consent, and the customer is told in the wallet at once. Design in `trd.md` §4.5 and §6.11, `architecture.md` §5.6.

| ID | Feature | Pri | Acceptance criteria |
|---|---|---|---|
| N-01 | Sammati ID | P1 | The wallet registers a handle like `asha@sammati` by signing a short plain message (no new EIP-712 type); Core stores handle to principal in `identities`. One handle per wallet, each handle unique. No phone number or email is stored or asked for. A company can address a handle only to send a request: no API returns a principal address to a company before that customer has granted consent |
| N-02 | Targeted consent request | P1 | A company posts a request to a handle with purposes, an optional message and an expiry. The customer's wallet receives `consent.requested` over the WebSocket. The company sees only an opaque request id and a status (Sent, Seen, Granted, Declined, Expired). The answer to the company is **identical** for a known handle, an unknown handle, a blocked company and a customer at the open-request limit, so a company cannot learn who is registered. Abuse controls: a per-company rate limit, a cap on open requests per customer per company, requests that expire, Decline, and Block this company (stored in Core and respected) |
| W-14 | Requests inbox | P1 | A badge on the wallet's Home opens a list of open requests. Each is a card (company, purposes, message, expiry) with Review (the existing consent notice W3), Decline and Block this company. A new request arrives with a brief colour wash within 2 seconds of being sent. Offline, the last known list is shown. English, Hindi and Kannada. Blocked companies can be listed and unblocked |

The console's "New consent request" gains a second tab, "Send to user" (a Sammati ID field and the status of each request sent). The QR stays for in-person use.

### 6.3 Regulator Auditor

| ID | Feature | Pri | Acceptance criteria |
|---|---|---|---|
| A-01 | Company scorecard | P1 | Per company: consents granted, withdrawn, access allowed, access blocked, withdrawal-to-block latency, unacknowledged cascades |
| A-02 | Ledger explorer | P0 | Filterable list of consent events with tx hash, signer, ledger head |
| A-03 | Tamper detection | P0 | Recomputes a company's access-log hash chain and Merkle roots against on-chain anchors; flags any mismatch with the exact record |
| A-04 | Audit report | P1 | Downloadable JSON/PDF report signed by the auditor session, listing evidence and verification results |
| A-05 | Grievance overview | P2 | Aggregate of citizen grievances per company |

### 6.4 Ledger and chain

| ID | Feature | Pri | Acceptance criteria |
|---|---|---|---|
| B-01 | ConsentRegistry | P0 | Stores consent state per principal, fiduciary, purpose. Enforces grant, withdraw, expiry rules |
| B-02 | User-signed actions | P0 | Grant and withdraw require a valid EIP-712 signature from the principal; a relayer submits them |
| B-03 | Gasless UX | P0 | The user never holds or pays gas |
| B-04 | AccessAnchor | P0 | Fiduciaries anchor Merkle roots of their access logs on chain |
| B-05 | Ledger head | P1 | Rolling hash over every action so a missing or reordered event is detectable |
| B-06 | Testnet proof | P1 | Same contracts deployed to Polygon Amoy with a public explorer link |

### 6.5 Confidential processing (Sammati Processor)

Consent says who may use data; this makes "may use" mean "may get an answer from", not "may read". The customer's sensitive data is encrypted on the phone, stored only as ciphertext, and decrypted only inside the Sammati Processor, which returns a decision and nothing else. Design in `trd.md` §4.4 and §6.7, `architecture.md` §5.5.

| ID | Feature | Pri | Acceptance criteria |
|---|---|---|---|
| V-01 | Envelope encryption in the wallet | P0 | The wallet encrypts the customer's demo profile (PAN, income band, score) on the device for the Processor's public key (X25519 + HKDF-SHA256 + AES-256-GCM), bound to one company and one purpose. The plaintext never leaves the phone. The TypeScript (`shared/src/envelope.ts`) and Dart (`wallet/lib/core/envelope.dart`) implementations pass the same test vectors in `shared/test-vectors/envelope.json` |
| V-02 | Vault: ciphertext only | P0 | `POST /v1/vault/submit` stores an envelope only after the principal's signature and an Active consent for that purpose are verified on chain. Only ciphertext is stored, keyed by `handle = keccak256(envelope)`. `GET /v1/vault/:handle` returns metadata and ciphertext, never plaintext, for anyone, including an administrator. No endpoint of any service can return plaintext |
| V-03 | Confidential evaluation | P0 | `POST /v1/processor/evaluate` (company API key) checks consent on chain (fail closed: `LEDGER_UNAVAILABLE`), decrypts in memory, runs deterministic loan rules and returns only `{ decision, limit, reasonCodes }`. Plaintext is discarded. Every call writes an access-log entry through the gateway log path, so it is hash-chained and anchored |
| V-04 | Erasure on withdrawal or expiry | P0 | When consent is withdrawn or expires, the stored ciphertext for that principal and purpose is erased (the next evaluate answers 451 with the right reason code and erases; the Processor also erases as soon as it sees the withdrawal). A superseded submission is erased too. Each erasure emits `vault.erased` |
| V-05 | The company never sees the data | P0 | The QuickLoan admin API and UI never return plaintext PAN or income at any point; the former credit-profile endpoint returns `{ handle, ciphertextHash, status }` only. The apply flow returns an approve or decline decision computed inside the Processor. Plaintext never appears in logs, WebSocket events, any database, error messages or stack traces |
| V-06 | Live visibility | P1 | Events `vault.encrypted`, `vault.stored`, `processor.requested`, `processor.decrypting`, `processor.decided`, `vault.erased` (`trd.md` §6.5) reach the wallet, the console and the Stage view. The wallet has a demo profile screen and a "send securely" action on the QuickLoan pass; the console shows the loan decision and what QuickLoan holds (a handle). Every screen says the Processor is a simulated enclave |

| V-07 | Data Flow Inspector | P1 | A web screen (`/stage/flow`, also a panel of `/stage`) shows four lanes, Wallet, In transit and at rest, QuickLoan staff view and Sealed Processor, driven only by real events and real responses. The staff lane can only ever show ciphertext metadata and ciphertext. The Processor lane renders only `processor.decrypting` and `processor.decided`. The line "No plaintext was visible to QuickLoan or any third party" appears only after a client-side check confirms that no event of the session carried a plaintext value. A presenter control withdraws and re-runs the apply to show the refusal and the erased ciphertext. A replay mode plays a saved event log, for the recorded fallback |
| S-04 | Stage view update | P1 | `/stage` can show the Data Flow Inspector as a panel next to the company feeds, and the presenter hint banner names the current act |

Acceptance, end to end (all of it is in `pnpm e2e`):
- Submit encrypted → evaluate returns `approved` → the admin view shows ciphertext metadata only → withdraw → evaluate returns 451 `CONSENT_WITHDRAWN` → the vault entry is erased.
- Tampering with a stored ciphertext makes decryption fail (GCM tag) and the answer is an error (`CIPHERTEXT_INVALID`), never a guessed decision.
- A search of every log line, WebSocket event, HTTP response from the company and database file produced by the run for the known plaintext (`ABCDE1234F`) finds nothing.
- Targeted request (N-01, N-02, W-14): from the console, send a request to a test handle, see it in the wallet's inbox within 2 seconds, approve it, see Granted in the console and the consent in the wallet's Consents list. An unknown handle gets exactly the same answer as a known one and nothing is pushed. `pnpm e2e` covers send, inbox, grant, and the no-signal cases.
- Customer journey (C-09, W-13), by one person on stage: tick the checkbox, scan, approve, submit the details in the wallet, Apply, see the decision, withdraw, see Apply blocked, with the page following each step live. `pnpm e2e` plays the same journey with a headless client in place of the wallet, driving the portal's own state machine with the real events.
- Data Flow Inspector (V-07, S-04): with the full flow running, all four lanes update live from events; the staff lane's two buttons return only a handle, a ciphertext hash, a status and ciphertext; the privacy line stays hidden if a plaintext value is injected into any event; replay mode reproduces a recorded run with no stack running. Checked by web tests (reducer, privacy check, staff-view filter, replay file) and by recording the replay file from a real `pnpm e2e` run.

## 7. The four differentiators (what to emphasise)
1. **Enforcement, not just a log.** Withdraw in the wallet and the company's very next request is blocked.
2. **Proof of access.** Every data access is logged and anchored on chain, so a citizen can verify what a company did and the regulator can catch edited logs.
3. **User-signed, shared truth.** The company cannot forge a "yes" or deny a "no". Neither side owns the record.
4. **Use without reading.** The company gets a decision from data it never sees. Withdraw and the data is erased, not just blocked.

## 8. Non-functional requirements

| Area | Requirement |
|---|---|
| Latency | Withdrawal in wallet to gateway blocking: under 1.5 s on the local chain |
| Privacy | No personal data on chain. Principals appear only as pseudonymous addresses. Company-side aliases stay in the company's own system |
| Reliability | Demo runs fully offline on a local chain; Amoy is proof, not a dependency |
| Security | EIP-712 domain separation, per-principal nonces, signature deadlines, replay protection |
| Accessibility | Large touch targets, readable contrast, multilingual |
| Honesty | Clearly label demo shortcuts (relayer-held company keys, simulated data, the Processor as a simulated enclave with an in-memory key) |
| Confidentiality | Sensitive customer data exists in plaintext only on the phone and in the Processor's memory for the duration of one evaluation |

## 9. Success criteria for the demo
- All P0 features working end to end on a real phone.
- At least 2 of the P1 differentiators shown live: tamper detection and cascade.
- A judge can say back, in one sentence, what we built.

## 10. Risks

| Risk | Mitigation |
|---|---|
| Dart EIP-712 signing difficulties | Spike in first 2 hours; fallback in `trd.md` §4.3 |
| Venue Wi-Fi unreliable | Local chain, LAN backend on a phone hotspot, recorded fallback video |
| "Why blockchain?" challenge | Prepared answer in `demo.md` §7 |
| Too much scope | Golden path first; cut lines in `tasks.md` |
| Legal claims overstated | Say "aligned with DPDP principles", never "certified compliant" |
| Dart and Node envelopes disagree | Shared test vectors (`shared/test-vectors/envelope.json`) run on both sides before anything else; fixed ephemeral key and nonce in the vectors |
| "Your Processor is just a server" | True in the build, and said so: simulated enclave, in-memory key; production path is a TEE with remote attestation (`architecture.md` §5.5, `demo.md` §7) |
