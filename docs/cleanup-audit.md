# Cleanup audit: demo scaffolding (X-01)

Everything that exists only to stage a demo, with a decision for each item. The product has to work through its real screens and APIs only. This file is the one place where the removed words ("simulator", "stage view", "seeded", "fake", `DEMO_MODE`, `/v1/demo/fire`) may still appear.

Decisions: **DELETE** (gone, no replacement), **REPLACE** (a real mechanism takes over), **KEEP** (stays, with the reason).

Audit date 2026-10-09, taken after merging `feat/R-01-R-03-onboarding` (company self-registration), because "companies arrive through R-03" is only true once that is in.

## 1. Simulator UI and endpoints

| Item | Where | Decision | Reason |
|---|---|---|---|
| Console **Simulator** tab, "Run credit check / Send marketing SMS / Share with bureau" buttons, `COMPANY_BUTTONS` | `web/src/pages/company/LiveRequestsSection.tsx`, `Company.tsx`, `OverviewSection.tsx` ("Open simulator") | DELETE | Fires requests the company's own server should make. The Live feed stays: it is driven by real `access.logged` events |
| `POST /v1/demo/fire` and `demoFire()` | `core/src/real/routes.ts`, `core/src/routes/demo.ts`, `web/src/api.ts`, `shared/src/types.ts` (`DemoFireBody`, `DemoFireResponse`) | DELETE | Lets a console fabricate an access decision |
| "Simulate wallet scan and grant" button with a dummy signature | `web/src/pages/company/NewRequestSection.tsx` | DELETE | A grant without the customer's signature is exactly what the system must make impossible |
| `POST /v1/demo/withdraw`, `demoWithdraw()`, `demoPrincipalKeys`, `DEMO_PRINCIPAL_KEYS` | `core/src/real/routes.ts`, `config.ts`, `web/src/api.ts` | DELETE | Core signing a withdrawal for a customer. Only the wallet withdraws |
| `POST /v1/demo/anchor` | `core/src/real/routes.ts`, `routes/demo.ts` | DELETE | Anchoring runs on its timer; tests call `AnchorJob.runOnce` directly |
| Company sample backends with canned responses (campaign id, "recipient +91 98765 43210", bureau batch, offer amounts) | `companies/quickloan`, `companies/medicare`, `companies/foodrush` | DELETE medicare and foodrush; REPLACE quickloan with `examples/lender` (below) | They are the fake payloads. A company's own server is the company's business |
| `companies/quickloan` vault handle store and `/customers/:id/apply` | `companies/quickloan/src` | REPLACE | Kept as the generic sample lender `examples/lender`, configured by `CORE_URL`, `FIDUCIARY`, `SAMMATI_API_KEY`, `PURPOSE`, with no canned payload (responses carry a reference only) and no hard-coded company. It is the reference integration of the Processor (V-05) |
| `core/examples/quickstart.ts` ("sample:company") | `core/examples` | KEEP | The five-line integration of `docs/integration.md`. Already generic |

## 2. Stage view, Data Flow Inspector, replay

| Item | Where | Decision | Reason |
|---|---|---|---|
| `/stage` and `Stage.tsx` (presenter hint banner, scrcpy copy, per-company feeds) | `web/src/pages/Stage.tsx`, `App.tsx` | DELETE | Presenter tooling |
| `/stage/flow`, `StageFlow.tsx`, the whole inspector (`web/src/flow/*`), "Withdraw and re-run" presenter control | `web/src/pages/StageFlow.tsx`, `web/src/flow/*` | DELETE | Presenter tooling. The privacy claim it displayed is proven by `pnpm e2e`, which searches logs, events, responses and databases for the profile values |
| Replay mode and `web/public/flow-replay.json`, `E2E_RECORD_FLOW` | `web/src/flow/replay.ts`, `playout.ts`, `core/scripts/e2e.ts` | DELETE | Plays a recording as if it were live |
| Wallet "scrcpy" and projector wording | `docs/demo.md`, `README.md`, `RELEASE_CHECKLIST.md` | REPLACE | Demo script keeps one line on mirroring the phone; no product copy mentions it |
| `/gallery` (component gallery with "realistic demo data") | `web/src/pages/Gallery.tsx` | DELETE | Design scratchpad with invented customers; not a product screen |
| Console "stage sheet" mention in the Auditor access-code hint | `RegistrationsSection.tsx` | REPLACE | Says where the operator finds the access code (`REGULATOR_KEY`) |
| Demo company portal `/portal/quickloan` ("demo login", alias, loan form) | `web/src/portal/*` | REPLACE | Becomes `/portal/:slug`, the customer page of any approved company that uses the Processor. "Sign in" asks for a customer id (the company-side alias), nothing else. It never takes a PAN or income |
| `/join` "Fill in the DemoBank example" button | `web/src/join/*` | DELETE | A prefilled fictional application |

