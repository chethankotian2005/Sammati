# PRD — Sammati

## 1. Vision
Make consent behave like payments in India: one wallet, instant, revocable, verifiable. Just as UPI made it trivial to pay any merchant, Sammati makes it trivial to control who may use your data, and makes "withdraw" actually stop the data flow.

## 2. Problem
- India's DPDP Act, 2023 asks (as the team understands it, not yet checked against the official text: `dpdp-mapping.md` VERIFY-1 to VERIFY-3) for clear, purpose-specific consent, withdrawal as easy as giving it, and a way for a company to show that it gave notice and obtained consent.
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
- Production-grade key recovery, mainnet deployment, legal certification. **Account recovery is out of scope in this build** (W-15): a customer who loses the phone, or clears the app's data, loses the wallet key, control of the Sammati ID and the stored profile, and starts again. The production path (encrypted backup, recovery) is in `architecture.md` §5.9.
- Handling personal data itself: Sammati's servers store consent metadata only. A customer's profile (W-15 to W-17) lives only on their phone, encrypted at rest; the only other place it can go is a per-purpose ciphertext envelope addressed to the Processor (§6.5), which decrypts it in memory (use made-up data in this build).
- A real trusted execution environment. The Processor is a simulated enclave (`architecture.md` §5.5).
- Verifying a company. The regulator's approval of a registration (R-02) is a human decision in the demo; Sammati checks no licence, no incorporation record and no email address.

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
| W-11 | Expiry reminders | P0 | The wallet reminds the customer before a consent expires (3 days and 1 day by default) and when it has expired, as a notification on the phone and an item in the Alerts tab. Local scheduled notifications work with the app closed; the rest is delivered live while the app runs (see N-05 and `demo.md` for what is and is not background push) |
| W-12 | Nominee | P2 | Nominate a trusted person (a right of the Data Principal under the Act; scope unchecked, `dpdp-mapping.md` VERIFY-10) |
| W-13 | Share your details securely | P1 | After consenting to a data-using purpose, the wallet offers a screen (W10) that shows exactly the profile fields that purpose's data categories need (§6.1a): the ones already in the profile are filled in, the missing ones are asked for there and nowhere else (and saved to the profile, so they are asked once). It validates them on the device, encrypts only those fields for the Processor (V-01), bound to that company and purpose, and uploads only the ciphertext. Plaintext is never sent in plain form; the screen's copy of the values is cleared once sent. The wallet ships no sample profile. Available in English, Hindi and Kannada |
| W-15 | Create account with profile | P0 | After the language picker, onboarding creates an account in three steps: (1) choose a Sammati ID such as `asha@sammati`, checked for availability through Core (Core stores only handle to principal); (2) set the device lock (biometric or PIN), which creates the wallet key and registers the ID; (3) fill in the profile. Every profile field is optional and the profile step can be skipped. The wallet asks for a missing field only when a consent needs it (W-13). No account recovery in this build, and the wallet says so (W9 About) |
| W-16 | Profile vault | P0 | The profile (§6.1a: identity, contact, financial, health and preferences fields, with plain-language labels in English, Hindi and Kannada) is stored only on the phone, in `flutter_secure_storage`, as AES-256-GCM ciphertext under a random profile key that is released only after a successful `local_auth` check. Core, the chain and every other server never receive the profile, except as per-purpose ciphertext envelopes addressed to the Processor. After killing the app and reopening it, the biometric or PIN prompt opens the profile again. An automated test searches Core's database, logs and WebSocket events for known profile values after a full flow and finds none |
| W-17 | Edit profile | P1 | **Me > My details** shows the profile by category and edits any field. Editing a value that was already sent to a company marks each affected active consent with "Your details changed. Update what {company} holds?" and a one-tap action that re-encrypts and re-submits the new values (the Processor replaces the old copy). This is the Data Principal's right to correction in practice; the rights-request record for it is a later task (R6) |
| W-18 | Activity shows data use | P0 | Each Activity row for a Processor use reads in the customer's language like "QuickLoan used your PAN and yearly income for the credit check. Decision shared: approved.", with the company dot, purpose, time and the ALLOWED or BLOCKED chip, and appears within 2 seconds of the evaluation. Tapping it opens one detail sheet, built from the real access-log entry and real hashes: where the data was stored (encrypted at rest, the ciphertext hash), which categories were used, where it was processed (Sammati Processor, simulated), what left the Processor (the decision only), and the ledger and anchor proof with the Merkle check. After a withdrawal or expiry the company's pass says "{company} no longer holds your {data}". There is no separate inspector page |

