# Tasks — 3 people, 24 hours

## 1. Roles

| Person | Owns | Primary deliverables |
|---|---|---|
| **A: Chain and Core** | `contracts/`, `core/`, `gateway/`, `shared/`, `processor/` | ConsentRegistry, AccessAnchor, relayer, indexer, cache, anchoring, cascade, audit APIs, SDK, e2e script. Confidential processing: `processor/`, `shared/src/envelope.ts` and its vectors, the Core event intake, the SDK's `logAccess` (V-01 to V-04) |
| **B: Wallet** | `wallet/` | Flutter app: W-01 to W-10, signing, live feed, proofs, i18n, APK. Confidential processing: `envelope.dart` against the shared vectors, "Send securely" on a pass whose purpose uses the Processor (V-01, V-06). Developer settings with the short-expiry option (X-01) |
| **C: Web and Story** | `web/`, `examples/`, deck, demo | Company console, Auditor, customer portal, `/join`, the sample lender, deck, rehearsals. Confidential processing: a company without plaintext (handle store, apply endpoint), "What {company} holds" card and timeline, Act 4 (V-05, V-06) |

Account and profile (W-15 to W-17): B owns the wallet side, A the registry in `shared/`, the availability route and the privacy search, C the category picker in `/join` and the console.

Whoever finishes first helps whoever is behind, in this order: B (wallet is the hero), then A, then C polish.

## 2. The golden path (build this first, nothing else matters until it works)

`Console QR → wallet scan → consent notice → signed grant → on-chain → gateway ALLOWED → wallet withdraw → gateway BLOCKED`

Everything below P0 waits until this path runs end to end on the real phone.

## 3. Timeline

### H0–H2: Setup and spikes (all three, parallel)
- **A:** monorepo scaffold, Hardhat project, `shared/` EIP-712 types, first failing contract test for grant. Start `pnpm demo:up` skeleton.
- **B:** Flutter project, packages installed, **EIP-712 signing spike** producing a signature that the Hardhat test recovers (decide fallback in `trd.md` §4.3 by H2).
- **C:** Vite app, routes, Tailwind tokens from `ui.md`, a sample company Express app with a guarded endpoint, repo conventions.
- **Gate H2:** signing approach decided, contract skeleton compiles, all three can run their app locally.

### H2–H8: Golden path
- **A:** ConsentRegistry grant/withdraw/expiry + tests (§3.3 of TRD), deploy script, Core: `/requests`, `/consents/grant`, `/consents/withdraw`, relayer, indexer, consent cache, WebSocket. Gateway SDK `requireConsent` with 451 responses.
- **B:** onboarding and wallet creation, scan screen, consent notice (W3), sign and submit, consent home (W4/W5) reading Core, withdraw flow.
- **C:** Console: purposes view, new request QR, live requests feed, wiring the sample company app to the SDK.
- **Gate H8 (hard):** golden path works on the real phone with real chain. If not, everyone stops new work and fixes this.