## 3. Seeded customers, fake payloads, hard-coded companies

| Item | Where | Decision | Reason |
|---|---|---|---|
| `STUB_MODE`, `StubStore`, `core/fixtures/*.json`, `gen-fixtures.ts`, `stub-events.ts`, `routes/{company,consent,audit,rights,targeted-stub,onboarding-stub}.ts`, `pnpm demo:up:stub` | `core/src`, `core/fixtures`, `scripts/demo-up.mjs` | DELETE | A whole second Core with seeded customers, canned ledgers and a timer that invents events |
| Seeded request `req_demo_quickloan` ("Customer #4821"), `DEMO_REQUEST_ID` | `core/src/real/repo.ts` | DELETE | Fabricated request |
| `SEED_FIDUCIARIES` (QuickLoan, MediCare+, FoodRush, their purposes, processors, Hardhat keys, ports, colours), `seedDirectory`, `demoApiKey(slug)`, `fiduciaryKeys`/`processorKeys` derived from it | `shared/src/seed.ts`, `core/src/real/repo.ts`, `config.ts`, `processor/src/config.ts` | DELETE | No company, purpose or processor is seeded. Core reads company and processor keys from the rows it created at approval |
| `seedRegistry` and `contracts/scripts/seed.ts` registering companies | `shared/src/seed-chain.ts`, `contracts/scripts/seed.ts` | REPLACE | `pnpm seed` only funds the relayer. Test registration helpers move to `test/` |
| `DEMO_PRINCIPAL` (Hardhat account #0 as "Asha"), `DEMO_PRINCIPAL_KEY`, `DEMO_ALIAS`, always-a-sandbox-test-customer rule | `shared/src/seed.ts`/`index.ts`, `onboarding.ts`, console, wallet tests | DELETE | No seeded customer. The regulator adds test customers by hand (R-03) |
| `fiduciaries.demo` column and `demo` in directory responses, `DEMO_COMPANY` errors | `core/src/real/db.ts`, `onboarding*.ts`, `shared/src/types.ts`, web | DELETE | Every company is registered the same way |
| Built-in demo downstream processors by name (CreditBureauX, AdPartnerQ, ...) | `core/src/real/processors.ts`, `cascade.ts` | REPLACE | A processor is the one an approved application declared. Core still acknowledges for it with the key it generated: a disclosed shortcut |
| `DEMO_RELAYER_KEY` default, `DEMO_RELAYER_ADDRESS` | `shared`, `core/config.ts` | KEEP for local chain only | The relayer is allowed in the minimum seed. Default stays Hardhat's public key on the local chain; Core refuses it on a public network |
| Contracts, regulator/admin account (Hardhat #0 locally), relayer | `contracts/` | KEEP | The minimum seed |
| Wallet demo profile (fictional PAN, income band, score, "Use demo details") | `wallet/lib/core/demo_profile.dart`, `features/vault/demo_profile_screen.dart`, `Routes.demoProfile`, Me tile, `l10n` keys | DELETE | The wallet collects the fields by typing only. A typed profile has no credit score; the existing `SCORE_ASSUMED` rule already covers it |
| Processor built-in sample data | `processor/src` | KEEP, none found | `rules.ts` holds only the PAN pattern and limit table, not sample data. Keys of companies come from Core |
| Test fixtures (hard-coded principals, fake Core, fake wallet stubs) | `*/test/`, `wallet/test/support/` | KEEP | Under `test/` only; they never ship |
| `docs/copy-hi-kn.md` (Hindi and Kannada text for the nine seeded purposes) | `docs/` | REPLACE | Kept as reference wording a company can start from; it no longer claims to be the built-in text |
| Root copies of `prd.md`, `trd.md`, `drd.md`, `ui.md`, `architecture.md`, `demo.md`, `tasks.md` | repo root | DELETE | Byte-identical stale duplicates of `docs/`. The source of truth is `docs/` (AGENTS.md) |
| `demo-up.log`, `wallet-web*.log` | repo root, untracked | DELETE | Local logs. `*.log` is ignored |

## 4. Demo controls

| Item | Where | Decision | Reason |
|---|---|---|---|
| `POST /v1/demo/tamper/:fid`, `triggerTamper`, Auditor "Tamper demo" button and `Ctrl+Shift+T`, per-row tamper icon | `core`, `web/src/pages/Auditor.tsx`, `auditor/*` | REPLACE | `pnpm dev:tamper -- <fiduciary> <seq>`: a CLI that edits one stored access-log row in SQLite. Not exposed over HTTP or in any UI |
| `POST /v1/demo/reset`, `triggerDemoReset`, `Ctrl+Shift+R`, `pnpm demo:reset` | `core`, `processor/src/app.ts` (`/v1/demo/reset`, `/v1/demo/tamper/:handle`), `web`, `scripts/demo-reset.mjs` | REPLACE | `pnpm dev:reset`: a CLI that wipes Core's DB and the Processor's vault and redeploys the contracts. No HTTP endpoint can reset state |
| `DEMO_MODE` (Core and Processor) | `config.ts`, `processor/src/config.ts`, `.env.example` | REPLACE | `DEV_TOOLS=true` enables only the two CLI scripts. Startup fails if `DEV_TOOLS=true` and `NODE_ENV=production` |
| `DEMO_FAST_EXPIRY`, `pnpm demo:up:fast`, `fastExpiry` in the notice, shortened thresholds and ticks | Core, Processor, wallet, `scripts/demo-up.mjs` | REPLACE | Wallet **Me > Developer settings > Short expiry for testing** (2 min, 10 min), off by default; a consent made with it carries a visible "Developer option" label. Contracts and Core have no mode: the customer signs a short `expiresAt`. Expiry thresholds and grace stay configurable by `EXPIRY_*` variables for tests |
| Hidden "presenter shortcut" tooltips and toasts | `web` | DELETE | Tied to the above |
| `scripts/chain.mjs` `resetCore`/`resetProcessor` over HTTP | `scripts/chain.mjs` | REPLACE | `dev:reset` works on the files and the chain directly |

## 5. UI text containing "demo", "simulate", "fake", "mock", "test user"

| Text | Where | Decision |
|---|---|---|
| "The data in this demo is fictional." | `ReportModal.tsx` | REPLACE with "Use only fictional data in this build; it is a prototype" (honest limit stays) |
| "Demo database reset to clean seed state." | `Auditor.tsx` | DELETE with the button |
| "In the demo it is on the stage sheet." | `RegistrationsSection.tsx` | REPLACE (see section 2) |
| "The demo customer is always one." | `RegistrationsSection.tsx` | DELETE |
| `expiry_demo` ("2 minutes (demo)") and demo profile strings in `app_en/hi/kn.arb` | wallet | REPLACE (short expiry strings) / DELETE (demo profile strings) |
| "Customer #4821", "Asha Sharma" default principal in the console | `LiveRequestsSection.tsx` | DELETE |
| `/join` "DemoBank" example copy | `web/src/join/copy.ts` | DELETE |
| The Processor says it is a "simulated enclave" in `/health`, the wallet and the console | `processor`, wallet, web | KEEP | An honest disclosure, required by the non-negotiables |

## 6. What "Demo shortcuts" means after this change

Only two things, stated in `docs/demo.md` and nowhere hidden:
1. Core holds the keys of companies and of their processors (a company that joins through registration included).
2. The Sammati Processor is a simulated sealed service until it runs in a TEE.

The regulator's access code being a shared secret, the sandbox being enforced by Core and not by the contracts, and the wallet taking the Processor's public key on trust over the venue network are limits, not shortcuts, and stay listed in `demo.md` §5 and `trd.md` §12.

## 7. Acceptance greps

```
grep -rniE "simulator|stage view|demo/fire|DEMO_MODE|fake|seeded" --exclude-dir=node_modules --exclude-dir=.git .
```

returns only this file, the "Demo shortcuts" statement in `docs/demo.md`, and test-only names under `test/` directories (a `fakeCore.ts` test double is a test file, not a shipped fake).
