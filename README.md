# Sammati — Spec Pack (Hackatopia 2026 · CB-04)

> **Sammati** (सम्मति, "consent") is a placeholder name. Rename freely.
> **One-liner:** UPI for consent. A citizen wallet that gives, manages and withdraws consent across companies, backed by a ledger and an enforcement layer that makes withdrawal actually stop data access.

## Run it

Needs Node 20+, pnpm 9 (`npm i -g pnpm@9`) and, for the wallet, Flutter 3.x.

```
pnpm install
pnpm demo:up        # chain :8545 (contracts deployed, relayer funded), Core :4000, Processor :4200, web :5173
```

`demo:up` starts a fresh Hardhat node, deploys `ConsentRegistry` and `AccessAnchor`, funds the relayer and starts Core, the Processor and the web app. **It starts empty**: no company, purpose, processor or customer is built in. A company joins at http://localhost:5173/join and the regulator approves it under Auditor > Registrations (access code `demo-regulator-key`); then follow `docs/integration.md` (`docs/prd.md` R-01 to R-04). Addresses land in `shared/deployments.json`; ABIs are in `shared/abi/`. Config is in `.env.example`, all optional.

**What it prints first matters for the phone.** The QR code tells the wallet which address to fetch the consent notice from, and `localhost` would be the phone itself. So `demo:up` detects the laptop's LAN address and prints it in a banner, e.g. `http://192.168.1.23:4000`. If the laptop is on two networks the banner lists both: set `CORE_PUBLIC_URL` to the right one.

### Developer tools (`DEV_TOOLS=true`)

Two command-line scripts, for developers only. There is no HTTP endpoint or screen that does either; they work on files and the local chain. Core and the Processor refuse to start with `DEV_TOOLS=true` and `NODE_ENV=production`.

```
DEV_TOOLS=true pnpm dev:reset                          # reset the chain, redeploy, fund the relayer, remove Core's database and the Processor's vault
DEV_TOOLS=true pnpm dev:tamper -- <fiduciary> <seq>    # edit one stored access-log row, as a malicious insider would
```

After `dev:tamper`, press **Verify** for that company in the Auditor (or `POST /v1/audit/verify/<fid>`): it reports `ok: false` and names the exact batch and record. The wallet's **Me > Developer settings > Short expiry for testing** adds 2-minute and 10-minute expiry choices; it is off by default, and a consent made with it is labelled **Developer option**.

### `pnpm e2e`: the whole story, in under 45 s

```
pnpm e2e            # starts its own throwaway stack on other ports, and stops it afterwards
```

It plays the story once, against real services, with a headless wallet client and throwaway companies it creates through the public APIs: register and approve a company → it creates a consent request → the user signs and the relayer grants it on chain → a request is **ALLOWED** → a purpose never consented to is **BLOCKED** → the user withdraws → the same request is **BLOCKED** → the downstream processor acknowledges on chain → verify the log against the chain (**clean**) → `dev:tamper` one stored row → verify again (**mismatch pinpointed** to that record). It also checks the live WebSocket feeds saw each step, and plays the confidential-processing, portal, targeted-request and expiry stories (`docs/prd.md` V-01 to V-06, C-09, N-01 to N-05), searching every response, event, log and database file for the PAN it submitted.

- It never touches a stack that is already running; `E2E_BUDGET_MS` sets the time budget.
- Fixtures live in `*/test/` and in `core/scripts/e2e.ts`. None of them ships with the app.

### The wallet account and profile (W-15 to W-17)

A new user creates an account in the wallet: choose a Sammati ID (checked with Core), secure the phone with a fingerprint or PIN, then optionally fill in a profile (name, contact, financial, health and preference details, all optional, `docs/trd.md` §4.6). The profile lives **only on the phone**, encrypted, and opens only after the device check; Core, the chain and every server never receive it. A company gets a detail only through a consent that needs it, as a per-purpose ciphertext for the Processor, and the wallet asks for a missing field only then. Edit it under **Me > My details**. **There is no account recovery in this build** (`docs/architecture.md` §5.9); use made-up details.

