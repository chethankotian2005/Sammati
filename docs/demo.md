# Demo Plan — Sammati

## 1. The one sentence
"UPI made payments simple and trustworthy. Sammati does that for consent: one wallet, instant withdrawal that *actually blocks* data use, data the company never reads, and proof nobody can edit."

## 2. The walkthrough (about 5 minutes)

Everything here is done as a normal user or as the regulator, through the product's own screens. Nothing is fired from a control panel and nothing is pre-registered: the company, QuickLoan, registers first. `pnpm e2e` plays the same story with a headless wallet (44 steps, about 35 s of story, under a minute with the stack).

### Before the room fills (once)
1. `pnpm demo:up`. Open `/join`, register **QuickLoan** (purposes: a required `credit_check`, optional `marketing` and `bureau_share`, with a processor on `bureau_share`). Approve it as the regulator under Auditor > Registrations (promote it out of the sandbox, or add the phone's ID as a test customer). Copy the API key: it is shown once.
2. Start QuickLoan: `FIDUCIARY=<address> SAMMATI_API_KEY=<key> STAFF_USER=staff STAFF_PASSWORD=<choose> pnpm --filter @sammati/company-quickloan start`.
3. Optional second and third company: `node scripts/register-company.mjs companies/template/sites/carefirst.json` (and `tiffinbox.json`), and start each site with the command it prints.
4. Phone: install the app, create the account (name, mobile and so on stay on the phone), set a language.

### The user's story (a judge can follow this unaided)
| Step | What the user does | What happens |
|---|---|---|
| 1. Sign up | Open QuickLoan (`http://<laptop>:4101`), read the landing page, press **Apply now**. Type a username. | The form asks for nothing else: no name, PAN, income, phone or email |
| 2. Scan | Tick **Use my Sammati details for loan processing**. A QR appears with "Waiting for you in the Sammati app". Scan it with the wallet | The wallet shows each purpose with its data, retention and sharing flag. Required purposes are marked; optional ones start off |
| 3. Consent | Choose what to allow, pick an expiry, confirm with fingerprint or PIN | A receipt with the transaction. QuickLoan's page logs the user in as the username and shows consent status live. The wallet prompts for any missing detail, then sends only the fields the ticked purposes need, encrypted |
| 4. Loan | On the dashboard, choose amount and tenure, press **Apply** | A decision card: approved or declined, limit, rate, reasons. QuickLoan never saw the details |
| 5. Wallet activity | Open **Activity** in the wallet | Each use by QuickLoan, with ALLOWED or BLOCKED, and which data it used |
| 6. Withdraw | In the wallet, withdraw `credit_check` (two taps) | Apply on the QuickLoan page is disabled within two seconds: "Consent withdrawn. We can no longer process your application." The encrypted details are erased and the wallet says so |
| 7. Rights | In **Rights**, file an erasure request and a grievance | The company marks them in progress or resolved with a reply; the wallet shows an alert |
| 8. Notifications | Open **Alerts** | Expiry reminders, renewal requests, "data erased", processor acknowledgements, rights replies. To watch expiry live, switch on **Short expiry for testing** in Developer settings and grant 2 minutes: the reminder, the expiry, then QuickLoan's next call is blocked with `CONSENT_EXPIRED`; **Request renewal** from the console, **Renew** in the wallet, and it works again |
| 9. A company asks | From a company console, **Send to user** with the phone's Sammati ID | The request is in the phone's inbox in under two seconds. **Decline**, or **Block this company**: later requests never arrive |

### The back-office (shows that staff cannot read the data)
Open `http://<laptop>:4101/staff` and sign in. The applications list has username, amount, tenure and decision. A customer page says **Personal details: protected by Sammati** and shows only a handle and a ciphertext hash, plus consent status per purpose. There is no button that reveals or exports anything else.

### The regulator's view
1. **Auditor > Registrations**: the company's application, its purposes and processors, the approval and the sandbox switch.
2. **Scorecards**: grants, withdrawals, allowed and blocked, withdrawal-to-block latency, unacknowledged cascades. **Ledger explorer** lists the consent events with transactions.
3. **Verify** QuickLoan: all green.
4. In a terminal, `DEV_TOOLS=true pnpm dev:tamper -- quickloan 3` edits one stored log row (it prints the record). **Verify** again: red, naming the batch and the record. There is no button in any screen that can do this: the edit is made to the database file.

### Time cuts
Skip steps 7 and 9 first, then the optional extra companies. Never cut withdrawal-then-blocked, the back-office view, or tamper-then-Verify.

## 3. Rehearsal rules
- Run `pnpm e2e` before every rehearsal (it starts its own stack on the same ports: stop `demo:up` first).
- `DEV_TOOLS=true pnpm dev:reset` between runs, then register QuickLoan again (it starts empty by design).
- One person speaks, one drives the laptop (console, Auditor, terminal), one holds the phone.

## 4. Setup checklist
### Stage setup with the cloud deployment (preferred)

The system runs on Render, Vercel and Polygon Amoy (`trd.md` §10.1, runbook in `deploy-guide.md`), so the laptop needs only a browser and the phone only the APK. Do this the day before and again an hour before:
- [ ] `pnpm e2e:remote` passes against the deployed URLs (it creates a throwaway company; do not run it right before going on)
- [ ] `curl https://<core>/healthz`, `<processor>/healthz`, `<quickloan>/healthz` all say `ok`, and the first call after a quiet hour is not slow (open each once; Core can take a minute to wake if the keep-alive was off)
- [ ] The phone has the APK built by the `wallet-apk` workflow, an account, a Sammati ID, and **Me > Developer settings** shows the cloud Core URL (the default of that build)
- [ ] The QR code a company shows carries the cloud Core URL (`PUBLIC_CORE_URL`), not a laptop's
- [ ] The relayer and the admin have test MATIC; the regulator access code is at hand; QuickLoan is registered and approved
- [ ] The phone reaches Core on mobile data **and** on the venue Wi-Fi (try both)
- [ ] Browser tabs: QuickLoan, QuickLoan `/staff`, a company console (signed in), the Auditor (access code entered), the Amoy explorer. The tamper step needs `DEV_TOOLS` on a local database, so in the cloud it is the recorded run, or it is played on the local fallback below

### Local fallback (the old way, kept on purpose)

If the venue network blocks the cloud, or Render is down, run `pnpm demo:up` on the laptop as in the checklist below and, on the phone, open **Me > Developer settings** and set the Core address to the laptop's (`http://<lan-ip>:4000`); the same APK works. Setting it back to the cloud URL returns to the hosted system. The two stacks are separate worlds (different chains and databases): a consent made on one is not on the other, so choose one before the room fills and do not switch in the middle of a story. `DEV_TOOLS=true pnpm dev:tamper` works on the local stack only.

- [ ] Laptop on charger, `pnpm demo:up` running; QuickLoan registered, approved and started (above); the Processor answers: `curl http://<lan-ip>:4200/health` says `simulated-enclave`
- [ ] Phone on the same hotspot; the address `pnpm demo:up` prints in its banner is the laptop's address on that hotspot (set `PUBLIC_CORE_URL` if the laptop has two networks); the phone's Core address in Me > Developer settings matches
- [ ] The phone has an account, a Sammati ID, and (if QuickLoan is in the sandbox) is a regulator-added test customer
- [ ] Browser tabs: QuickLoan landing, QuickLoan `/staff`, a company console, Auditor, Amoy explorer; a terminal in the repo with `DEV_TOOLS=true`
- [ ] Screen recording of the full walkthrough saved locally; spare phone with the APK; Amoy addresses and explorer links verified the same day
- [ ] **Do not restart the Processor between rehearsal and stage without `pnpm dev:reset`**: its key is in memory, so old ciphertext answers `CIPHERTEXT_INVALID` until the phone sends again

### Delivery status of notifications (honest)
- **Built and tested in code:** the WebSocket path (foreground), the expiry scheduler, renewal requests, rights replies (`rights.updated`) and the Alerts tab. Core's tests and `pnpm e2e` cover them.
- **Not built:** Firebase push (needs a Firebase project and a real phone) and an Android foreground service that keeps the socket alive.
- **Not tested on a real phone with the screen off.** Nothing here claims background delivery. Local reminders for consents the phone already knows are scheduled on the device; that is the only thing expected to fire with the app closed, and it is untested on hardware.
- **Test companies** come from the real onboarding flow: `node scripts/register-company.mjs companies/template/sites/carefirst.json` and `.../tiffinbox.json`, then start each site with the command it prints. Nothing is written to a database by hand.

### What the phone can and cannot do with the app closed (say it if asked)
- **Reminders for consents the phone already knows** (3 days and 1 day before expiry, and at expiry) are scheduled on the phone, so they fire with the app closed.
- **Everything a company sends** (a renewal request, "your data was erased", a processor's confirmation) reaches the phone over the live connection. So **the app must be open, or the phone awake with the app still running**. Anything missed waits on the Alerts tab.
- **Push to a closed app (Firebase) is not built.** Local notifications have **not been tested on a real phone** yet. Do not claim background push; see `RELEASE_CHECKLIST.md` for the test that would change that.

### The profile on the phone (W-15 to W-17), if asked
- "Where are my details?" Only on the phone, encrypted, opened by your fingerprint or PIN. Sammati's servers never get them; a company gets a decision, and only the fields a purpose needs, sealed for the Processor.
- "What if I lose the phone?" There is no recovery in this build, and the app says so on its About screen. The production path is an encrypted backup the customer holds and a recovery flow (`architecture.md` §5.9). Say it plainly; do not improvise a feature.
- "Show me you don't have it." `pnpm e2e` submits a profile of distinctive values and searches every database, log and event of the run for them.

### Demo shortcuts
"Demo shortcuts" means exactly two things, and nothing else in the product is staged:
1. **Company and processor keys are held by Core**, including those of a company that joins through registration. In production each company holds its own keys.
2. **The Sammati Processor is a simulated sealed service**: an ordinary process with an in-memory key, until it runs in a TEE with remote attestation.

Separately, and as limits of this build rather than shortcuts: the regulator's access code is a shared secret, the company console has no login, the sandbox is enforced by Core and not by the contracts, and the wallet takes the Processor's public key on trust over the venue network.

### Honest limitations (say them before you are asked)
- **The Processor is a simulated sealed service**: an ordinary process with its key in memory. Whoever runs that machine could read its memory. Production: a TEE with remote attestation (`architecture.md` §5.5).
- **Core holds company and processor keys** in this build, including for companies that join through registration. Production: each company holds its own.
- **There is no account recovery.** Lose the phone and the profile and the key are gone; the app says so. The production path is an encrypted backup the customer holds (`architecture.md` §5.9).
- **The chain is a local Hardhat node.** The same contracts are deployed to Polygon Amoy as public proof; the live run does not depend on it.
- **Background notifications are not built or tested on hardware**: no Firebase push, no foreground service (see above).
- **Sign-in with Sammati ("Confirm in Sammati")** at QuickLoan is specified (`trd.md` §6.14), not built. The rights inbox in the back-office stays empty until Core passes rights requests to companies.
- The regulator's access code is a shared secret, the company console and QuickLoan's back-office use simple shared credentials, the sandbox is enforced by Core and not by the contracts, and the wallet takes the Processor's public key on trust over the venue network.
- Not legal advice, not a registered consent manager: `dpdp-mapping.md` lists what is unchecked.

## 5. Failure plan

| If this breaks | Do this |
|---|---|
| Phone cannot reach the laptop | Switch hotspot, or use the spare phone; if still down, use the emulator on the laptop |
| Camera will not scan | Use Act 6's path instead: **Send to user** to the phone's Sammati ID, then **Review** on the phone |
| Chain stalls | `pnpm dev:reset` and re-register the company; if no time, play the recorded demo and narrate |
| Biometric fails | Fall back to PIN (built in) |
| Venue network is down or the stack will not start | Play the screen recording and say it is a recording |
| "Share your details securely" fails or **Apply** answers an error | Check the Processor's `/health`; if its key changed, send the details again from the phone, then press **Apply** again. If it is still broken, play the recording of Act 4: it is a hero moment, do not drop it silently |
| A targeted request does not arrive | Pull down in the phone's inbox; check the phone's Core address in Me → Developer settings. Skip Act 6 |
| The 2-minute consent has not expired yet | Skip Act 7, or wait for the next Q&A question and come back |
| `pnpm dev:tamper` says the row does not exist | List the company's records in the Auditor's ledger explorer and use a `seq` that is shown there |
| Projector or mirroring fails | Show the phone to the judges directly and keep the console on the projector |
| Anything unexplained | Say "let me show you the recording of this step", never debug live in front of judges |

## 6. Pitch deck (6 slides, optional but short)
1. Problem: consent is a checkbox nobody controls
2. The DPDP moment: the law now requires purpose-specific, withdrawable consent and proof
3. Sammati: wallet, gateway, processor, auditor, ledger (the architecture picture, simplified)
4. Live demo
5. Why this is real: Account Aggregator-style consent layer, production path, who pays (companies pay per verified check, citizens free)
6. Team and what we built in 24 hours

## 7. Judge Q&A

**"Where does the loan decision actually happen? Is that a real secure enclave?"** No, and we say so on the About screen. The Processor is a separate service with an in-memory key: simulated sealed processing. What is real: the phone encrypts only the fields a purpose needs, the Processor checks consent on the ledger before it opens anything, it answers decision, limit, rate and reason codes, and the use is written to the anchored log with the categories it read. The production path is a TEE with remote attestation, so even the operator cannot read the data.

**"How do I know which of my data was used?"** Open the Activity row: it names the categories, shows where the ciphertext sits (its hash), says the Processor kept nothing and sent back a decision only, and links to the Merkle proof.

**Why blockchain, not a database?**
"Consent is a dispute between a user and a company, so the company cannot hold the evidence. A user-signed, shared ledger means neither side, and no single company, can rewrite history. A normal database gives you a log. This gives you a log that the audited party doesn't control."

**What about the right to erasure and immutability?**
"No personal data is on chain, only pseudonymous addresses, hashes and statuses. Erasure happens in the company's systems and the Processor's vault, and is tracked as a rights request. The chain proves consent history, it does not store the person."

**What if a company just bypasses your gateway?**
"We split it into prevention and detection. Honest companies are enforced in real time. A company that bypasses the gateway shows up in the audit: data use without an anchored access record, or anchored access without valid consent at that moment. And the user's wallet has the signed receipts."

**Is the Processor really an enclave?**
"No, and we say so on screen. It is a separate process that is the only place the ciphertext is opened, with the key held only there, and the company, its database and the network never see plaintext, which `pnpm e2e` checks by searching every response, event, log line and database file for the PAN. A real deployment would run it inside a hardware enclave with remote attestation. We simulated that boundary, we did not build the hardware."

**Can a company find out who has an account by asking for IDs?**
"No. A request to an ID that exists, one that does not, a company the customer blocked and a customer at the limit all get the same answer, and only a real, unblocked one reaches the phone. The company sees an opaque request id and a status. It learns a customer's address only after that customer consents. What we do not prevent: a company that can observe the customer in person can still ask them."

**Do you push to a closed app?**
"Not yet. Reminders for consents the phone already knows are scheduled on the phone, so those fire with the app closed. Messages a company sends reach the phone while the app is running; anything missed is on the Alerts tab. Closed-app push needs Firebase, which we did not build, and we have not tested the phone notifications on a real device."

**Who pays gas, and does it scale?**
"The user never pays. A relayer submits signed messages. Only hashes are written, and access logs are batched into one Merkle root, so thousands of events cost one transaction. In production this runs on a consortium or L2 chain."

**What if the user loses the phone?**
"In this prototype, device key plus biometric. In production, social or Aadhaar-linked recovery with the same on-chain identity. We chose not to show seed phrases to normal users."

**How is this different from existing consent managers or cookie banners?**
"Cookie banners record a click on the company's own server. We have purpose-level, user-signed consent, enforced in the company's code path, with independent proof, with the sensitive data never readable by the company."

**Is this legally compliant?**
"We don't claim that. Sammati is aligned with the principles of the Act: an itemised notice, a separate choice per purpose with nothing pre-ticked, withdrawal in two taps, erasure of the sealed copy on withdrawal, and a record anyone can check. We have not had it legally reviewed, we are not a registered consent manager, and every point we have not checked against the official text is marked VERIFY in our mapping, `docs/dpdp-mapping.md`. The mapping also lists what we have not built: breach notification, children's data, correction and nomination. And the data you see is made up."

**Is the data real?**
"No. Use made-up details in the prototype. The consent flow, signatures, enforcement and anchoring are real and running."

**Who stops a bad company from joining?**
"The regulator. Anyone can apply, and nothing exists for them until the regulator approves: no company id, no key, no way to ask a customer for consent. After approval a company starts in a sandbox where it can only reach test customers, until the regulator promotes it. In this build the review is a human decision: we do not verify licences. Production would tie this to the regulator's own registry."

**Can a company use someone else's key?**
"A key belongs to one company and is refused for any other company's id. We store only a hash of it and show it once. Each company is rate limited. Without a valid key the gateway fails closed: no key, no consent check, no data."

**Be honest about the demo shortcuts.**
"Two. Our core service holds the keys of companies and of their processors, including a company that joins through the registration page. In production each company holds its own. And the Sammati Processor is a simulated sealed service: a separate process with its key in memory, not real hardware protection. Beyond those: the regulator's access code is a shared secret, the company console has no login, and the sandbox is enforced by our core service, not by the contracts. The wallet also takes the Processor's public key on trust over plain HTTP on the venue network."

**Can you edit the log and hide it?**
"The tamper step is an edit made straight to the database file by a developer command, because that is what a malicious insider would do. There is no button, endpoint or screen in the product that can edit a log or reset state. The regulator's check recomputes the hash chain and the Merkle roots and compares them with the on-chain anchors, so an edit shows up as a mismatch at the exact record."

**Who can read the data?**
"The customer, on their phone, and the Processor, for the second it takes to compute a decision. The company's staff, its database, our core service, the auditor and anyone holding a copy of any database see ciphertext or a reference number. Our core never receives the encrypted data at all and has no key. There is no endpoint that returns plaintext, and we test for that: our end-to-end run searches every log, event, response and database file for the PAN it submitted."

**Is the Processor trusted?**
"In this build, yes, and we say so: it is a separate service with an in-memory key, a simulated sealed service. Someone who controls that machine could read its memory. The production design runs it in a hardware enclave, like AWS Nitro Enclaves or Intel SGX, with remote attestation: the enclave proves which code it runs, the phone encrypts only to a key the hardware vouches for, and then even the operator cannot read the data. What is real today is the flow: encrypted on the phone, stored as ciphertext, opened in one place, consent checked on chain every time, every use in the anchored log."

**What stops the company from calling the Processor for another purpose?**
"Three things. The envelope is bound to one customer, one company and one purpose, so it will not open for another. Every call is checked against the chain for the purpose it names: ask for marketing with a credit-check handle and the answer is 451 no consent. And every call, allowed or blocked, is an entry in the company's hash-chained log that is anchored on chain. Misuse leaves a record that the regulator can verify and the company cannot edit."

**What happens on withdrawal?**
"The company's next request gets a 451 with a reason. And the Processor erases the encrypted copy: it sees the withdrawal, and re-checks on every call and on a timer. So the data is gone, not just locked. The chain keeps the proof that consent existed and was withdrawn, not the data."

**So the company can't even see my income. How does it lend?**
"It gets the answer to the question it is allowed to ask: approved or declined, and a limit. The decision does reveal something, like a score band. That is the data minimisation: the company receives the output, not the inputs."

**Who can read the data?**
"The customer, on their phone, and the Processor, for the moment it takes to compute a decision. QuickLoan, its staff and its database, Sammati's core service, the auditor and anyone holding a copy of any database see a handle, a hash or a decision, never the details. `pnpm e2e` submits a profile of distinctive values and searches every response, event, log and database file of the run for them."

**What does the consent manager see?**
"Consent records and access metadata: a pseudonymous address, which purpose, allowed or blocked, and when. It does not receive the encrypted details and holds no key to open them. The company-side name stays in the company's own system."

**What happens on withdrawal?**
"Two taps in the wallet. The company's very next request is blocked with a reason, the QuickLoan page disables Apply within two seconds, the downstream processors are told and confirm on chain, and the Processor erases the encrypted copy. Decisions already made stay on file; the details behind them are gone."

**Why a ledger?**
"Consent is a dispute between a person and a company, so the company cannot be the one holding the evidence. A user-signed ledger that the company does not control means nobody can quietly rewrite a withdrawal or backdate a grant, and the regulator can check the company's own access log against anchors the company cannot edit. Only hashes and statuses are on the chain."

**How does a new company join?**
"It applies at the join page with its purposes and processors. The regulator reviews and approves; nothing exists for the company until then. It starts in a sandbox where it can only reach regulator-designated test customers, gets one API key shown once, and integrates with five lines of the SDK. The regulator can promote it. In this build the review is a human decision; we do not verify licences."

## 8. Lines worth repeating
- "Withdraw is not a setting, it's a switch that cuts the pipe."
- "Not one big 'I agree'. One decision per purpose."
- "The regulator verifies. The regulator doesn't have to trust."