### 6.1b Principal Rights (D-01 to D-07)

| ID | Feature | Pri | Acceptance criteria |
|---|---|---|---|
| D-01 | Withdraw | P0 | Two-tap flow in the user's language, explains consequences ("Company will no longer be able to process..."). Blocks instantly, erases vault data, cascades to processors with acknowledgements. |
| D-02 | Access | P1 | Wallet "See what a company holds" returns real data: per company, purposes, consent status, categories held (ids and labels), handles, ciphertext hashes. "Download my data summary" compiles this across all companies into JSON/PDF on the phone (built from local profile and Core metadata, Core never gets the profile). |
| D-03 | Correction | P1 | Edit profile fields (W-17); re-encrypt and submit new vault version (`superseded`). Records a correction event (`rights_request` of type `correction`). |
| D-04 | Erasure | P1 | Create rights request (type `erasure`), appears in company console inbox. Company resolution triggers Processor erasure + consent withdrawal + confirmation. |
| D-05 | Grievance | P1 | Filing (type `grievance`) with note. Console display, in-app reply. Escalation to Board (Auditor tab) if unresolved or manually escalated. |
| D-06 | Nominee | P2 | UI storage of nominee's Sammati ID on device, signed to ledger/Core. Explanatory copy that it's a prototype without legal effect. |
| D-07 | Notice & Language | P0 | Notices are itemized per-purpose, plain language (en/hi/kn), no pre-ticks, mandatory labels, retention/sharing info, and link to "How this protects you" (citing `dpdp-mapping.md`). |

### 6.1a Data categories and the profile (W-13, W-15 to W-17)

Companies and the wallet speak one vocabulary. `shared/src/categories.ts` holds a **fixed registry of data category ids**, each with a label in English, Hindi and Kannada, a group, and the wallet profile field it corresponds to. A purpose's `data_categories` use only these ids; the wallet maps each id to a profile field, so it can tell what a consent needs. The full table is `trd.md` §4.6.

| Group (profile heading) | Category ids |
|---|---|
| Identity | `identity.name`, `identity.dob`, `identity.gender` (gender is optional even inside the profile) |
| Contact | `contact.mobile`, `contact.email`, `contact.address` |
| Financial | `financial.pan`, `financial.income_band`, `financial.employment` (employment type), `financial.employer` |
| Health | `health.blood_group`, `health.allergies`, `health.insurance_policy` |
| Preferences | `prefs.food`, `prefs.delivery_address` |

Adding a category is a spec change first (this table, `trd.md` §4.6, `drd.md` §4.2), then the registry, the Dart copy and the vectors, because the list is part of the notice hash input.

### 6.2 Gateway + Company Console

