# Deploy guide: Render, Vercel and GitHub Actions

Runbook for hosting Sammati in the cloud without changing what it does. The contract between the pieces is `trd.md` §10 (variables, endpoints, boot order, persistence); the picture and the failure modes are `architecture.md` §9. Nothing here has been run on a real Render, Vercel or GitHub account from this repository: §7 lists exactly what to check the first time.

## 1. What you deploy

| Piece | Host | Config |
|---|---|---|
| Core | Render web service `sammati-core`, Singapore, disk 1 GB at `/var/data` | `render.yaml` |
| Processor | Render web service `sammati-processor`, Singapore, disk 1 GB at `/var/data` | `render.yaml` |
| QuickLoan | Render web service `sammati-quickloan`, Singapore, disk 1 GB at `/var/data` | `render.yaml` |
| Second company site | Render web service `sammati-company2` (no disk) | `render.yaml` |
| Web | Vercel project rooted at `web/` | `web/vercel.json` |
| Wallet | APK built by GitHub Actions | `.github/workflows/wallet-apk.yml` |
| Keep-alive | GitHub Actions schedule | `.github/workflows/keepalive.yml` |
| Chain | Polygon Amoy | `pnpm deploy:amoy`, `shared/deployments.json` |

Render disks need a paid instance type (the blueprint asks for `starter`); `sammati-company2` holds no data and can be `free`. A service with a disk runs exactly one instance and is restarted, not rolled, on each deploy.

## 2. Keys and accounts (once)

Generate every secret yourself. Do not reuse a key from this repository: the Hardhat keys are public.

```
node -e "const {Wallet,randomBytes,hexlify}=require('ethers');for(const n of ['DEPLOYER_KEY','ADMIN_KEY','RELAYER_KEY'])console.log(n,Wallet.createRandom().privateKey);console.log('PROCESSOR_KEY',hexlify(randomBytes(32)));console.log('PROCESSOR_EVENT_KEY',hexlify(randomBytes(24)));console.log('REGULATOR_KEY',hexlify(randomBytes(16)))"
```
(run it inside `core/` so `ethers` resolves). Then:

1. Fund `DEPLOYER_KEY`, `ADMIN_KEY` and `RELAYER_KEY` with Amoy test MATIC from a faucet. The admin pays the companies' registration and funding (`REGISTRATION_FUNDING_ETH`, 0.05 in the blueprint, and a tenth of that for each of their processors), the relayer pays every grant and withdrawal.
2. Deploy the contracts: put `DEPLOYER_KEY` and your RPC URL in the repo-root `.env` (`AMOY_RPC_URL`), run `pnpm deploy:amoy`, and **commit `shared/deployments.json`** (the `amoy` entry). Core and the Processor read it from the repository at start. The admin that registers companies must be the account the contracts were deployed with, so deploy with the same key you will use as `ADMIN_KEY` (set `DEPLOYER_KEY` to it).
3. Store **`PROCESSOR_KEY` in a password manager now.** It is the only copy that matters: if it is lost, every stored ciphertext is unreadable (`drd.md` §6).

## 3. Render

1. Push the repository to GitHub. In Render choose **New > Blueprint** and select the repository; it reads `render.yaml`.
2. Render asks for every variable marked `sync: false`. Fill them from the table below. Public URLs are known once the services exist: create them with a placeholder, then edit. The order that avoids a restart loop: Core and the Processor first (they have no company), companies after step 5.

