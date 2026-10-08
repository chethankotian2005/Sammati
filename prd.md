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
- Handling personal data itself: Sammati stores consent metadata only.

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

## 7. The three differentiators (what to emphasise)
1. **Enforcement, not just a log.** Withdraw in the wallet and the company's very next request is blocked.
2. **Proof of access.** Every data access is logged and anchored on chain, so a citizen can verify what a company did and the regulator can catch edited logs.
3. **User-signed, shared truth.** The company cannot forge a "yes" or deny a "no". Neither side owns the record.

## 8. Non-functional requirements

| Area | Requirement |
|---|---|
| Latency | Withdrawal in wallet to gateway blocking: under 1.5 s on the local chain |
| Privacy | No personal data on chain. Principals appear only as pseudonymous addresses. Company-side aliases stay in the company's own system |
| Reliability | Demo runs fully offline on a local chain; Amoy is proof, not a dependency |
| Security | EIP-712 domain separation, per-principal nonces, signature deadlines, replay protection |
| Accessibility | Large touch targets, readable contrast, multilingual |
| Honesty | Clearly label demo shortcuts (relayer-held company keys, simulated data) |

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