| ID | Feature | Pri | Acceptance criteria |
|---|---|---|---|
| C-01 | Purpose registry | P0 | Company defines purposes (code, plain description, data categories, retention, third-party sharing flag); registered on chain. A purpose's data categories are ids from the fixed registry of §6.1a and nothing else: a free-text category is refused |
| C-02 | Consent request QR | P0 | Console generates a QR for a customer + chosen purposes |
| C-03 | Gateway SDK | P0 | `requireConsent(purpose)` middleware wraps any endpoint. No valid consent returns HTTP 451 with a reason code. Valid consent passes through |
| C-04 | Live request feed | P0 | Console shows each request as ALLOWED or BLOCKED with purpose, principal alias, latency |
| C-05 | (withdrawn, X-01) | - | Withdrawn: nothing in the console fires requests. A company's own server makes them through the gateway SDK, and the console shows them in the Live feed as they happen |
| C-06 | Downstream processors | P1 | Company lists processors per purpose; on withdrawal each receives a notification and returns a signed acknowledgement |
| C-07 | Consent table | P1 | Live table of customers and per-purpose status |
| C-08 | Compliance export | P1 | One-click evidence pack for the regulator |
| C-09 | Company customer portal | P1 | A customer page for a company that uses the Processor (`/portal/:slug`, the sample lender of `examples/lender`): sign-in with a company-side customer id, a loan application form with one unticked consent checkbox and the purposes listed beneath it in plain language; ticking it creates the consent request and shows the QR inline with a live status; the page follows the customer through consent received, data submitted securely, decided and withdrawn from real events. It never asks for, receives, shows or logs a PAN or an income, and no text input of the sign-in or the form takes one. Apply calls the company backend, which calls the Processor with the handle only; the decision card shows approved or declined, the limit and the reasons, never the data |
| C-10 | Console operator login | P1 | A real console login for the company operator (email + password, hashed in Core). The company switcher lists only the companies the signed-in operator owns. All console and gateway endpoints enforce the caller's fiduciary id so no company sees another's data. |

### 6.2b Reaching a customer without a QR

A company can ask a specific customer for consent, and the customer is told in the wallet at once. Design in `trd.md` §4.5 and §6.11, `architecture.md` §5.6.

