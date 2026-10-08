# Sammati — Spec Pack (Hackatopia 2026 · CB-04)

> **Sammati** (सम्मति, "consent") is a placeholder name. Rename freely.
> **One-liner:** UPI for consent. A citizen wallet that gives, manages and withdraws consent across companies, backed by a ledger and an enforcement layer that makes withdrawal actually stop data access.

## Run it

Needs Node 20+, pnpm 9 (`npm i -g pnpm@9`) and, for the wallet, Flutter 3.x.

```
pnpm install
pnpm demo:up        # chain :8545 (deployed + seeded), Core :4000, Processor :4200, QuickLoan :4101, MediCare+ :4102, FoodRush :4103, web :5173
```

`demo:up` starts a fresh Hardhat node, deploys `ConsentRegistry` and `AccessAnchor`, registers the three companies with their purposes and processors, and funds the relayer. Addresses land in `shared/deployments.json`; ABIs are in `shared/abi/`. Core runs in **real mode** (`docs/trd.md` §6.6): the same routes as the stub, backed by SQLite, the chain and a relayer wallet.

**What it prints first matters for the phone.** The QR code tells the wallet which address to fetch the consent notice from, and `localhost` would be the phone itself. So `demo:up` detects the laptop's LAN address and prints it in a banner, e.g. `http://192.168.1.23:4000`. If the laptop is on two networks (its Wi-Fi and the hotspot the phone joined) the banner lists every address: pick the phone's network by setting `CORE_PUBLIC_URL=http://<that address>:4000` in the environment or `.env`, which always wins over detection.

**Reset between runs with `pnpm demo:reset`.** It resets Core's database, then the chain, redeploys, reseeds, and resets Core again, in that order on purpose (see the comment at the top of `scripts/demo-reset.mjs`). Core also keeps a record of which chain its database describes and wipes itself if it is started against a different one, and `demo:up` clears the old database file, so a restart can never mix one run's log with another run's chain. The chain's clock is put back on the wall clock after every reset and at start.

To build a client without a chain, `pnpm demo:up:stub` serves every route in `docs/trd.md` §6 from `core/fixtures/*.json` with light in-memory state. (`pnpm demo:up:real` is an alias of `demo:up`.)