| Service | Variable | Value |
|---|---|---|
| core | `PUBLIC_CORE_URL` | `https://sammati-core.onrender.com` (your service URL) |
| core | `PROCESSOR_PUBLIC_URL` | the Processor's URL |
| core | `CHAIN_RPC` | your provider's Amoy RPC URL |
| core | `RELAYER_KEY`, `ADMIN_KEY`, `REGULATOR_KEY`, `PROCESSOR_EVENT_KEY` | from §2 |
| core | `CORS_ORIGINS` | the Vercel URL(s), comma separated, no trailing slash |
| processor | `PROCESSOR_KEY`, `PROCESSOR_EVENT_KEY` (same as Core's), `CORE_URL`, `CHAIN_RPC`, `CORS_ORIGINS` | as above |
| quickloan | `CORE_URL`, `PROCESSOR_URL`, `QUICKLOAN_PUBLIC_URL`, `FIDUCIARY`, `SAMMATI_API_KEY`, `STAFF_USER`, `STAFF_PASSWORD` | `FIDUCIARY` and the key come from step 5 |
| company2 | `CORE_URL`, `FIDUCIARY`, `SAMMATI_API_KEY` | from step 5 |

   Already set by the blueprint (change only with a reason): `NODE_ENV=production`, `CHAIN_NETWORK=amoy`, `DB_PATH`, `VAULT_PATH`, `QUICKLOAN_DB`, `INDEXER_INTERVAL_MS=4000`, `RECEIPT_POLL_MS=2000`, `REGISTRATION_FUNDING_ETH=0.05`, `NODE_VERSION`.
3. Wait for Core and the Processor to go live (the health check is `/healthz`). Open `https://<core>/readyz`: it must say `{"ready":true}` (it checks the database and the chain). If it says 503 read §6.
4. Create the company: a company applies at `<web>/join`, the regulator (you) approves it in the Auditor with `REGULATOR_KEY`, and the applicant reads the API key **once** on the status page. The script `node scripts/register-company.mjs <site file>` does the same from a terminal (`CORE_URL` and `REGULATOR_KEY` in the environment).
5. Put that company's address and key into `FIDUCIARY` and `SAMMATI_API_KEY` of `sammati-quickloan` (or `sammati-company2`) and let it deploy.

Never set `DEV_TOOLS` on Render: the services refuse to start with it in production.

## 4. Vercel

1. Import the repository; set the **Root Directory** to `web`. Install command `pnpm install --frozen-lockfile` at the repository root is detected from the workspace; build command `pnpm build`, output `dist`.
2. Environment variable (build time): `VITE_CORE_URL=https://<core>`. The build fails without it, on purpose. Optional: `VITE_LENDER_URL` for the customer portal's sample company.
3. `web/vercel.json` rewrites every path to `/index.html` so `/auditor`, `/company/<slug>` and `/join` work on reload.
4. Add the resulting origin to `CORS_ORIGINS` on Core and the Processor and redeploy them.

## 5. GitHub Actions

Repository **Settings > Secrets and variables > Actions**:

| Name | Kind | Used by |
|---|---|---|
| `CORE_URL` | variable | `wallet-apk` (`--dart-define=CORE_URL`) and `keepalive` |
| `KEEPALIVE_URLS` | variable | `keepalive`: space-separated base URLs (Core, Processor, QuickLoan, company2); defaults to `CORE_URL` |

`wallet-apk.yml` runs on a manual dispatch (and on a `wallet-v*` tag): `flutter pub get`, `flutter test`, `flutter build apk --release --dart-define=CORE_URL=<CORE_URL>`, and uploads `app-release.apk` as an artifact. The APK is signed with the debug key unless you add a keystore (not done here): it installs by side-loading, which is enough for a demo, not for the Play Store. `keepalive.yml` calls `GET /healthz` of each URL every 10 minutes; GitHub schedules are best effort and are paused after 60 days without repository activity.

## 6. Troubleshooting

| Symptom | Cause and fix |
|---|---|
| Deploy fails, log says `Missing or unusable environment variables: …` | Production validates at start (`trd.md` §10.2). Set the named variables; a value equal to a published default or an `http://` public URL is rejected on purpose |
| Deploy stays "in progress", then fails the health check | The service did not bind `$PORT`. Check the log for a crash before `listening`; `/healthz` does not need the chain, so a failing health check is a boot crash |
| `/healthz` ok but everything else 503 `STARTING` | Core is still connecting to the chain. Look at `/readyz` and the log line "Waiting for the chain": bad `CHAIN_RPC`, wrong `CHAIN_NETWORK`, or a missing `amoy` entry in `shared/deployments.json` |
| Core exits with `CHAIN_MISMATCH` | The database describes a different chain from the one the RPC reports. Either the RPC is wrong (fix `CHAIN_RPC`) or you redeployed the contracts: production never wipes by itself. If you meant to start over, delete the disk's `sammati.sqlite*` files (Render shell) and restart: every company must register again |
| RPC errors `429`, `Too Many Requests`, indexer "failed" warnings | Raise `INDEXER_INTERVAL_MS` and `RECEIPT_POLL_MS`, or use a paid RPC plan. Core backs off by itself and nothing is lost |
| Grants fail `LEDGER_UNAVAILABLE` or `CHAIN_ERROR` | Relayer out of MATIC, or fees too low for Amoy: set `GAS_PRIORITY_FEE_GWEI` (Amoy needs 25 or more) |
| Browser: CORS error | The web's origin is not in `CORS_ORIGINS` (exact origin, scheme included, no trailing slash) |
| Web page blank or "Core unreachable" | `VITE_CORE_URL` was wrong at build time: fix and redeploy (it is baked in) |
| WebSocket reconnects every minute | Something between the client and Core closes idle connections: Core pings every 25 s, so check that a proxy in front is not stripping pings |
| Wallet scans a QR but cannot reach Core | `PUBLIC_CORE_URL` is not the public https URL of Core, or the phone is on a captive network |
| Processor answers `CIPHERTEXT_INVALID` after a redeploy | `PROCESSOR_KEY` changed or was lost. Restore the original; otherwise customers submit again |
| Processor refuses to start: `PROCESSOR_KEY is required in production` | By design; set it, never expect it to generate one |
| QuickLoan or company2 gate answers `451 LEDGER_UNAVAILABLE` with "Sammati rejected this company's API key" | `FIDUCIARY` or `SAMMATI_API_KEY` is wrong, or the regulator reissued the key |
| First request after quiet time is slow | The instance slept. Enable the `keepalive` workflow or use an instance type that does not sleep |

Rollback: redeploy a previous commit from Render's **Deploys** list (the disk is kept). A migration only adds, so an older build still reads a newer database.

## 7. What could not be verified without real accounts

These steps were written from the platforms' documentation and covered by local tests of the code they touch, but have not been run end to end:
1. Applying `render.yaml` as a blueprint (field names, the `starter` plan with disks, the Singapore region name `singapore`).
2. Disk attach and persistence across a real Render deploy (the restart test runs locally: `core/test/restart.test.ts`).
3. Render's health-check promotion on `/healthz`, and the WebSocket idle behaviour behind its proxy (the 25 s ping is based on the documented idle timeout).
4. Vercel's build of the `web` workspace with a monorepo root and the SPA rewrite.
5. The APK workflow run (Flutter version on the runner, the build time) and installing the unsigned-by-you APK on a phone.
6. The Amoy deployment itself, the fee defaults and the RPC provider's limits (`README.md` already notes the first `pnpm deploy:amoy` is untested against the live network).
7. `pnpm e2e:remote` against the real URLs.
Tick each in `RELEASE_CHECKLIST.md` §0 only when you saw it work.