| ID | Feature | Pri | Acceptance criteria |
|---|---|---|---|
| N-01 | Sammati ID | P1 | The wallet registers a handle like `asha@sammati` by signing a short plain message (no new EIP-712 type); Core stores handle to principal in `identities`. The handle is chosen at account creation (W-15), where the wallet first checks availability (`GET /v1/identities/availability`, rate limited). One handle per wallet, each handle unique. No phone number or email is stored or asked for. A company can address a handle only to send a request: no API returns a principal address to a company before that customer has granted consent |
| N-02 | Targeted consent request | P1 | A company posts a request to a handle with purposes, an optional message and an expiry. The customer's wallet receives `consent.requested` over the WebSocket. The company sees only an opaque request id and a status (Sent, Seen, Granted, Declined, Expired). The answer to the company is **identical** for a known handle, an unknown handle, a blocked company and a customer at the open-request limit, so a company cannot learn who is registered. Abuse controls: a per-company rate limit, a cap on open requests per customer per company, requests that expire, Decline, and Block this company (stored in Core and respected) |
| W-14 | Requests inbox | P1 | A badge on the wallet's Home opens a list of open requests. Each is a card (company, purposes, message, expiry) with Review (the existing consent notice W3), Decline and Block this company. A new request arrives with a brief colour wash within 2 seconds of being sent. Offline, the last known list is shown. English, Hindi and Kannada. Blocked companies can be listed and unblocked |
| N-03 | Expiry scheduler | P0 | Core checks every consent on a timer (30 s by default) and emits `consent.expiring` once at each threshold before expiry (3 days and 1 day by default, configurable) and `consent.expired` once when expiry passes, each at most once per consent and threshold, kept in a `notifications` table. The thresholds are configurable (`EXPIRY_THRESHOLDS_SECONDS`, `EXPIRY_TICK_MS`). Core has no short-expiry mode: a tester signs a short `expiresAt` from the wallet's Developer settings (X-01) On expiry the gateway already answers 451 `CONSENT_EXPIRED` and the Processor refuses; it erases the vault entry after the grace period (V-04) |
| N-04 | Renewal and revoke requests | P0 | A company can ask a customer to renew an expiring or expired purpose (`consent.renewal_requested`); the customer can **Renew** (the ordinary consent notice with the expiry choices), **Let expire** (the answer to a renewal or expiry reminder: nothing is granted and nothing is withdrawn), or withdraw as always (the existing Withdraw, which is the revoke). The company sees the renewal's status (Sent, Seen, Granted, Declined, Expired) by request id, never more than it already knows. Respecting "Block this company" and the per-company limits of N-02 |
| N-05 | Notification centre | P0 | An Alerts tab in the wallet lists, newest first and grouped Today and Earlier, with an unread dot: expiring and expired consents, renewal requests, **data erased** (the Processor confirmed erasure after a withdrawal or expiry) and cascade acknowledgements. Each item has tappable actions (Renew, Let expire, View proof). Delivered over the WebSocket while the app runs, and also raised as a phone notification. Not built, and said so: Firebase push for a closed app (it needs a Firebase project and a real phone to test) |

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
| V-01 | Envelope encryption in the wallet | P0 | The wallet encrypts the customer's details (PAN, income band, employment; a credit score only if the user's own bureau data supplies one) typed in the wallet on the device for the Processor's public key (X25519 + HKDF-SHA256 + AES-256-GCM), bound to one company and one purpose. The plaintext never leaves the phone. The TypeScript (`shared/src/envelope.ts`) and Dart (`wallet/lib/core/envelope.dart`) implementations pass the same test vectors in `shared/test-vectors/envelope.json` |
| V-02 | Vault: ciphertext only | P0 | `POST /v1/vault/submit` stores an envelope only after the principal's signature and an Active consent for that purpose are verified on chain. Only ciphertext is stored, keyed by `handle = keccak256(envelope)`. `GET /v1/vault/:handle` returns metadata and ciphertext, never plaintext, for anyone, including an administrator. No endpoint of any service can return plaintext |
| V-03 | Confidential evaluation | P0 | `POST /v1/processor/evaluate` (company API key) checks consent on chain (fail closed: `LEDGER_UNAVAILABLE`), decrypts in memory, runs deterministic loan rules and returns only `{ decision, limit, reasonCodes }`. Plaintext is discarded. Every call writes an access-log entry through the gateway log path, so it is hash-chained and anchored |
| V-04 | Erasure on withdrawal or expiry | P0 | When consent is withdrawn, the stored ciphertext for that principal and purpose is erased at once (the next evaluate answers 451 and erases; the Processor also erases as soon as it sees the withdrawal). When consent **expires**, every evaluate is refused at once with 451 `CONSENT_EXPIRED` and nothing is decrypted, but the ciphertext is kept for a short **grace period** (default 7 days, `EXPIRY_ERASURE_GRACE_SECONDS`) so a renewal does not make the customer send it again, then erased (N-03). A superseded submission is erased too. Each erasure emits `vault.erased` |
| V-05 | The company never sees the data | P0 | The QuickLoan admin API and UI never return plaintext PAN or income at any point; the former credit-profile endpoint returns `{ handle, ciphertextHash, status }` only. The apply flow returns an approve or decline decision computed inside the Processor. Plaintext never appears in logs, WebSocket events, any database, error messages or stack traces |
| V-06 | Live visibility | P1 | Events `vault.encrypted`, `vault.stored`, `processor.requested`, `processor.decrypting`, `processor.decided`, `vault.erased` (`trd.md` §6.5) reach the wallet and the console. The wallet has a "send securely" action on a pass whose purpose uses the Processor; the console shows the loan decision and what the company holds (a handle). Every screen says the Processor is a simulated enclave |

| V-07 | (withdrawn, X-01) | - | Withdrawn: the claim that no plaintext reaches a company or a server is checked by `pnpm e2e`, which searches every log line, event, response and database for the profile values. See `cleanup-audit.md` |
| S-04 | (withdrawn, X-01) | - | Withdrawn with the presenter screens. See `cleanup-audit.md` |