### Customer portal (`/portal/<company>`)

A company's customer page, run by the sample lender (`examples/lender`): sign in with a customer id, tick the consent box, scan the QR with the wallet, share the details in the wallet, Apply, see the decision, withdraw and watch Apply stop (`docs/ui.md` §3.1, `docs/trd.md` §6.10). The page never receives or shows a PAN or an income.

### Deploy to Polygon Amoy (public proof)

The live demo runs on the local chain. For a public, checkable proof the same contracts can be deployed to Polygon's Amoy testnet.

1. Get test MATIC for a wallet you control from an Amoy faucet. Use a wallet made for this: its key goes into a file.
2. Put its private key in the repo-root `.env` (never committed). `AMOY_RPC_URL` is optional; the default is Polygon's public endpoint, which is rate limited.
   ```
   DEPLOYER_KEY=0x…           # 0x followed by 64 hex characters
   AMOY_RPC_URL=https://…     # optional
   ```
3. Deploy:
   ```
   pnpm deploy:amoy
   ```
   It prints the two contract addresses with their explorer pages and writes them to `shared/deployments.json` under `amoy`, with `explorerUrl` and `links` to both contracts and both deployment transactions. **Commit that file** so the links travel with the repo.
4. To run Core against it: `CHAIN_NETWORK=amoy CHAIN_RPC=<your Amoy RPC> pnpm --filter @sammati/core start`. Proof responses (`/v1/proof/consent/...`, `/v1/proof/access/...`, the ledger explorer) then carry an `explorerUrl` pointing at Amoy's explorer. On the local chain that field is `null`, because there is no explorer to link to. `CHAIN_EXPLORER_URL` overrides the base.