Real mode needs nothing but the chain (config in `.env.example`, all optional). What it does not build yet answers `501 NOT_IMPLEMENTED`: console purpose/processor registration (the seed registers them).
The tamper demo, in real mode (every 10 s, or after 20 entries, Core anchors each company's access log on chain):

```
POST /v1/demo/fire            # run a few requests through a company's gateway
POST /v1/demo/anchor          # anchor them now instead of at the next 10 s tick
POST /v1/audit/verify/<fid>   # ok: true, every batch matches its on-chain root
POST /v1/demo/tamper/<fid>    # edits one stored log row
POST /v1/audit/verify/<fid>   # ok: false, firstMismatch names the exact record
```

### `pnpm e2e`: the whole story, in under 30 s

```
pnpm e2e            # starts the stack itself if none is running, and stops it afterwards
```

It plays the demo once, against real services: reset → a company creates a consent request → the user signs and the relayer grants it on chain → a request is **ALLOWED** → a purpose never consented to is **BLOCKED** → the user withdraws → the same request is **BLOCKED** → the downstream processor acknowledges on chain → verify the log against the chain (**clean**) → tamper with one stored row → verify again (**mismatch pinpointed** to that record). It also checks the live WebSocket feeds saw each step. It then plays the confidential-processing acts (`docs/prd.md` V-01 to V-06): the profile is sealed and sent to the Processor, QuickLoan's admin view shows a handle and a hash only, an apply returns a decision, a withdrawal makes the next apply a 451 and erases the vault entry, and every response, event, log line and database file of the run is searched for the demo PAN. It prints each step with its time and exits non-zero, naming the step, if anything is off.

- With `pnpm demo:up` already running it reuses that stack and resets it first (about 6 s); with nothing running it starts one (about 12 s more). The 30 s budget (`E2E_BUDGET_MS`) covers the story, not starting the stack. A typical run takes 8 to 10 s.
- It refuses a Core in stub mode, and `--no-start` makes it fail instead of starting a stack.
- It ends with the QuickLoan log deliberately tampered with, so run `pnpm demo:reset` before rehearsing.
- Set `E2E_CORE_URL` to point it at another Core.

### Customer portal (`/portal/quickloan`)

QuickLoan's customer page for the demo: sign in with a name, tick the consent box, scan the QR with the wallet, share the details in the wallet, Apply, see the decision, withdraw and watch Apply stop (`docs/ui.md` §3.1, `docs/trd.md` §6.10). The page never receives or shows a PAN or an income.

### Data Flow Inspector (`/stage/flow`)

`http://localhost:5173/stage/flow` shows, from real events and real answers, the customer's data going in encrypted, what QuickLoan's staff and database can reach (ciphertext only) and the sealed Processor deciding (`docs/ui.md` §5.1). `/stage` has the same screen as a **Data flow** panel. With no stack running, `/stage/flow?replay=1` plays `web/public/flow-replay.json`, a recording of a real run; regenerate it with `E2E_RECORD_FLOW=web/public/flow-replay.json pnpm e2e`.

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
4. To run Core against it: `CHAIN_NETWORK=amoy CHAIN_RPC=<your Amoy RPC> STUB_MODE=false pnpm --filter @sammati/core start`. Proof responses (`/v1/proof/consent/...`, `/v1/proof/access/...`, the ledger explorer) then carry an `explorerUrl` pointing at Amoy's explorer. On the local chain that field is `null`, because there is no explorer to link to. `CHAIN_EXPLORER_URL` overrides the base.

Things to know:
- A wrong or missing `DEPLOYER_KEY`, an empty wallet and an unreachable RPC each stop the script with a message that says what to fix, before anything is sent.
- `pnpm seed` refuses to run on Amoy: it registers the demo companies with Hardhat's publicly known keys, which is fine locally and an open invitation on a public network. Companies on Amoy need their own funded keys.
- The Amoy path (network config, the deployment record with its links, the failure messages, Core's proof links) is covered by tests, but I could not run a real deployment from the environment this was written in (no network access and no funded wallet), so the first `pnpm deploy:amoy` is untested against the live network.

| Check | Command |
|---|---|
| Core is up | `curl localhost:4000/v1/health` |
| Web | http://localhost:5173 (`/company/quickloan`, `/auditor`, `/stage`) |
| Guarded endpoint | `curl -H "x-sammati-principal: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" localhost:4101/customers/1/credit-profile` returns data; without the header, `451 NO_PRINCIPAL` |
| Reset state | `pnpm demo:reset` (wipes the chain, redeploys, reseeds, resets Core) |
| Chain only | `pnpm deploy:local` and `pnpm seed` against a running node (`pnpm --filter @sammati/contracts node`); `pnpm --filter @sammati/contracts abi` re-exports the ABIs |
| Everything | `pnpm lint && pnpm typecheck && pnpm -r test` |
| The demo story, end to end | `pnpm e2e` (see below) |
| Wallet | `cd wallet && flutter analyze && flutter run` |

Useful for stub development:
- A ready-made consent request exists at `GET /v1/requests/req_demo_quickloan?principal=0x…`.
- `POST /v1/demo/tamper/:fid` then `POST /v1/audit/verify/:fid` shows the tamper alarm; `pnpm demo:reset` clears it.
- Signing test vectors for the Dart signer: `shared/test-vectors/eip712.json`.
- Set `CORE_PUBLIC_URL` (see `.env.example`) to the laptop's LAN IP so the QR code points the phone at Core.

Layout: `contracts/` `core/` `gateway/` `shared/` `processor/` (lane A), `wallet/` (B), `web/` `companies/` (C), specs in `docs/`.

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
| `prd.md` | What and why: personas, features with IDs (W, C, A, B, V), priorities, acceptance criteria |
| `architecture.md` | System design, trust model, data flows, why blockchain |
| `trd.md` | Stack, contract interface, EIP-712 types, APIs, events, deployment |
| `drd.md` | Data requirements: on-chain and off-chain schemas, hashing, seed data, privacy rules |
| `ui.md` | Design system, every screen, copy, motion, i18n |
| `demo.md` | The 4-minute demo script, stage setup, fallbacks, judge Q&A |
| `tasks.md` | Work split for 3 people, 24-hour plan, cut lines, definition of done |
| `dpdp-mapping.md` | DPDP obligations mapped to Sammati features with the evidence and an honest status; gaps and limitations; the claims review; and the VERIFY checklist for a human to check against the official Act and Rules. Wording is "aligned with the principles of", never "compliant" |
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