| V-08 | Per-purpose encrypted submission | P0 | For each purpose the customer shares, the wallet builds a payload of **only** the profile fields mapped from that purpose's `data_categories` (§6.1a), seals it for the Processor (X25519 + HKDF-SHA256 + AES-256-GCM, `shared/src/envelope.ts` and the Dart copy, same vectors) and posts `/v1/vault/submit` with a `requestId`, a monotonic `version` and the consent reference (the notice hash the customer signed). The Processor verifies consent on chain, and the notice hash if given, before it accepts; it stores ciphertext only and returns the handle and ciphertext hash. A correction (W-17) is a new version that supersedes the old one; a stale version is refused |
| V-09 | Usage records | P0 | `POST /v1/processor/evaluate` takes the handle(s), the company, the purpose and the application (amount, tenure), re-checks consent on chain (fail closed), decrypts in memory, runs the documented scoring rules (`drd.md` §4.5) and returns only `{ decision, limit, rateBps, reasonCodes }`. Every evaluation is an access-log entry on the company's hash-chained, anchored log, extended with `dataCategories` (the category ids the rules actually read) and `outcome` (the decision label only). Old and new entry formats are never mixed in one chain: the new format starts a new epoch (`drd.md` §4.1). No endpoint of any service returns plaintext |

Acceptance, end to end (all of it is in `pnpm e2e`):
- Apply, withdraw, apply (V-08, V-09, W-18): sealed per-purpose submit, evaluate returns a decision and a rate, the wallet's Activity gets the usage row with the categories within 2 seconds, QuickLoan's database, Core and the chain hold no plaintext, withdraw then apply is 451 `CONSENT_WITHDRAWN`, the ciphertext is erased and the wallet says so. A leak test generates a random profile on every run and searches every log, event, database and response for it.
- Submit encrypted → evaluate returns `approved` → the admin view shows ciphertext metadata only → withdraw → evaluate returns 451 `CONSENT_WITHDRAWN` → the vault entry is erased.
- Tampering with a stored ciphertext makes decryption fail (GCM tag) and the answer is an error (`CIPHERTEXT_INVALID`), never a guessed decision.
- A search of every log line, WebSocket event, HTTP response from the company and database file produced by the run for the known plaintext (`ABCDE1234F`) finds nothing.
- Targeted request (N-01, N-02, W-14): from the console, send a request to a test handle, see it in the wallet's inbox within 2 seconds, approve it, see Granted in the console and the consent in the wallet's Consents list. An unknown handle gets exactly the same answer as a known one and nothing is pushed. `pnpm e2e` covers send, inbox, grant, and the no-signal cases.
- Expiry, renewal and alerts (N-03, N-04, N-05, W-11): turn on **Short expiry for testing** in the wallet's Developer settings and grant a consent with the 2-minute expiry (the consent shows a "Developer option" label); the wallet's Alerts tab shows "expires in …" twice, then "expired"; the gateway answers 451 `CONSENT_EXPIRED`; the console's Expiring consents table offers **Request renewal**, the wallet shows the request, **Renew** gives a fresh consent and the same call is ALLOWED again; after the grace period the Processor erases the vault entry and the wallet gets **data erased**. `pnpm e2e` runs the same story with a few seconds of expiry.
- Customer journey (C-09, W-13), by one person: tick the checkbox, scan, approve, submit the details in the wallet, Apply, see the decision, withdraw, see Apply blocked, with the page following each step live. `pnpm e2e` plays the same journey with a headless client in place of the wallet, driving the portal's own state machine with the real events.
- Account and profile (W-15 to W-17): a new user creates an account (ID, device lock, some fields), kills the app, reopens it, passes the device lock and still sees the profile. A consent that needs a field the profile lacks asks for that field and only that one; a consent whose fields are all present asks for nothing. Editing a field already sent marks the consent, and one tap re-sends. A search of Core's database, logs, WebSocket events and responses, and of the Processor's database and logs, after a full flow with a distinctive profile, finds no profile value (`pnpm e2e`; and a wallet test that the profile never reaches a request body).
- No plaintext (V-02, V-05): `pnpm e2e` submits a profile with a known PAN and income and searches every log line, WebSocket event, company-facing response, error message and database file of the run for them; it finds nothing. Checked again in the Processor and Core unit tests.

### 6.6 Legal alignment

