# DPDP mapping — Sammati (L-01, L-02)

How Sammati's features line up with the obligations in India's Digital Personal Data Protection Act, 2023 and its Rules, so that someone who works on the law can check the claims quickly.

## 0. Read this first

- **Wording.** Sammati is *aligned with the principles of* the Act. It is a hackathon prototype with made-up data. It is **not** compliant, certified, approved or registered anything, and nothing here is legal advice.
- **No citations.** This document gives no section numbers, rule numbers, dates, thresholds or timelines of the law, because none has been checked against the official text. (A "§" in this file always points at a section of Sammati's own documents, such as `docs/architecture.md` §4, never at the Act.) The obligations are described in plain words, at the level of principle. Every point where the exact legal text matters carries a **VERIFY-n** tag, and §7 lists them all for a human to check against the Act and the Rules. Until a row's VERIFY items are ticked off, treat its first two columns as "as understood by the team", not as the law.
- **Status** means what the *demo* does today:

| Status | Meaning |
|---|---|
| **Implemented** | The behaviour exists, runs in the demo, and the evidence column says how to see it. It may still depend on a demo shortcut listed in §5. |
| **Partial** | Part of the obligation is covered; the row says what is missing. |
| **Out of scope** | Not built, and not claimed. |

- **Evidence** names a screen to open, a step of `pnpm e2e` (`core/scripts/e2e.ts`) or a test. Where a row says "e2e", the step name is quoted.

Summary: 28 obligations mapped: 10 implemented, 12 partial, 6 out of scope. 15 points are left for a human to check against the official text (§7).

## 1. Who is who

The Act's terms, and who plays each part in the demo. Whether Sammati would qualify as a Consent Manager in law is exactly the kind of thing this document does not decide (VERIFY-5).

| Act's term | In Sammati |
|---|---|
| Data Principal | The citizen with the wallet (Asha). Her wallet key signs every grant and withdrawal. |
| Data Fiduciary | A company that decides why and how to use the data: any company the regulator has approved in Sammati. |
| Data Processor | A party that handles data on a fiduciary's behalf: the downstream processors on each purpose, and the Sammati Processor that opens the sealed profile. |
| Consent Manager | The role Sammati plays by design: the wallet, Core, the ledger and the gateway. **Sammati is not registered as one** and the demo says so (M-16). |
| Data Protection Board | The persona behind the Auditor screen. No claim is made about what the Board would accept as evidence (VERIFY-13). |

## 2. The mapping

Columns: the obligation in plain words | who it applies to | Sammati feature (feature ID, screen or endpoint) | evidence in the demo | status | where the exact text must be checked.

### 2.1 Notice and consent

| # | Obligation (plain words) | Applies to | Sammati feature | Evidence in the demo | Status | Check |
|---|---|---|---|---|---|---|
| M-01 | Give the person a notice at or before the moment consent is asked, saying in plain words what personal data is wanted and for what purpose, item by item. | Data Fiduciary (duty); Consent Manager (presents it) | W-02, W-03; wallet screen W3; `GET /v1/requests/:id`; purpose registry C-01 (plain description, data categories, retention, third-party flag) | Scan the QR: the notice lists each purpose separately with its description, data categories, retention and a flag when data goes to a third party, **before** any switch can be turned on. The grant carries `noticeHash`, the hash of exactly that text. e2e: "wallet fetches the notice; its hash matches the text shown". | Implemented | VERIFY-1 |
| M-02 | Make the notice available in the person's language of choice. | Data Fiduciary; Consent Manager | W-09 (English, Hindi, Kannada); `docs/copy-hi-kn.md` | Switch the wallet to Hindi or Kannada: every wallet screen changes. **Gap:** a company's purpose descriptions in Hindi and Kannada are entered by the company and unreviewed; the placeholder `[hi]` / `[kn]` tag until the native-speaker review in `docs/copy-hi-kn.md` is applied, and the wallet's own Hindi and Kannada strings are drafts awaiting the same review. | Partial | VERIFY-1 |
| M-03 | Consent must be specific, informed, unambiguous and given by a clear affirmative action. | Data Principal gives it; Data Fiduciary must obtain it that way; Consent Manager facilitates | W-03, B-02; portal checkbox C-09 | Every purpose switch starts **off**; "Give consent" stays disabled until at least one is on; a device biometric or PIN prompt; one EIP-712 message signed per purpose. The customer portal's consent checkbox starts unticked. Tests: "nothing pre-ticked". | Implemented | VERIFY-2 |
| M-04 | Consent must be free and unconditional (the service must not be made to depend on consent to more than it needs). | Data Fiduciary | W3 labels a purpose "Needed for the service"; every purpose remains a separate choice | Required purposes are labelled but still start off and can be declined. | Partial. Sammati cannot stop a company from making its service depend on consent beyond what it needs; that is the company's business decision. | VERIFY-2 |
| M-05 | Use the data only for the purpose consented to. | Data Fiduciary (duty); Consent Manager (records the purpose) | B-01 (consent per person, company and purpose), C-03 gateway `requireConsent(purpose)`, V-03 | e2e: "run a request for bureau_share, never consented to: BLOCKED"; the Processor refuses a `marketing` call made with a `credit_check` handle (`NO_CONSENT`). **Limit:** the check works for endpoints wrapped by the gateway and for the Processor. A company that skips the gateway is detected by the Auditor, not prevented (§5). | Implemented | VERIFY-2 |

### 2.2 Withdrawal

| # | Obligation (plain words) | Applies to | Sammati feature | Evidence in the demo | Status | Check |
|---|---|---|---|---|---|---|
| M-06 | Withdrawing consent must be as easy as giving it. | Data Principal's right; Consent Manager provides the means; Data Fiduciary must honour it | W-05; wallet screen W5 | Withdraw takes two taps (flip the switch, confirm in the sheet). Granting takes more: scan, switch, "Give consent", biometric. Test: "two taps withdraw". | Implemented | VERIFY-3 |
| M-07 | Tell the person what follows from withdrawing. | Data Fiduciary; Consent Manager | W5 confirmation sheet; C-09 portal | The sheet says the company "will be blocked right away"; the toast says "Withdrawn. {company} is blocked."; the portal says "Consent withdrawn. Application cannot be processed". | Partial. It states what Sammati does (use stops), not what the company's own service will do next; that wording belongs to the company. | VERIFY-3 |
| M-08 | After withdrawal the company stops using the data. | Data Fiduciary | C-03 gateway, W-05; A-01 withdrawal-to-block latency | e2e: "user withdraws marketing", then "run the same request again: BLOCKED at once" (451 `CONSENT_WITHDRAWN`). | Implemented for endpoints behind the gateway | VERIFY-3 |
| M-09 | Processors working for the company must also be made to stop. | Data Fiduciary (to cause its processors to stop) | C-06 cascade; W-08 cascade status; `acknowledgeWithdrawal` on chain | e2e: "the downstream processor is told, then acknowledges on chain" (about 2 s). The wallet's pass shows each processor and when it acknowledged. | Partial. The mechanism is real; the processors in the demo are in-process stand-ins whose keys Core holds (§5). | VERIFY-3, VERIFY-14 |

### 2.3 Erasure and retention

| # | Obligation (plain words) | Applies to | Sammati feature | Evidence in the demo | Status | Check |
|---|---|---|---|---|---|---|
| M-10 | Erase the personal data when consent is withdrawn, unless the law requires it to be kept. | Data Fiduciary and its processors | V-04 | e2e: "user withdraws credit_check; apply is refused with 451 CONSENT_WITHDRAWN", then "the vault entry is erased: metadata stays, ciphertext is gone". Applies to what the Sammati Processor holds. | Implemented for the Processor's copy. Sammati cannot reach a company's own databases. | VERIFY-4 |
| M-11 | The person may ask for erasure and should be able to follow what happened to the request. | Data Principal's right; Data Fiduciary and Consent Manager | W-10; `POST /v1/rights` (type `erasure`); wallet Rights screen; C-04 console rights inbox | File an erasure request in the wallet: it appears in the list as `ERASURE · OPEN`. The company sees it in their Rights inbox and marks it resolved. This triggers Processor erasure and consent withdrawal. | Implemented for the Processor's copy. | VERIFY-4, VERIFY-10 |
| M-12 | Do not keep data once its purpose is served or the retention period ends. | Data Fiduciary | Consent expiry (30 days, 6 months or 1 year, W-03); retention shown in the notice; V-04 (erase on expiry) | An expired consent is refused with `CONSENT_EXPIRED` and the Processor's copy is erased. The retention period is displayed to the person. | Partial. Consent expires on its own; "purpose served" is not modelled, and the retention period in the notice is not enforced against a company's own systems. | VERIFY-4 |
| M-13 | Erasure must be possible even though a ledger cannot be edited. | Data Fiduciary; Consent Manager | `docs/drd.md` §1: no personal data on chain | The chain holds pseudonymous addresses, purpose ids, hashes, status and expiry only. Personal data lives in the company's system or, for the sealed profile, as erasable ciphertext in the Processor. **Caveat:** a pseudonymous address is not anonymous. Whether it counts as personal data once someone can link it to a person is a legal question. | Implemented by design | VERIFY-4, VERIFY-15 |

### 2.4 The consent-manager role

| # | Obligation (plain words) | Applies to | Sammati feature | Evidence in the demo | Status | Check |
|---|---|---|---|---|---|---|
| M-14 | Give the person one place to give, manage, review and withdraw consent. | Consent Manager | W-04 home, W-05 withdraw, W-06 activity, W-07 proof | The home screen shows every company's pass with each purpose Active, Expired or Withdrawn, live; the activity feed shows each access ALLOWED or BLOCKED. | Implemented | VERIFY-5 |
| M-15 | Be accountable to the person, acting on her instructions. | Consent Manager | B-02 user-signed actions, B-03 relayer | A grant or withdrawal only takes effect with the person's own signature: the relayer cannot create consent (contract tests: wrong signer, replayed nonce and expired deadline all revert). | Implemented (technically). Legal accountability is a matter of registration, see M-16. | VERIFY-5 |
| M-16 | Be registered, and meet the conditions set for consent managers. | Consent Manager | — | None. Sammati is not registered and the demo does not say it is. | Out of scope | VERIFY-5 |
| M-17 | Be interoperable: work with other parties through an open interface. | Consent Manager | EIP-712 typed messages (`shared/src/eip712.ts`), the REST and WebSocket interface (`docs/trd.md` §6), the gateway SDK | Three unrelated demo companies integrate by wrapping their endpoints with the SDK. | Partial. Open, documented interfaces exist; there is no second consent manager to interoperate with. | VERIFY-5 |
| M-18 | The consent manager must not be able to read the content of the personal data it manages. | Consent Manager | V-01 to V-05; `docs/architecture.md` §4 and §5.5 | Core never receives the encrypted data and holds no key; the company gets a handle and a decision. e2e: "the PAN it submitted appears nowhere: not in any response, event, log or database file". **Limits:** Core does see consent and access metadata (pseudonymous address, purpose, decision, time). The Processor can open the data, and in this build it is a trusted component that we run, a *simulated enclave* (§5). | Partial | VERIFY-5 |

### 2.5 Security, records and breach

| # | Obligation (plain words) | Applies to | Sammati feature | Evidence in the demo | Status | Check |
|---|---|---|---|---|---|---|
| M-19 | Take reasonable security safeguards. | Data Fiduciary; processors; Consent Manager | Wallet key in secure storage behind device biometric or PIN (W-01); the customer's profile only on the phone, AES-256-GCM at rest under a key released after the device check (W-16); EIP-712 domain, per-person nonces and signature deadlines; fail-closed gateway (`LEDGER_UNAVAILABLE`); X25519 + AES-256-GCM sealed profile (V-01); hash-chained, anchored access log (B-04) | Contract tests; e2e (replay and tamper steps); the fail-closed tests. | Partial. These are design-level safeguards in a prototype: no penetration test, demo-held keys, plain HTTP on the venue network (§5). Which safeguards the Rules require, and what counts as reasonable, is not checked. | VERIFY-6 |
| M-20 | Keep a verifiable record of notice, consent and processing. | Data Fiduciary; Consent Manager | B-01, B-04, B-05, W-07, A-02, A-03 | Wallet proof screen shows the transaction and ledger head; the Auditor's ledger explorer lists consent events; e2e: `pnpm dev:tamper` edits one stored log row, then "verify again: the mismatch is pinpointed to that exact record". | Implemented | VERIFY-7, VERIFY-13 |
| M-21 | Keep such logs and records for the required minimum period. | Data Fiduciary; Consent Manager | `docs/drd.md` §6 | The chain is permanent. Core's database is test data in this build and `pnpm dev:reset` wipes it (a command-line script, not an endpoint). | Partial. No configurable retention period, and no production retention policy. | VERIFY-7 |
| M-22 | Report a personal data breach to the Board and the people affected. | Data Fiduciary | — | None. The tamper check detects an edited access log; that is an integrity check, not breach detection or notification. | Out of scope | VERIFY-8 |

### 2.6 Grievance, rights and special cases

| # | Obligation (plain words) | Applies to | Sammati feature | Evidence in the demo | Status | Check |
|---|---|---|---|---|---|---|
| M-23 | Offer a readily available way to raise a grievance and answer it. | Data Fiduciary; Consent Manager | W-10 (`POST /v1/rights`, type `grievance`); Console rights inbox; Auditor grievances | Wallet Rights, "Raise a complaint". The company console's Rights inbox shows it and allows reply. Unresolved grievances escalate to the Board (Auditor tab). | Implemented | VERIFY-9 |
| M-24 | The person may get information about the personal data processed and who it was shared with. | Data Principal's right | W-04, W-06; W-08 (data summary download); W-10 (type `access`); V-09, W-18 (the categories each Processor use read, and the decision that left it) | In the Activity detail sheet each Processor use shows the categories read, where the ciphertext sits (its hash) and the anchor proof. The wallet "See what a company holds" shows purposes, categories, handles, and hashes. The "Download my data summary" compiles this across all companies into JSON/PDF on the phone. | Implemented | VERIFY-10 |
| M-25 | The person may ask for correction of personal data. | Data Principal's right | W-17 (Me > My details; the one-tap "Update what {company} holds?"); Console rights inbox | Edit a detail that was already sent: the consent is marked "Your details changed" and one tap re-encrypts and re-submits it. A rights-request record of type `correction` is created and appears in the company's Rights inbox. | Implemented (for the Processor's copy) | VERIFY-10 |
| M-26 | The person may nominate someone to exercise rights in case of death or incapacity. | Data Principal's right | W-18 | Enter the nominee's Sammati ID in the wallet. This is stored locally and signs a prototype declaration. The UI states this is a prototype feature without legal effect. | Implemented (prototype) | VERIFY-10 |
| M-27 | Extra care for children's data (verifiable parental consent, limits on tracking and targeting). | Data Fiduciary | — | None. No age check, no parental consent. | Out of scope | VERIFY-11 |
| M-28 | Some processing does not need consent at all (other permitted grounds). | Data Fiduciary | — | Sammati handles consent-based processing only and does not model the other grounds. | Out of scope | VERIFY-12 |

## 3. How to see the evidence

1. `pnpm demo:up`, then walk `docs/demo.md` §2 (notice, consent, allowed, use without reading, withdraw, proof). Rows M-01 to M-09, M-14, M-18 and M-20 are on that path.
2. `pnpm e2e` plays the same story headlessly in under 45 s and fails by step name if any evidence above stops being true.
3. `pnpm -r test` (contracts, core, gateway, processor, web, shared) and `flutter test` in `wallet/` hold the unit-level evidence quoted in the table.

## 4. Where the claims come from

Every "Implemented" or "Partial" above points at a feature in `docs/prd.md` with its own acceptance criteria. This file does not add behaviour; it only lines the existing behaviour up against the law's obligations. Where the two disagree, `prd.md`, `trd.md` and the code win and this file is wrong.

## 5. Gaps and honest limitations

| Limitation | Why it matters for the law | Production path |
|---|---|---|
| **The Processor is a simulated enclave.** A separate service with an in-memory key. Whoever runs the machine could read its memory, and the wallet takes its public key on trust. | M-18, M-19: the strongest "cannot read the content" claim only holds with hardware protection. | Run it in a hardware enclave (for example AWS Nitro Enclaves or Intel SGX) with remote attestation, so the phone encrypts only to a key the hardware vouches for (`docs/architecture.md` §7). |
| **Demo-held keys.** Company and processor keys are generated and held by Core. | M-09, M-15, M-19: a company's actions are only attributable if the company controls its own key. | Company-held keys, or HSMs. |
| **No real identity or recovery.** The wallet is a device key behind biometric or PIN. There is no KYC or Aadhaar integration, and a lost phone is a lost wallet, a lost Sammati ID and a lost profile (W-15; stated on the wallet's About screen). A lost key also cannot withdraw consents already on chain. | M-15: accountability to a *known* principal, and exercising rights over time. | Hardware-backed keys with a recovery scheme; which identity checks the law expects is unchecked (VERIFY-5). |
| **No breach-notification flow.** | M-22. | A fiduciary-side incident workflow with the Board's format; unchecked (VERIFY-8). |
| **Local chain.** The live demo runs on a local Hardhat node; the same contracts can be deployed to a public testnet (Amoy) as proof. | M-13, M-20: a public chain's pseudonymous addresses may be personal data (VERIFY-15), and a testnet is not an operated service. | A permissioned or L2 chain run by a consortium of consent managers. |
| **Plain HTTP on the venue network** and, in the Chrome build of the wallet, a device-lock check that passes without a prompt. | M-19. | HTTPS only; device-lock check on every platform. |
| **A dishonest company can skip the gateway.** | M-05, M-08: prevention depends on the company integrating the SDK. | The Auditor detects data use missing from the anchored log, or anchored use without valid consent; stronger enforcement needs the gateway at the network edge (sidecar or API gateway). |
| **The profile is the customer's own copy.** Sammati's servers hold none of it, so "see what Sammati holds" is answered by the phone; what a company holds is its own system. Correction (W-17) reaches only the Processor's copy. |  M-24, M-25. | Company-side correction workflow with owners and deadlines (VERIFY-9, VERIFY-10). |
| **Rights requests are status records.** Except for correction re-submission and erasure triggering vault deletion, the resolution workflow depends on the company. | M-11, M-23, M-24. | A company-side workflow with owners and deadlines (VERIFY-9, VERIFY-10). |
| **Hindi and Kannada text is unreviewed**, and a company's Hindi and Kannada purpose text is whatever it typed at registration (R-01), which nobody has reviewed. | M-02. | Native-speaker review, then apply `docs/copy-hi-kn.md`. |
| **Not registered, not legally reviewed, fictional data only.** | M-16 and the whole document. | Legal review of this mapping; registration if the law requires it. |
| **A decision still reveals something** (an approved or declined, a limit, reason codes). | M-05: data minimisation, not elimination. | Keep outputs to what the company needs; review per use case. |

## 6. Claims review (L-02)

L-02 is a review of what the repository says about the law and about compliance. Findings and what was done:

| Where | What it said | Problem | Action |
|---|---|---|---|
| Auditor report (`web/src/pages/auditor/ReportModal.tsx`) | A badge "DPDP §6.3" | A section number that nobody has checked | Removed |
| Same | "Digital Personal Data Protection (DPDP) Compliance Proof" | Claims a compliance finding the tool cannot make | Now "Consent and access evidence report" |
| Same | "Cryptographic Integrity Certification" | "Certification" is a claim | Now "Log integrity check" |
| Same | "VIOLATION: Database tampering detected" | A legal-sounding conclusion from a hash mismatch | Now "MISMATCH: the stored log does not match its on-chain anchors" |
| Same | (nothing) | No statement of what the report is | Added a "Scope and limits" note with a pointer to this file |
| Company evidence pack (`EvidenceSection.tsx`) | "Compliance Evidence Pack / Report", "regulatory package" | Overstates | Now "Evidence pack / report" |
| Auditor scorecards (`ScorecardsSection.tsx`) | "Fiduciary Compliance Scorecards", "Violations: n detected" | The count is allowed access without valid consent at that time, not a legal violation | Now "Company scorecards", "Access without valid consent" |
| Company console | "DPDP compliant expiry" (purpose drawer); "standardized DPDP consent QR payload" (new request); "0 violations" (overview) | Claims | Removed or reworded |
| `docs/prd.md` §2 | What the Act requires, and "proof of compliance" | Stated as fact without a citation | Reworded with VERIFY pointers |
| `docs/prd.md` W-12, `README.md`, `docs/demo.md`, `docs/presentation.md` | "(DPDP right)", "Verify compliance", "designed around the Act's principles", "The Law Has Changed" | Overstated or uncited | Reworded to "aligned with the principles of" and pointed here |
| Wallet strings (`wallet/lib/l10n/*.arb`) | None found | — | New "How this protects you" sheet uses no legal claim beyond "aligned with the principles of" and links here |

**Wording rules from now on.** Say "aligned with the principles of the Act", "supports", "gives evidence of". Never say "compliant", "certified", "approved", "legally valid" or "meets section X". Do not print a section or rule number anywhere until it has been checked and the check is recorded in §7. `web/src/legalClaims.test.ts` fails if a known overclaim reappears in the web screens, and the wallet has a test for its own strings.

## 7. VERIFY checklist

A human should check each item against the official text of the Digital Personal Data Protection Act, 2023 and the Rules made under it, then tick it and write the source (name and number of the provision) in the last column. Do not copy a number from this repository.

| ☐ | ID | Topic to check | Rows |
|---|---|---|---|
| ☐ | VERIFY-1 | What a notice must contain, when it must be given (before or at the time consent is requested), and the language options (English and which other languages). | M-01, M-02 |
| ☐ | VERIFY-2 | The exact standard for valid consent (free, specific, informed, unconditional, unambiguous, clear affirmative action), and the limit that consent covers only the personal data necessary for the stated purpose. | M-03, M-04, M-05 |
| ☐ | VERIFY-3 | Withdrawal: the "as easy as giving" standard, who bears the consequences, the duty to stop processing and to cause processors to stop, and any prescribed time. | M-06 to M-09 |
| ☐ | VERIFY-4 | Erasure: when data must be erased (withdrawal, purpose served), the exceptions where law requires retention, the duty over processors, and any prescribed time. | M-10 to M-13 |
| ☐ | VERIFY-5 | The Consent Manager: definition, registration with the Board and its conditions, accountability to the person, interoperability, the "single point" description of its role (so the wording in `docs/prd.md` §2 and `docs/demo.md` matches the law's own), whether it must be unable to read the personal data it handles, and what record it must keep. | M-14 to M-18 |
| ☐ | VERIFY-6 | Security safeguards: the Act's standard and the minimum measures the Rules list. | M-19 |
| ☐ | VERIFY-7 | Records and logs: what must be kept, and the minimum retention period. | M-20, M-21 |
| ☐ | VERIFY-8 | Personal data breach: who must be told, what, in what form and by when. | M-22 |
| ☐ | VERIFY-9 | Grievance redressal: what a fiduciary and a consent manager must provide, and any response time. | M-23 |
| ☐ | VERIFY-10 | The rights of a Data Principal: information, correction and erasure, grievance, nomination: scope of each and any response time. | M-11, M-24, M-25, M-26 |
| ☐ | VERIFY-11 | Children: who counts as a child, verifiable parental consent, the limits on tracking and targeted advertising, and any exemptions. | M-27 |
| ☐ | VERIFY-12 | The grounds for processing that do not need consent, and their conditions. | M-28 |
| ☐ | VERIFY-13 | The Data Protection Board: its powers of inspection, and whether it can accept independently verifiable records of this kind as evidence. | M-20 and the Auditor persona |
| ☐ | VERIFY-14 | Data Processors: who is a processor, and what the fiduciary must ensure about them. | M-09 |
| ☐ | VERIFY-15 | Whether a pseudonymous wallet address on a chain, linkable to a person by a company, is personal data. | M-13 |

Reviewer: ____________  Date checked: ____________  Version of the Act and Rules checked: ____________
