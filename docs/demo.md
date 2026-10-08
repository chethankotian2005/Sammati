# Demo Plan — Sammati

## 1. The one sentence
"UPI made payments simple and trustworthy. Sammati does that for consent: one wallet, instant withdrawal that *actually blocks* data use, and proof nobody can edit."

## 2. Structure (4 minutes)

| Time | Act | What judges see | What you say |
|---|---|---|---|
| 0:00 | **Hook** | Title slide: "You have said yes to 40 apps. Do you know what you said yes to?" | 15 seconds on the problem and DPDP. Name the three roles |
| 0:15 | **Act 1: Connect** (in person: QR; or remote: the console's **Send to user** to `asha@sammati`, which lands in the wallet's inbox in under two seconds, a good alternative if the camera misbehaves) | The **QuickLoan customer portal** (`/portal/quickloan`): sign in as Asha, tick "Allow QuickLoan to use my data for loan purposes", the QR appears on the page. Phone scans, notice appears with three purposes | "Not one big 'I agree'. Each purpose is its own choice, in my language." Switch language to Kannada for a second |
| 0:45 | **Act 2: Consent** | Asha turns on credit check and marketing, leaves bureau sharing off. Biometric, receipt with tx. The portal turns to "Consent received" and shows the fields as "Provided securely in your Sammati app" | "I signed this with my key. The company cannot forge it." |
| 1:05 | **Act 3: Allowed** | Simulator: "Run credit check" is ALLOWED and returns only a reference (`status: none` until the phone sends something), never customer data; green ALLOWED appears on console and in the wallet feed together | "The gateway checked the ledger before releasing a single byte." Click "Share with bureau": BLOCKED (never consented) |
| 1:30 | **Act 3b: Use without reading** | Stage view, **Data flow** panel. Phone: the receipt's **Share your details securely** (or **Send securely** on the pass), **Use demo details**, confirm. The portal shows "Data submitted securely", then **Apply** there returns the decision card. Four lanes fill from real events: the phone's own fields in plain text, then the ciphertext in transit (hash, size, algorithm), then **Run loan decision**: the sealed Processor goes Decrypting, Scoring, Decision, Approved. Click **Try to view customer data** in the QuickLoan lane: only a ciphertext hash and "Not authorised to read content". Click **Try to read database**: the raw ciphertext. The privacy line appears: "No plaintext was visible to QuickLoan or any third party" | "My PAN and income were encrypted on my phone. QuickLoan's staff, their database, anyone on the network: ciphertext. Only the sealed processor opens it, for a second, and returns a decision." Say once: "The processor is a simulated enclave: the honest limit is in Q&A." If the venue is offline, press **Replay**: the chip says it is a recording, and you say so |
| 2:10 | **Act 4: The moment** | Phone: withdraw marketing. Console: "Send marketing SMS" turns **BLOCKED 451**. Cascade list on phone fills in: AdPartnerQ acknowledged. Then withdraw credit check (on the phone; or the presenter's **Withdraw and re-run** if the demo customer is used): the Data flow panel shows Blocked and "Ciphertext erased", and the phone says "Your encrypted details were erased." | "Withdraw is two taps. The very next request is blocked. The partner was told and confirmed. And the data we gave for the loan check? Not just blocked. Erased." Pause. Let the red row land |
| 2:50 | **Act 5: Three companies, one wallet** (10 s; cut first if running late) | Home screen shows QuickLoan, MediCare+, FoodRush. Withdraw `ad_targeting` at FoodRush only, others keep working | "One wallet, every company, per-purpose control." |
| 3:00 | **Act 6: Proof** | Auditor: Verify QuickLoan, all green (the loan decision is in the log too). Presenter clicks hidden **Tamper** control on one record, Verify again: **red mismatch in batch 4, record 63** | "A company edits its own log to hide an access. The regulator catches it without trusting the company." |
| 3:30 | **Act 6b: A fourth company joins** (R-01 to R-03; optional, 30 s, the first to cut when late) | Second screen, `/join`: **DemoBank** is already filled in; press **Send for review**. Auditor > **Registrations** > **Approve** (sandbox on). The status page shows the address, the API key once and the 5-line quickstart; DemoBank appears in the console switcher with a **SANDBOX** chip; its sample app runs with that key; **Send to user** asks `asha@sammati`, the phone approves, the sample endpoint answers ALLOWED, withdraw: BLOCKED | "Anyone can apply. The regulator decides who may ask people for consent. A new company starts in a sandbox with five lines of code and one key, and gets the same enforcement and the same proof." |
| 3:50 | **Act 7: Close** (10 s) | Explorer link on Amoy, QR to scan | "Same contracts are live on a public testnet. This is the consent layer India's data economy needs." State the production path in one breath |

Total ≈ 3:50 without Act 6b and ≈ 4:00 with it (Act 7 shrinks to 10 s; Acts 5 and 6b are the ones to drop when running late, in that order). To make room for the Data flow panel, Act 3b grew from 30 to 40 s, and the time came from Act 5 (15 to 10 s) and Act 6 (35 to 30 s), which the audience already follows from the Auditor's own words. If the script runs long, cut Act 5 entirely. Judges' questions come after.

### Optional Act 4b: a consent that expires (needs `pnpm demo:up:fast`)
Not in the four minutes; use it in the mentoring round or Q&A. With `DEMO_FAST_EXPIRY` the phone offers **2 minutes (demo)** as an expiry. Grant credit check with it. The **Alerts** tab shows "expires in 1 minute", then "expires in 30 seconds", then "expired" (and a phone notification if the app is open); **Run credit check** in the console answers **451 CONSENT_EXPIRED**; in the console's **Expiring consents** press **Request renewal**; the request appears in the wallet's inbox and Alerts; **Renew** gives a new consent and the same call is **ALLOWED**. If the customer sent details, the Processor erases them 60 seconds after expiry and the wallet shows **data erased**.

**What is and is not background push (say it if asked).** Reminders for consents the phone already knows are scheduled on the phone, so they fire with the app closed. Everything a company sends (renewal requests, erasure and acknowledgement confirmations) reaches the phone over the live connection, so the **app must be open, or the phone awake with the app still running**; anything missed is on the Alerts tab the next time it opens. True push to a closed app needs Firebase, which is not built, and the local notifications have not been tested on a real phone yet. Do not claim otherwise.

## 3. Rehearsal rules
- Rehearse the exact flow **at least 5 times**, with `pnpm e2e` passing before each.
- Use `pnpm demo:reset` between runs.
- Decide who speaks and who clicks: one presenter, one operator (console and auditor), one on standby for the phone and recovery.
- Memorise the two hero moments: **blocked after withdraw** and **tamper detected**.

## 4. Stage setup checklist
- [ ] Laptop on charger, Hardhat node, Core, 3 companies, web all up (`pnpm demo:up`: real mode is the default; `pnpm e2e` must pass first)
- [ ] Phone on the same hotspot, and the address `pnpm demo:up` prints in its banner is the laptop's address on that hotspot (if the laptop is on two networks the banner lists both: set `CORE_PUBLIC_URL` to the right one), relayer funded
- [ ] Phone mirrored with `scrcpy` on the projector, brightness and Do Not Disturb set
- [ ] Browser tabs preloaded: Stage view, QuickLoan console, Auditor, Amoy explorer
- [ ] Wallet language set to English, Kannada one tap away
- [ ] For Act 6b: `/join` open on the second screen, the regulator access code (`REGULATOR_KEY`, default `demo-regulator-key`) at hand, the phone's Sammati ID (`asha@sammati`) added once under Auditor > Registrations > **Test customers**, and the sample app command ready (`pnpm --filter @sammati/core sample:company`, `docs/integration.md` §4). `pnpm demo:reset` removes DemoBank, so redo the registration for each rehearsal
- [ ] Screen recording of the full demo saved locally (fallback)
- [ ] Amoy deployment addresses and explorer links verified the same day
- [ ] A second phone with the APK installed as a spare
- [ ] The Processor is up on :4200 (`pnpm demo:up` starts it; `curl http://<lan-ip>:4200/health` says `simulated-enclave`) and the phone can reach it on the same hotspot as Core (the wallet gets the address from Core, set by `PROCESSOR_PUBLIC_URL` or detected like `CORE_PUBLIC_URL`)
- [ ] `/portal/quickloan` is open in its own browser tab, signed out, and the phone's wallet has no QuickLoan consents (`pnpm demo:reset` first)
- [ ] `/stage` opens on the Data flow panel and the **Live feed offline** chip is not showing; **Replay** plays `web/public/flow-replay.json` (regenerate it after any change to the events with `E2E_RECORD_FLOW=web/public/flow-replay.json pnpm e2e`)
- [ ] Do not restart the Processor between rehearsal and stage without `pnpm demo:reset`: its key is in memory, so old ciphertext becomes unreadable (answers `CIPHERTEXT_INVALID`) until the phone sends again

## 5. Failure plan

| If this breaks | Do this |
|---|---|
| Phone cannot reach the laptop | Switch hotspot, or use the spare phone; if still down, use the emulator on the laptop |
| Chain stalls | `pnpm demo:reset`; if no time, play the recorded demo and narrate |
| Biometric fails | Fall back to PIN (built in) |
| Venue network is down or the stack will not start | Open `/stage/flow?replay=1`: the same screen plays a recording of a real run, marked "Replay of a recording". Say that it is a recording |
| "Send securely" fails or Run loan decision answers an error | Check the Processor's `/health`; if its key changed, tap **Send again** on the phone, then run the decision again. If it is still broken skip Act 3b: it is a differentiator, not the golden path |
| Projector or mirroring fails | Show the phone to the judges directly and keep the console on the projector |
| Registration, approval or the sample app fails in Act 6b | Skip it: it is optional. Say "onboarding is in the guide" and show `docs/integration.md` on screen |
| Anything unexplained | Say "let me show you the recording of this step", never debug live in front of judges |

## 6. Pitch deck (7 slides, optional but short)
1. Problem: consent is a checkbox nobody controls
2. The DPDP moment: the Act, as we understand it, asks for purpose-specific, withdrawable consent and a record of it (exact wording is marked VERIFY in `dpdp-mapping.md`)
3. Sammati: wallet, gateway, auditor, ledger (the architecture picture, simplified)
4. Live demo
5. Why this is real: Account Aggregator-style consent layer, production path, who pays (companies pay per verified check, citizens free)
6. How Sammati lines up with the Act's principles (L-01): the mapping in one slide, gaps included (content below)
7. Team and what we built in 24 hours

The legal-alignment slide, in full. Say "aligned with the principles of", never "compliant" or "certified"; keep the three numbers in step with `dpdp-mapping.md`.

**Slide 6: How Sammati lines up with the Act's principles**
**Title:** Aligned with the principles. Not certified.
**Content:**
- Notice and consent: itemised plain-language purposes, a separate choice per purpose, nothing pre-ticked, in English, Hindi and Kannada (the seed's Hindi and Kannada purpose text is still being reviewed).
- Withdrawal and erasure: two taps to withdraw, the company's next request is blocked, the sealed copy is erased, processors are told and acknowledge on chain.
- Consent-manager role: accountable to the person (only her signature changes consent); Core never receives the data it manages.
- Honest gaps: simulated enclave, demo-held keys, no breach flow, no children's data, no correction or nomination.
- Footer: "28 obligations mapped: 10 implemented, 12 partial, 6 out of scope. Every legal point is marked VERIFY until checked. docs/dpdp-mapping.md"

**Speaker Notes:**
*20 seconds. "We mapped the Act's obligations to what we built, and we put the gaps on the same slide. We say aligned with the principles, not compliant: nobody has certified this, and every legal point we haven't checked against the official text is marked for a lawyer to verify."*


## 7. Judge Q&A

**Why blockchain, not a database?**
"Consent is a dispute between a user and a company, so the company cannot hold the evidence. A user-signed, shared ledger means neither side, and no single company, can rewrite history. A normal database gives you a log. This gives you a log that the audited party doesn't control."

**Is the consent manager able to see user data?**
"Not the sensitive data. Core, which plays the consent manager, never receives the encrypted data and holds no key. It handles consent records and access metadata: a pseudonymous address, which purpose, allowed or blocked, and when. The sensitive profile is encrypted on the phone and only the Sammati Processor opens it, for one evaluation, and our test run searches every log, event, response and database file for the demo PAN and finds nothing. The honest limit: the Processor is a simulated enclave that we run, so in this build it is a component you have to trust. The production design puts it in a hardware enclave with remote attestation. Whether the law requires a consent manager to be unable to read the data, and in what way, is one of the points we have marked to verify."

**How do you handle erasure with a ledger?**
"By keeping personal data off the ledger. The chain holds pseudonymous addresses, purpose ids, hashes, a status and an expiry, so there is nothing personal on it to erase. The sensitive profile sits as ciphertext in the Processor and is erased on withdrawal or expiry: on the Data flow screen you can watch the entry go from stored to erased while its metadata stays as the audit trail. A company's own databases are the company's to erase. The cascade tells its processors and they acknowledge on chain, and an erasure request filed in the wallet is recorded, though in this build nothing moves it forward. One caveat we flag ourselves: a pseudonymous address is not anonymous, and whether it counts as personal data once someone can link it to a person is a legal question we have marked to verify."

**What if a company just bypasses your gateway?**
"We split it into prevention and detection. Honest companies are enforced in real time. A company that bypasses the gateway shows up in the audit: data use without an anchored access record, or anchored access without valid consent at that moment. And the user's wallet has the signed receipts."

**Who pays gas, and does it scale?**
"The user never pays. A relayer submits signed messages. Only hashes are written, and access logs are batched into one Merkle root, so thousands of events cost one transaction. In production this runs on a consortium or L2 chain."

**What if the user loses the phone?**
"In this prototype, device key plus biometric. In production, social or Aadhaar-linked recovery with the same on-chain identity. We chose not to show seed phrases to normal users."

**How is this different from existing consent managers or cookie banners?**
"Cookie banners record a click on the company's own server. We have purpose-level, user-signed consent, enforced in the company's code path, with independent proof."

**Is this legally compliant?**
"We don't claim that. Sammati is aligned with the principles of the Act: an itemised notice, a separate choice per purpose with nothing pre-ticked, withdrawal in two taps, erasure of the sealed copy on withdrawal, and a record anyone can check. We have not had it legally reviewed, we are not a registered consent manager, and every point we have not checked against the official text is marked VERIFY in our mapping, `docs/dpdp-mapping.md`. The mapping also lists what we have not built: breach notification, children's data, correction and nomination. And all the data is fictional."

**Is the data real?**
"No. All customer data is fictional. The consent flow, signatures, enforcement and anchoring are real and running."

**Who stops a bad company from joining?**
"The regulator. Anyone can apply, and nothing exists for them until the regulator approves: no company id, no key, no way to ask a customer for consent. After approval a company starts in a sandbox where it can only reach test customers, until the regulator promotes it. In this demo the review is a human decision: we do not verify licences. Production would tie this to the regulator's own registry."

**Can a company use someone else's key?**
"A key belongs to one company and is refused for any other company's id. We store only a hash of it and show it once. Each company is rate limited. Without a valid key the gateway fails closed: no key, no consent check, no data."

**Be honest about the demo shortcuts.**
"Company and processor keys are held by our core service for the demo, including those of a company that joins through the registration page. The regulator's access code is a shared secret, the company console has no login, and the sandbox is enforced by our core service, not by the contracts. In production each company holds its own keys. The Sammati Processor is a simulated enclave: a separate service with its key in memory, not real hardware protection. The wallet also takes its public key on trust over plain HTTP on the venue network."

**Who can read the data?** (point at the Data flow screen)
"The customer, on their phone, and the Processor, for the second it takes to compute a decision. QuickLoan's staff, QuickLoan's database, our core service, the auditor and anyone holding a copy of any database see ciphertext or a reference number. Our core never receives the encrypted data at all and has no key. There is no endpoint that returns plaintext, and we test for that: our end-to-end run searches every log, event, response and database file for the demo PAN."

**Is that screen real or an animation?**
"Real. Every lane is driven by the events the system emits and by real answers from the services; the staff lane's buttons call QuickLoan's actual admin endpoint and read the actual ciphertext row. The one thing paced for the room is the display speed: a state stays up for about half a second so you can read it. The page also checks every event of the session for the demo values, and only shows the privacy line if none appeared."

**Is the Processor trusted?**
"In this build, yes, and we say so: it is a separate service with an in-memory key, a simulated enclave. Someone who controls that machine could read its memory. The production design runs it in a hardware enclave, like AWS Nitro Enclaves or Intel SGX, with remote attestation: the enclave proves which code it runs, the phone encrypts only to a key the hardware vouches for, and then even the operator cannot read the data. What is real today is the flow: encrypted on the phone, stored as ciphertext, opened in one place, consent checked on chain every time, every use in the anchored log."

**What stops the company from calling the Processor for another purpose?**
"Three things. The envelope is bound to one customer, one company and one purpose, so it will not open for another. Every call is checked against the chain for the purpose it names: ask for marketing with a credit-check handle and the answer is 451 no consent. And every call, allowed or blocked, is an entry in the company's hash-chained log that is anchored on chain. Misuse leaves a record that the regulator can verify and the company cannot edit."

**What happens on withdrawal?**
"The company's next request gets a 451 with a reason. And the Processor erases the encrypted copy: it sees the withdrawal, and re-checks on every call and on a timer. So the data is gone, not just locked. The chain keeps the proof that consent existed and was withdrawn, not the data."

**So the company can't even see my income. How does it lend?**
"It gets the answer to the question it is allowed to ask: approved or declined, and a limit. The decision does reveal something, like a score band. That is the data minimisation: the company receives the output, not the inputs."

## 8. Lines worth repeating
- "Withdraw is not a setting, it's a switch that cuts the pipe."
- "Not one big 'I agree'. One decision per purpose."
- "The regulator verifies. The regulator doesn't have to trust."