A mapping from the obligations in the Digital Personal Data Protection Act, 2023 to what Sammati does, written so that someone who works on the law can check it fast (`dpdp-mapping.md`). Accuracy over breadth: it cites no section, rule, date, threshold or timeline, because none has been checked against the official text; every such point is a numbered VERIFY item with a checklist at the end. Wording is always "aligned with the principles of", never "compliant", "certified" or "approved".

| ID | Feature | Pri | Acceptance criteria |
|---|---|---|---|
| L-01 | DPDP mapping document | P1 | `docs/dpdp-mapping.md` has a table of obligation (plain words), who it applies to (Data Principal, Data Fiduciary, Consent Manager), the Sammati feature (ID and screen or endpoint), the evidence in the demo, and a status (implemented, partial, out of scope). It covers: notice with itemised plain-language purposes and language choice; specific, informed, unconditional, unambiguous, affirmative consent with nothing pre-ticked; purpose limitation; withdrawal as easy as giving, and its consequences; erasure on withdrawal or when the purpose is served, including processors; the consent-manager role (accountable, interoperable, not reading content); security safeguards; retention of logs and records; breach handling; grievance; the rights to information, correction and erasure, grievance and nomination; children's data. It has a "Gaps and honest limitations" section with the production path, and a VERIFY checklist listing every uncertain point. It contains no section number, rule number, date, threshold or timeline |
| L-02 | Compliance claims review | P1 | Every legal or compliance claim in the docs and screens was reviewed (findings and actions in `dpdp-mapping.md` §6). No screen or document says "compliant", "certified" or "approved", or prints a section number that is not recorded as checked. The wallet's consent notice offers "How this protects you" (plain, implemented protections, in English, Hindi and Kannada, and a pointer to the mapping), and the Auditor report states its scope and limits. A web test fails if a known overclaim reappears; a wallet test fails if a banned word enters the wallet's strings |

### 6.7 Joining Sammati: self-registration, regulator approval, sandbox (R)

Companies used to come from a seed script. A real consent layer lets any company join, and lets the regulator decide who may ask people for consent. Design in `trd.md` §6.12, `architecture.md` §5.7, integration guide in `integration.md`.

| ID | Feature | Pri | Acceptance criteria |
|---|---|---|---|
| R-01 | Company self-registration | P1 | A public page `/join` collects company name, sector, a contact email (demo: kept only in the application row and erased when the regulator decides), the purposes the company intends to request (code, title and plain description in English, Hindi and Kannada, data categories picked from the registry of §6.1a, retention, sharing flag, required-for-service flag) and its downstream processors. Submitting creates a `fiduciary_applications` row with status `pending` and shows a status page that follows the application. Input is validated on the client and again in Core; abuse is limited (per-address rate limit, a cap on pending applications). Nothing on chain and no fiduciary exists until the regulator approves. Real mode only (the stub answers 501) |
| R-02 | Regulator approval | P1 | The Auditor gains a **Registrations** tab, behind the regulator access code (`REGULATOR_KEY`). It lists applications, shows each one's details, and offers **Approve** and **Reject** with a note. Approve: Core generates the company's key (demo shortcut, disclosed), funds it, calls `registerFiduciary`, `registerPurpose` and `registerProcessor` on chain (the admin key stays in Core), creates an API key for the gateway (hashed at rest) and adds the company to the directory. All of it appears in the ledger explorer as ordinary ledger events. Reject: status `rejected` with the note; the company never gets an id or a key and cannot create requests. The API key is shown once, to the applicant, never to the regulator |
| R-03 | Sandbox and SDK quickstart | P1 | A new company starts in **sandbox**: it can address and receive consent only from regulator-designated test customers, and the console shows a **SANDBOX** badge. The regulator can promote it (and demote it again) from the Registrations tab. The onboarding result page shows the fiduciary address, the API key once, and a copy-paste "integrate in 5 lines" quickstart with `@sammati/gateway` `requireConsent`, plus how to call the Processor and how to send a targeted request. The same guide is `integration.md`. Gateway endpoints require the company's API key: a key belongs to one company and is refused for any other id; keys are hashed at rest; each company has a rate limit; a call with an unknown or unapproved key fails closed with a clear error |
| R-04 | No hard-coded companies | P1 | The console's company switcher, the Auditor's scorecards and ledger filters, and the wallet's Home work for any number of approved companies, read from Core's directory (`GET /v1/fiduciaries`). No company, purpose, processor or customer is built in: a fresh deployment holds the contracts, the regulator account and the relayer, and nothing else (X-01) |

