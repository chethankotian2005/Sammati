# Sammati — Spec Pack (Hackatopia 2026 · CB-04)

> **Sammati** (सम्मति, "consent") is a placeholder name. Rename freely.
> **One-liner:** UPI for consent. A citizen wallet that gives, manages and withdraws consent across companies, backed by a ledger and an enforcement layer that makes withdrawal actually stop data access.

## Run it

Needs Node 20+, pnpm 9 (`npm i -g pnpm@9`) and, for the wallet, Flutter 3.x.

```
pnpm install
pnpm demo:up        # chain :8545, Core :4000, QuickLoan :4101, MediCare+ :4102, FoodRush :4103, web :5173
```

Core starts in **stub mode** (`STUB_MODE=true`): it serves every route in `docs/trd.md` §6 from `core/fixtures/*.json` with light in-memory state, and no chain is touched yet. Build wallet and web against it.

| Check | Command |
|---|---|
| Core is up | `curl localhost:4000/v1/health` |
| Web | http://localhost:5173 (`/company/quickloan`, `/auditor`, `/stage`) |
| Guarded endpoint | `curl -H "x-sammati-principal: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" localhost:4101/customers/1/credit-profile` returns data; without the header, `451 NO_PRINCIPAL` |
| Reset state | `pnpm demo:reset` |
| Everything | `pnpm lint && pnpm typecheck && pnpm -r test` |
| Wallet | `cd wallet && flutter analyze && flutter run` |

Useful for stub development:
- A ready-made consent request exists at `GET /v1/requests/req_demo_quickloan?principal=0x…`.
- `POST /v1/demo/tamper/:fid` then `POST /v1/audit/verify/:fid` shows the tamper alarm; `pnpm demo:reset` clears it.
- Signing test vectors for the Dart signer: `shared/test-vectors/eip712.json`.
- Set `CORE_PUBLIC_URL` (see `.env.example`) to the laptop's LAN IP so the QR code points the phone at Core.
- `pnpm e2e` is a placeholder for now.

Layout: `contracts/` `core/` `gateway/` `shared/` (lane A), `wallet/` (B), `web/` `companies/` (C), specs in `docs/`.

## Problem statement (CB-04)
Build a consent manager where users grant, view and withdraw purpose-specific consent across several companies, every action is recorded on a tamper-evident ledger, and companies' systems check consent before using data.

## What we are building (3 connected products + 1 ledger)

| # | Product | Who uses it | Role in the story |
|---|---|---|---|
| 1 | **Sammati Wallet** (Flutter APK) | Citizen (Data Principal) | The hero. GPay-style app: scan, consent, withdraw, see who touched your data |
| 2 | **Sammati Gateway + Company Console** (SDK + web) | Companies (Data Fiduciaries) | The enforcement. Every data request is ALLOWED or BLOCKED in real time |
| 3 | **Sammati Auditor** (web) | Regulator (Data Protection Board) | The proof. Verify compliance and detect tampering without trusting the company |
| 4 | **ConsentRegistry + AccessAnchor** (Solidity) | Everyone | The shared source of truth |

Demo companies (one citizen wallet, three companies): **QuickLoan** (fintech), **MediCare+** (health), **FoodRush** (delivery).

## Locked decisions

| Decision | Choice |
|---|---|
| Problem statement | CB-04 DPDP consent ledger |
| Hero | Citizen consent wallet, GPay-like feel |
| Supporting platforms | Enforcement gateway + company console; Regulator audit dashboard (live "who accessed my data" feed lives inside the wallet) |
| Wallet form factor | Native Flutter app, APK on a real phone |
| Chain setup | Local Hardhat chain for live demo + same contracts deployed to Polygon Amoy as public proof |
| Demo scenario | 3 companies sharing one user's wallet |
| Team / time | 3 people, ~24 hours, scope not reduced for time (see `tasks.md` for the golden path that protects the demo) |

## Documents

| File | Purpose |
|---|---|
| `prd.md` | What and why: personas, features with IDs, priorities, acceptance criteria |
| `architecture.md` | System design, trust model, data flows, why blockchain |
| `trd.md` | Stack, contract interface, EIP-712 types, APIs, events, deployment |
| `drd.md` | Data requirements: on-chain and off-chain schemas, hashing, seed data, privacy rules |
| `ui.md` | Design system, every screen, copy, motion, i18n |
| `demo.md` | The 4-minute demo script, stage setup, fallbacks, judge Q&A |
| `tasks.md` | Work split for 3 people, 24-hour plan, cut lines, definition of done |
| `AGENTS.md` | Rules for AI coding tools working in this repo |

## Assumptions to confirm
1. **"DRD"** is interpreted as **Data Requirements Document**. If your team means Design Requirements, `ui.md` already covers it.
2. DPDP Act section numbers in these docs are from memory. **Verify them against the official Act and Rules text before they go on a slide.**
3. Product name, colours and fonts are proposals.

## Spec-driven workflow
1. Read `prd.md` for the feature ID you are building.
2. Follow `trd.md` and `drd.md` exactly for interfaces and schemas. If reality forces a change, update the spec first, then the code.
3. Build the **golden path** (see `tasks.md`) before any P1/P2 feature.
4. Every feature is done only when its acceptance criteria in `prd.md` pass.
