# Tasks — 3 people, 24 hours

## 1. Roles

| Person | Owns | Primary deliverables |
|---|---|---|
| **A: Chain and Core** | `contracts/`, `core/`, `gateway/`, `shared/`, `processor/` | ConsentRegistry, AccessAnchor, relayer, indexer, cache, anchoring, cascade, audit APIs, SDK, e2e script. Confidential processing: `processor/`, `shared/src/envelope.ts` and its vectors, the Core event intake, the SDK's `logAccess` (V-01 to V-04) |
| **B: Wallet** | `wallet/` | Flutter app: W-01 to W-10, signing, live feed, proofs, i18n, APK. Confidential processing: `envelope.dart` against the shared vectors, demo profile screen, "Send securely" on the QuickLoan pass (V-01, V-06) |
| **C: Web and Story** | `web/`, `companies/`, deck, demo | Company console, simulator, 3 demo companies, Auditor, Stage view, deck, rehearsals. Confidential processing: QuickLoan without plaintext (handle store, apply endpoint), "What QuickLoan holds" card and timeline, Act 3b (V-05, V-06) |

Whoever finishes first helps whoever is behind, in this order: B (wallet is the hero), then A, then C polish.

## 2. The golden path (build this first, nothing else matters until it works)

`Console QR → wallet scan → consent notice → signed grant → on-chain → gateway ALLOWED → wallet withdraw → gateway BLOCKED`

Everything below P0 waits until this path runs end to end on the real phone.

## 3. Timeline

### H0–H2: Setup and spikes (all three, parallel)
- **A:** monorepo scaffold, Hardhat project, `shared/` EIP-712 types, first failing contract test for grant. Start `pnpm demo:up` skeleton.
- **B:** Flutter project, packages installed, **EIP-712 signing spike** producing a signature that the Hardhat test recovers (decide fallback in `trd.md` §4.3 by H2).
- **C:** Vite app, routes, Tailwind tokens from `ui.md`, one demo company Express app with a fake endpoint, repo conventions.
- **Gate H2:** signing approach decided, contract skeleton compiles, all three can run their app locally.

### H2–H8: Golden path
- **A:** ConsentRegistry grant/withdraw/expiry + tests (§3.3 of TRD), deploy script, Core: `/requests`, `/consents/grant`, `/consents/withdraw`, relayer, indexer, consent cache, WebSocket. Gateway SDK `requireConsent` with 451 responses.
- **B:** onboarding and wallet creation, scan screen, consent notice (W3), sign and submit, consent home (W4/W5) reading Core, withdraw flow.
- **C:** Console: purposes view, new request QR, live requests with simulator, wiring three company apps to the SDK.
- **Gate H8 (hard):** golden path works on the real phone with real chain. If not, everyone stops new work and fixes this.

### H8–H14: Differentiators
- **A:** access-log hashing, Merkle anchoring, AccessAnchor, cascade engine and processor stubs, audit verify API, tamper demo endpoint.
- **B:** live activity feed (W6), proof sheet (W7), cascade section, language switching (W9 with real strings).
- **C:** Auditor (scorecard, ledger explorer, Verify with mismatch view), consent table, processors view.
- **Gate H14:** tamper detection demo works; cascade fills in on the phone.

### H14–H18: Polish and depth
- **A:** Amoy deployment and explorer links, reconcile job, `pnpm e2e`, fail-closed behaviour, README run instructions.
- **B:** animations (pass-cut), rights screens (W8), error/offline states, app icon, release APK.
- **C:** Stage view, evidence/report export, deck (7 slides, one of them the legal-alignment slide), copy pass with native-speaker check on Hindi and Kannada. Legal alignment (L-01, L-02): `dpdp-mapping.md` and its claims review; hand the VERIFY checklist (§7 there) to someone who can check it against the official Act and Rules text.
- **Gate H18:** feature freeze. Only fixes after this.

### Confidential processing (V-01 to V-06): after the hero moments
Built once the golden path, tamper detection and cascade work (it is a differentiator, not the golden path). Order: (1) spec commit; (2) `shared/src/envelope.ts` + vectors, Dart `envelope.dart` passing the same vectors (hour 1, blocking: if the Dart side cannot match, V-01 stops there); (3) `processor/` with submit, evaluate, erasure; (4) QuickLoan and Core intake; (5) wallet and console screens; (6) extend `pnpm e2e`. Gate: the extended `pnpm e2e` passes, including the plaintext search. Cut it before cutting any hero moment.

### Data Flow Inspector (V-07, S-04): with the confidential-processing work
Built after V-01 to V-06 work end to end, since it reads their events. Order: (1) spec commit; (2) Core's `POST /v1/demo/withdraw`; (3) the pure parts first, each with tests: lane state machine, privacy check, staff-view filter, replay file; (4) the screen and the `/stage` panel; (5) record `web/public/flow-replay.json` from a real `pnpm e2e` run. Gate: the replay plays with no stack running, and a plaintext value injected into any event hides the privacy line.