Things to know:
- A wrong or missing `DEPLOYER_KEY`, an empty wallet and an unreachable RPC each stop the script with a message that says what to fix, before anything is sent.
- `pnpm seed` refuses to run on Amoy: it funds the relayer from Hardhat's publicly known admin key, which is fine locally and an open invitation on a public network. On Amoy the admin and relayer need their own funded keys.
- The Amoy path (network config, the deployment record with its links, the failure messages, Core's proof links) is covered by tests, but I could not run a real deployment from the environment this was written in (no network access and no funded wallet), so the first `pnpm deploy:amoy` is untested against the live network.

| Check | Command |
|---|---|
| Core is up | `curl localhost:4000/v1/health` |
| Web | http://localhost:5173 (`/company/<slug>`, `/auditor`, `/join`, `/portal/<slug>`) |
| Guarded endpoint | run the sample lender with a company's key (`docs/integration.md` §4), then `curl -H "x-sammati-principal: <customer address>" localhost:4310/customers/1/credit-profile`: `451 NO_CONSENT` before consent, `200` after, `451 NO_PRINCIPAL` without the header |
| Reset state | `DEV_TOOLS=true pnpm dev:reset` |
| Chain only | `pnpm deploy:local` and `pnpm seed` (funds the relayer) against a running node (`pnpm --filter @sammati/contracts node`); `pnpm --filter @sammati/contracts abi` re-exports the ABIs |
| Everything | `pnpm lint && pnpm typecheck && pnpm -r test` |
| The story, end to end | `pnpm e2e` (see above) |
| Wallet | `cd wallet && flutter analyze && flutter run` |

Useful for development:
- Signing test vectors for the Dart signer: `shared/test-vectors/eip712.json`.
- Set `CORE_PUBLIC_URL` (see `.env.example`) to the laptop's LAN IP so the QR code points the phone at Core.

Layout: `contracts/` `core/` `gateway/` `shared/` `processor/` (lane A), `wallet/` (B), `web/` `examples/` (C), specs in `docs/`.

## Problem statement (CB-04)
Build a consent manager where users grant, view and withdraw purpose-specific consent across several companies, every action is recorded on a tamper-evident ledger, and companies' systems check consent before using data.

## What we are building (3 connected products + 1 ledger)

| # | Product | Who uses it | Role in the story |
|---|---|---|---|
| 1 | **Sammati Wallet** (Flutter APK) | Citizen (Data Principal) | The hero. GPay-style app: scan, consent, withdraw, see who touched your data |
| 2 | **Sammati Gateway + Company Console** (SDK + web) | Companies (Data Fiduciaries) | The enforcement. Every data request is ALLOWED or BLOCKED in real time |
| 3 | **Sammati Auditor** (web) | Regulator (Data Protection Board) | The proof. Check the consent and access record and detect tampering without trusting the company |
| 4 | **ConsentRegistry + AccessAnchor** (Solidity) | Everyone | The shared source of truth |
| 5 | **Sammati Processor** (Node, port 4200) | Companies, via a decision API | Use without reading: the customer's data is encrypted on the phone, stored as ciphertext, opened only here, and a company gets a decision back. A simulated enclave in this build (`architecture.md` §5.5) |

No company is built in: any number of companies join through registration and the regulator's approval (R-01 to R-04), and one citizen wallet works with all of them. `examples/lender` is a sample company backend.

## Locked decisions

| Decision | Choice |
|---|---|
| Problem statement | CB-04 DPDP consent ledger |
| Hero | Citizen consent wallet, GPay-like feel |
| Supporting platforms | Enforcement gateway + company console; Regulator audit dashboard (live "who accessed my data" feed lives inside the wallet) |
| Wallet form factor | Native Flutter app, APK on a real phone |
| Chain setup | Local Hardhat chain for live demo + same contracts deployed to Polygon Amoy as public proof |
| Scope | Any number of approved companies sharing one user's wallet; nothing is built in (X-01) |
| Team / time | 3 people, ~24 hours, scope not reduced for time (see `tasks.md` for the golden path that protects the demo) |

## Documents

| File | Purpose |
|---|---|
| `prd.md` | What and why: personas, features with IDs (W, C, A, B, V, N, R), priorities, acceptance criteria |
| `architecture.md` | System design, trust model, data flows, why blockchain |
| `trd.md` | Stack, contract interface, EIP-712 types, APIs, events, deployment |
| `drd.md` | Data requirements: on-chain and off-chain schemas, hashing, what a fresh deployment holds, privacy rules |
| `ui.md` | Design system, every screen, copy, motion, i18n |
| `demo.md` | The 4-minute demo script, setup, fallbacks, judge Q&A, the two demo shortcuts |
| `tasks.md` | Work split for 3 people, 24-hour plan, cut lines, definition of done |
| `integration.md` | For a company joining Sammati: register, get a key, integrate in 5 lines, send a request, call the Processor |
| `dpdp-mapping.md` | DPDP obligations mapped to Sammati features with the evidence and an honest status; gaps and limitations; the claims review; and the VERIFY checklist for a human to check against the official Act and Rules. Wording is "aligned with the principles of", never "compliant" |
| `cleanup-audit.md` | What demo scaffolding was removed (X-01) and why, with each keep, delete or replace decision |
| `AGENTS.md` | Rules for AI coding tools working in this repo |

## Assumptions to confirm
1. **"DRD"** is interpreted as **Data Requirements Document**. If your team means Design Requirements, `ui.md` already covers it.
2. DPDP Act section numbers in these docs are from memory. **Verify them against the official Act and Rules text before they go on a slide.** `docs/dpdp-mapping.md` cites none: it lists every uncertain legal point as a numbered VERIFY item (its §7) for a human to check.
3. Product name, colours and fonts are proposals.

## Spec-driven workflow
1. Read `prd.md` for the feature ID you are building.
2. Follow `trd.md` and `drd.md` exactly for interfaces and schemas. If reality forces a change, update the spec first, then the code.
3. Build the **golden path** (see `tasks.md`) before any P1/P2 feature.
4. Every feature is done only when its acceptance criteria in `prd.md` pass.