### H8–H14: Differentiators
- **A:** access-log hashing, Merkle anchoring, AccessAnchor, cascade engine and in-process processor acknowledgers, audit verify API.
- **B:** live activity feed (W6), proof sheet (W7), cascade section, language switching (W9 with real strings).
- **C:** Auditor (scorecard, ledger explorer, Verify with mismatch view), consent table, processors view.
- **Gate H14:** tamper detection works (`pnpm dev:tamper` then the Auditor's Verify); cascade fills in on the phone.

### H14–H18: Polish and depth
- **A:** Amoy deployment and explorer links, reconcile job, `pnpm e2e`, fail-closed behaviour, README run instructions.
- **B:** animations (pass-cut), rights screens (W8), error/offline states, app icon, release APK.
- **C:** evidence/report export, deck (7 slides, one of them the legal-alignment slide), copy pass with native-speaker check on Hindi and Kannada. Legal alignment (L-01, L-02): `dpdp-mapping.md` and its claims review; hand the VERIFY checklist (§7 there) to someone who can check it against the official Act and Rules text.
- **Gate H18:** feature freeze. Only fixes after this.

### Confidential processing (V-01 to V-06): after the hero moments
Built once the golden path, tamper detection and cascade work (it is a differentiator, not the golden path). Order: (1) spec commit; (2) `shared/src/envelope.ts` + vectors, Dart `envelope.dart` passing the same vectors (hour 1, blocking: if the Dart side cannot match, V-01 stops there); (3) `processor/` with submit, evaluate, erasure; (4) QuickLoan and Core intake; (5) wallet and console screens; (6) extend `pnpm e2e`. Gate: the extended `pnpm e2e` passes, including the plaintext search. Cut it before cutting any hero moment.

### Remove demo scaffolding (X-01): done after the features above
Order: (1) `docs/cleanup-audit.md`; (2) spec commit; (3) merge company onboarding (R-01 to R-03) so companies can arrive without a seed; (4) delete stub mode, the demo routes, the simulator, the Stage view, the Data Flow Inspector and its replay, the demo profile and the seeded companies; (5) `DEV_TOOLS`, `pnpm dev:reset`, `pnpm dev:tamper`; (6) the wallet's short-expiry option; (7) rewrite `pnpm e2e` to create its own companies and a headless wallet; (8) the acceptance greps of the audit. Gate: the greps in `cleanup-audit.md` §7 are clean, no HTTP route resets state, and `pnpm dev:tamper` followed by the Auditor's Verify names the batch and record.

### Customer portal and wallet data entry (C-09, W-13)
Built after confidential processing. Order: (1) spec commit; (2) Processor rules for employment and a missing score, with tests; (3) `web/src/portal/journey.ts` and its tests, then the page; (4) the wallet's W10 screen and strings; (5) the e2e section that drives the journey with a headless wallet. Gate: one person can do the whole loop on stage, and `pnpm e2e` plays it.

### Sammati ID and targeted requests (N-01, N-02, W-14)
Built after the portal. Order: (1) spec commit; (2) Core: tables, signed-message checks, targeted send with the anti-enumeration rule and abuse controls, with tests; (3) wallet: ID registration, inbox, Decline and Block; (4) console tab; (5) e2e. Gate: send from the console, inbox within 2 s, grant, Granted in the console; an unknown handle gives the same answer and no push.

### Company onboarding (R-01 to R-04)
Built after targeted requests. Order: (1) spec commit; (2) Core: tables and migration, key store, API-key auth and rate limit on the gateway routes (with the SDK's `apiKey`), directory endpoint; (3) registration (apply, approve with the chain steps and their retry, reject, reissue), sandbox rules, test customers; (4) web: directory provider and the removal of hard-coded companies, `/join`, the status page, the Registrations tab, the SANDBOX badge; (5) `integration.md` and the sample app; (6) e2e. Gate: DemoBank joins, is approved, runs the quickstart, is asked, is granted, ALLOWED, withdrawn, BLOCKED, inside `pnpm e2e`.

### Console operator login (C-10)
Built after company onboarding. Order: (1) spec commit; (2) Core: `console_operators` and `console_sessions` schemas, `POST /v1/console/login`, `GET /v1/console/me`; (3) web: Operator login screen at `/login` or within `/company/:id`, enforcing that the switcher only shows companies the operator owns. Gate: Login works, one operator cannot see another company's data.

### Expiry, renewal and notification centre (N-03, N-04, N-05, W-11)
Built after the inbox. Order: (1) spec commit; (2) Core: `notifications`, the scheduler, renewal requests and routes, with tests; (3) the Processor's erasure grace; (4) wallet: Alerts tab, actions, local notifications, strings; (5) console Expiring table; (6) e2e with a few seconds of expiry. Gate: with the wallet's short-expiry option on, grant 2 minutes, see expiring then expired, 451 `CONSENT_EXPIRED`, Renew, ALLOWED again.

### Account and profile (W-15 to W-17)
Built after company onboarding and the expiry work, and it replaces the wallet's leftover sample profile. Order: (1) spec commit; (2) `shared/src/categories.ts` with the registry, `profilePayload` and vectors, and registry-only categories in applications (`BAD_APPLICATION`); (3) Core: `GET /v1/identities/availability` with its rate limit, `dataCategories` in the consent view; (4) wallet: Dart registry against the vectors, the profile vault (encrypt, lock, tamper), strings in en/hi/kn; (5) wallet screens: create account, My details, About, the share screen driven by categories, the changed-details marker and one-tap update; (6) web: a category picker in `/join` and the purpose drawer; (7) the privacy search in `pnpm e2e`. Gate: kill the app, reopen it, unlock and see the profile; a consent that needs a missing field asks for that field only; a search of Core's and the Processor's databases, logs and events finds none of the profile's values. It depends on the Sammati ID (N-01) and on the Processor (V-01 to V-06). Its ID and profile steps are skippable, so cutting them leaves W-01 as it was (cut line below, item 6).

### Usage records (V-08, V-09, W-18)
Built after the account and profile work. Order: (1) spec commit; (2) `shared`: entry format 2, `entryFormat`, submit message v2, `LoanDecision.rateBps`, tests including the mixed-chain refusal; (3) gateway SDK: format 2 entries and epoch resume; Core: columns, append rules, verifier, activity and events; (4) Processor: versioned submit with `consentRef`, multi-handle evaluate with the application, rules, usage categories; (5) wallet: versioned submit, Activity sentences, detail sheet, named erasure line; (6) the random-profile leak test. Gate: apply gives a decision and a rate, Activity shows the usage within 2 s, withdraw then apply is 451 and erased, and the leak test finds nothing.

### H18–H22: Rehearse
- Run the demo script (`demo.md`) end to end at least 5 times, timed.
- Record the fallback video on a clean run.
- Install APK on the spare phone. Test on the venue network or hotspot.
- Prepare Q&A answers; each person rehearses the questions in their area.

### H22–H24: Buffer
- Sleep or rest if possible. Final reset (`pnpm dev:reset`), charge devices, verify Amoy links, set up the stage.

## 4. Priority and cut lines
If time runs short, cut from the bottom, never from the top. The order the features were built in, and so the order they are cut in reverse, is: confidential processing, the inline QR page (the customer portal), notifications and the inbox, then the DPDP document.

1. Golden path (non-negotiable)
2. The three hero moments: blocked after withdraw (W-05, B-01), a decision from data the company never saw (V-01 to V-06), tamper detection (A-03)
3. Cascade (W-08, C-06), proof sheet (W-07), Auditor scorecard (A-01), languages (W-09)
4. Confidential processing as a whole (V-01 to V-06): if it is cut, remove Act 4 from `demo.md`, but then a hero moment is gone, so cut something else first
5. The inline QR page (portal, C-09, W-13): if cut, Act 1 uses the console QR
6. Notifications and the inbox (N-01 to N-05, W-11, W-14), then the account profile (W-15 to W-17, which falls back to the plain create-wallet of W-01): cut Act 7 first, then Act 6; the Alerts tab and Sammati ID are the last to go
7. The DPDP document and "How this protects you" (L-01, L-02)
8. Rights (W-10), report export (C-08, A-04), Amoy deployment (B-06)
9. P2 items (nominee, grievance overview). Company onboarding (R-01 to R-04) is built

### Gates (each must pass before moving on)
| Gate | What must be true | How it is checked |
|---|---|---|
| Golden path | QR to ALLOWED to withdraw to BLOCKED on the real phone | by hand, then `pnpm e2e` |
| Confidential processing | Seal, submit, decision, ciphertext-only admin view, erasure on withdrawal; the PAN it submitted appears nowhere | `pnpm e2e` (plaintext search), `processor` and `shared` tests |
| Inline QR page | The portal journey plays with a headless wallet, and by hand with the phone | `pnpm e2e`, web tests |
| Notifications and inbox | A targeted request reaches the inbox in 2 s; an unknown ID gives the same answer and no push; expiry gives expiring, expired, 451, renew, ALLOWED | `pnpm e2e` (a stack it starts itself, with short reminder settings) |
| DPDP document | Claims reviewed; no compliance overclaim | `docs/dpdp-mapping.md` |
| Account and profile | Create account, kill and reopen, unlock, profile still there; missing-field prompts only when a consent needs them; no profile value in Core, the Processor's database, logs or events | wallet tests, `shared` vectors, `pnpm e2e` (privacy search) |
| Whole | `pnpm e2e` under 45 s, `pnpm -r test`, `pnpm -r typecheck`, lint, wallet `flutter test` and `flutter analyze` | before every rehearsal |

## 5. Checklists

### Definition of done (per feature)
- Acceptance criteria in `prd.md` pass
- Works on the real phone (for wallet features) or in the browser (for web)
- Appears in `pnpm e2e` if it is on the golden path or a hero moment
- No console errors, no placeholder text
- Any wording about the law follows `dpdp-mapping.md` §6: "aligned with the principles of", never "compliant", "certified" or "approved", and no section or rule number that is not recorded as checked

### Integration contracts (do not change without telling the others)
- EIP-712 types and domain: `shared/eip712.ts` (and the Dart copy in `wallet/lib/core/eip712.dart`)
- REST paths and WebSocket event names: `trd.md` §6
- Reason codes: `CONSENT_WITHDRAWN`, `CONSENT_EXPIRED`, `NO_CONSENT`, `LEDGER_UNAVAILABLE`, `NO_PRINCIPAL`
- Colours and copy keys: `ui.md`
- Company API keys, the `x-sammati-api-key` header and the registration routes: `trd.md` §6.2a, §6.12 (the SDK, the Processor and the console depend on them)
- Data category ids, their order and the profile field map: `shared/src/categories.ts`, `shared/test-vectors/data-categories.json` (and the Dart copy `wallet/lib/core/data_categories.dart`); they are part of the notice hash
- Vault envelope format and test vectors: `shared/src/envelope.ts`, `shared/test-vectors/envelope.json` (and the Dart copy `wallet/lib/core/envelope.dart`); Processor endpoints and `vault.*` / `processor.*` events: `trd.md` §6.5, §6.7

### Onboarding checklist (R-01 to R-04)
- [x] Specs first: prd §6.7, trd §6.12 and §6.2a, drd §3, ui §3.2, §3.3 and §4, architecture §5.7, demo the new-company step, `integration.md`
- [x] Core: key store, API-key auth, rate limit, `GET /v1/fiduciaries`, registration, regulator routes, sandbox, test customers, migration
- [x] Gateway SDK `apiKey` and the clear fail-closed message; companies and Processor use their keys
- [x] Web: directory in the console, Auditor, ledger filter; `/join`; status page; Registrations tab; SANDBOX badge
- [x] `integration.md` linked from README; sample app runs
- [x] Package tests green (shared, gateway, processor, core, web)
- [ ] `pnpm e2e` extended and run against a real stack (the steps are written; see the PR note)
- [ ] The optional new-company step of `demo.md` rehearsed

### Final round (QuickLoan, notifications, hardening): status
- [x] X-01 remove demo scaffolding; Q-01 to Q-04 QuickLoan (`companies/quickloan`); reusable company site (`companies/template`); `rights.updated`; e2e rewritten on public APIs with a headless wallet (44 steps, about 35 s of story, under a minute with the stack); `real.test.ts` races fixed.
- [x] Docs: `demo.md` rewritten as a user and regulator walkthrough with honest limitations and Q&A; `dpdp-mapping.md` VERIFY list refreshed (VERIFY-16 to 21).
- [ ] Wallet: Developer-settings **Short expiry for testing** and the "Developer option" chip; notification-centre strings for `rights.updated` in en/hi/kn; remove the unused `expiry_demo` key.
- [ ] Real-phone tests listed in `RELEASE_CHECKLIST.md` (clean install, biometric, hotspot, spare phone, background push). None run yet.
- [ ] Sign-in with Sammati at QuickLoan (specified, not built); rights inbox in the back-office (waits for R6).
- [ ] Close the gaps found by the spec audit: wallet copy keys in `ui.md` not yet in the app (`dev_*`, `expiry_short_*`).

### Git workflow
- Trunk-based, short branches per feature ID (`feat/W-05-withdraw`), merge to `main` at least hourly.
- A merges contract or API changes first and announces them in the team chat.
- Tag `demo-ready` on the commit used for the stage; never deploy untagged code.

### Communication
- 10-minute sync at every gate (H2, H8, H14, H18).
- If blocked for more than 20 minutes, ask for help.