### Customer portal and wallet data entry (C-09, W-13)
Built after the Inspector. Order: (1) spec commit; (2) Processor rules for employment and a missing score, with tests; (3) `web/src/portal/journey.ts` and its tests, then the page; (4) the wallet's W10 screen and strings; (5) the e2e section that drives the journey with a headless wallet. Gate: one person can do the whole loop on stage, and `pnpm e2e` plays it.

### Sammati ID and targeted requests (N-01, N-02, W-14)
Built after the portal. Order: (1) spec commit; (2) Core: tables, signed-message checks, targeted send with the anti-enumeration rule and abuse controls, with tests; (3) wallet: ID registration, inbox, Decline and Block; (4) console tab; (5) e2e. Gate: send from the console, inbox within 2 s, grant, Granted in the console; an unknown handle gives the same answer and no push.

### Company onboarding (R-01 to R-04)
Built after targeted requests. Order: (1) spec commit; (2) Core: tables and migration, key store, API-key auth and rate limit on the gateway routes (with the SDK's `apiKey`), directory endpoint; (3) registration (apply, approve with the chain steps and their retry, reject, reissue), sandbox rules, test customers; (4) web: directory provider and the removal of hard-coded companies, `/join`, the status page, the Registrations tab, the SANDBOX badge; (5) `integration.md` and the sample app; (6) e2e. Gate: DemoBank joins, is approved, runs the quickstart, is asked, is granted, ALLOWED, withdrawn, BLOCKED, inside `pnpm e2e`.

### H18–H22: Rehearse
- Run the demo script (`demo.md`) end to end at least 5 times, timed.
- Record the fallback video on a clean run.
- Install APK on the spare phone. Test on the venue network or hotspot.
- Prepare Q&A answers; each person rehearses the questions in their area.

### H22–H24: Buffer
- Sleep or rest if possible. Final reset (`pnpm demo:reset`), charge devices, verify Amoy links, set up the stage.

## 4. Priority and cut lines
If time runs short, cut from the bottom, never from the top:

1. Golden path (non-negotiable)
2. Tamper detection (A-03) and cascade (W-08, C-06): the two hero moments
3. Proof sheet (W-07), Auditor scorecard (A-01), languages (W-09)
4. Rights (W-10), report export (C-08, A-04), Amoy deployment (B-06), confidential processing (V-01 to V-06; if it is cut, remove Act 3b from `demo.md` and keep the rest)
5. P2 items (reminders, nominee, grievance overview)

## 5. Checklists

### Definition of done (per feature)
- Acceptance criteria in `prd.md` pass
- Works on the real phone (for wallet features) or in the Stage view (for web)
- Appears in `pnpm e2e` if it is on the golden path or a hero moment
- No console errors, no placeholder text
- Any wording about the law follows `dpdp-mapping.md` §6: "aligned with the principles of", never "compliant", "certified" or "approved", and no section or rule number that is not recorded as checked

### Integration contracts (do not change without telling the others)
- EIP-712 types and domain: `shared/eip712.ts` (and the Dart copy in `wallet/lib/core/eip712.dart`)
- REST paths and WebSocket event names: `trd.md` §6
- Reason codes: `CONSENT_WITHDRAWN`, `CONSENT_EXPIRED`, `NO_CONSENT`, `LEDGER_UNAVAILABLE`, `NO_PRINCIPAL`
- Colours and copy keys: `ui.md`
- Company API keys, the `x-sammati-api-key` header and the registration routes: `trd.md` §6.2a, §6.12 (the SDK, the Processor and the console depend on them)
- The Data Flow Inspector's replay file (`web/public/flow-replay.json`) is generated, not edited: regenerate it when the event shapes change
- Vault envelope format and test vectors: `shared/src/envelope.ts`, `shared/test-vectors/envelope.json` (and the Dart copy `wallet/lib/core/envelope.dart`); Processor endpoints and `vault.*` / `processor.*` events: `trd.md` §6.5, §6.7

### Onboarding checklist (R-01 to R-04)
- [x] Specs first: prd §6.7, trd §6.12 and §6.2a, drd §3, ui §3.2, §3.3 and §4, architecture §5.7, demo Act 6b, `integration.md`
- [x] Core: key store, API-key auth, rate limit, `GET /v1/fiduciaries`, registration, regulator routes, sandbox, test customers, migration
- [x] Gateway SDK `apiKey` and the clear fail-closed message; companies and Processor use their keys
- [x] Web: directory in the console, Stage, Auditor, ledger filter; `/join`; status page; Registrations tab; SANDBOX badge
- [x] `integration.md` linked from README; sample app runs
- [x] Package tests green (shared, gateway, processor, core, web)
- [ ] `pnpm e2e` extended and run against a real stack (the steps are written; see the PR note)
- [ ] Act 6b rehearsed

### Git workflow
- Trunk-based, short branches per feature ID (`feat/W-05-withdraw`), merge to `main` at least hourly.
- A merges contract or API changes first and announces them in the team chat.
- Tag `demo-ready` on the commit used for the stage; never deploy untagged code.

### Communication
- 10-minute sync at every gate (H2, H8, H14, H18).
- If blocked for more than 20 minutes, ask for help.