Acceptance, end to end (all of it is in `pnpm e2e`): register a fourth company, a throwaway company created by the script, through the API behind `/join`; a registration with a bad body is refused; the regulator rejects a second application and that company cannot create a request; the regulator approves that company, which appears in the directory as sandbox with its purposes on chain and in the ledger explorer; run the quickstart snippet in a tiny sample app with the key; send a targeted request to a test customer; the customer's wallet (played by the script) sees it, approves it, the sample app's guarded endpoint answers ALLOWED; the customer withdraws, the next call is BLOCKED (`CONSENT_WITHDRAWN`); an untested customer cannot be targeted or grant while that company is in sandbox; a key used for another company's id is refused; a call with no valid key fails closed.

### 6.8 Remove demo scaffolding (X-01)

Everything that existed only to stage a demo is gone; the product works through its real screens and APIs. The inventory and each decision are in `cleanup-audit.md`. Design in `trd.md` §6.4 and §10, `architecture.md` §5.8, `ui.md` §2 (W9b), §3.1 and §5.

| ID | Feature | Pri | Acceptance criteria |
|---|---|---|---|
| X-01 | Remove demo scaffolding | P0 | (1) No console button that fires requests, presenter screen, flow visualiser, replay mode, component gallery, prefilled example application or sample profile exists in the web app or the wallet. (2) A fresh deployment holds the contracts, the regulator/admin account and the relayer, and nothing else: no company, purpose, processor, customer or request. Companies arrive through R-01 to R-03. (3) Core has one mode, backed by the chain and SQLite: no fixtures and no in-memory store exist. (4) No HTTP endpoint of Core or the Processor can reset state, edit a log, sign for a customer or fabricate an access decision: `/v1/demo/*` does not exist. (5) The old demo-mode switch is replaced by `DEV_TOOLS=true`, which enables only two command-line scripts: `pnpm dev:reset` (wipes Core's database and the Processor's vault and redeploys the contracts) and `pnpm dev:tamper -- <fiduciary> <seq>` (edits one stored access-log row directly in SQLite, to play a malicious insider). Neither is reachable over HTTP or from a UI. Core and the Processor refuse to start with `DEV_TOOLS=true` and `NODE_ENV=production`. (6) The old fast-expiry switch is replaced by the wallet's **Me > Developer settings > Short expiry for testing** (2 min, 10 min), off by default; a consent made with it shows a "Developer option" label. Core and the contracts have no special mode: the customer signs a short `expiresAt`. (7) After `pnpm dev:tamper`, the Auditor's real **Verify** shows the exact batch and record that no longer match the on-chain anchor. (8) `pnpm e2e` creates its own throwaway companies and a headless wallet client through the public APIs; fixtures live under `test/` and never ship. (9) "Demo shortcuts" (`demo.md`) means only: Core holds company and processor keys, and the Processor is a simulated sealed service |

Not in scope: removing the two shortcuts themselves (company-held keys, a real TEE); `cleanup-audit.md` lists them as the honest limits.

### 6.9 QuickLoan: a loan product that uses Sammati (Q)

`companies/quickloan` is a separate lender app (own brand, own database, port 4101) that integrates Sammati only through the public SDK and APIs: a company API key, the consent request API, the WebSocket and the Processor's decision API. It is configured by `FIDUCIARY` and `SAMMATI_API_KEY` from its registration (R-01 to R-03); it has no access to Core internals. Its identity colour is `#2F5BEA`; only the QR and "Sammati" labels borrow Sammati's look. Design in `trd.md` §6.14.

| ID | Feature | Pri | Acceptance criteria |
|---|---|---|---|
| Q-01 | Sign up with Sammati | P0 | Landing page (product copy, EMI calculator, FAQ, footer with grievance officer, responsive) leads to Sign up. The form asks for a username and an optional password and **nothing else**: no name, PAN, income, phone or email. Under it, an unticked checkbox "Use my Sammati details for loan processing"; ticking it creates a consent request through the real API and shows the QR on the same page with "Waiting for you in the Sammati app" and live status over the WebSocket. The registered purposes are listed in plain language, required ones marked |
| Q-02 | Consent-gated login | P0 | When the required purposes are granted, QuickLoan creates the account as `username` bound to the pseudonymous principal and logs the user in. The dashboard greets by username, never a real name, and shows live consent status per purpose. Returning users log in with username and password. A "Confirm in Sammati" sign-in challenge is specified (`trd.md` §6.14) and **not built** |
| Q-03 | Loan application | P0 | Amount, tenure and purpose of loan (application parameters, not protected data). Submitting calls the Processor with the handle only. The decision card shows approved or declined, limit, rate and reasons; no personal data is rendered. Withdrawal or expiry disables Apply within 2 seconds with "Consent withdrawn. We can no longer process your application"; stored decisions remain; the held data is erased (V-04) |
| Q-04 | Back-office | P0 | Separate route `/staff`, staff login. Applications list (username, amount, tenure, decision, status, time); customer detail shows "Personal details: protected by Sammati" with ciphertext hash, handle and per-purpose consent status. No control reveals or exports plaintext. A rights inbox lists erasure acknowledgements; it stays empty until Core exposes company rights requests (R6) and says so |

Acceptance: a new person can sign up, scan, consent, be logged in and apply with only the on-screen text; QuickLoan's database, API responses and back-office never contain name, PAN, income, mobile or email (automated test with known values); withdrawing in the wallet disables Apply within 2 s. The wallet side (per-purpose choice, required purposes, sending only the ticked purposes' fields, prompting for missing ones) is W-03, W-13, W-15 to W-17.

## 7. The four differentiators (what to emphasise)
1. **Enforcement, not just a log.** Withdraw in the wallet and the company's very next request is blocked.
2. **Proof of access.** Every data access is logged and anchored on chain, so a citizen can verify what a company did and the regulator can catch edited logs.
3. **User-signed, shared truth.** The company cannot forge a "yes" or deny a "no". Neither side owns the record.
4. **Use without reading.** The company gets a decision from data it never sees. Withdraw and the data is erased, not just blocked.

## 8. Non-functional requirements

| Area | Requirement |
|---|---|
| Latency | Withdrawal in wallet to gateway blocking: under 1.5 s on the local chain |
| Privacy | No personal data on chain. Principals appear only as pseudonymous addresses. Company-side aliases stay in the company's own system. The customer's profile never reaches Core, the chain or any server except as per-purpose ciphertext for the Processor (`drd.md` §1) |
| Reliability | Runs fully offline on a local chain; Amoy is proof, not a dependency |
| Security | EIP-712 domain separation, per-principal nonces, signature deadlines, replay protection |
| Accessibility | Large touch targets, readable contrast, multilingual |
| Honesty | Clearly label the two demo shortcuts: Core holds company and processor keys, and the Processor is a simulated sealed service (in-memory key) until it runs in a TEE. Nothing else in the product is staged |
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
| Legal claims overstated | Say "aligned with the principles of the DPDP Act", never "compliant", "certified" or "approved". No section or rule numbers until checked (`dpdp-mapping.md` §7). A web test and a wallet test guard the screen wording (L-02) |
| Dart and Node envelopes disagree | Shared test vectors (`shared/test-vectors/envelope.json`) run on both sides before anything else; fixed ephemeral key and nonce in the vectors |
| "Your Processor is just a server" | True in the build, and said so: simulated enclave, in-memory key; production path is a TEE with remote attestation (`architecture.md` §5.5, `demo.md` §7) |
