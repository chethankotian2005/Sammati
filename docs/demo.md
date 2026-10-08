# Demo Plan — Sammati

## 1. The one sentence
"UPI made payments simple and trustworthy. Sammati does that for consent: one wallet, instant withdrawal that *actually blocks* data use, and proof nobody can edit."

## 2. Structure (4 minutes)

| Time | Act | What judges see | What you say |
|---|---|---|---|
| 0:00 | **Hook** | Title slide: "You have said yes to 40 apps. Do you know what you said yes to?" | 15 seconds on the problem and DPDP. Name the three roles |
| 0:15 | **Act 1: Connect** | The **QuickLoan customer portal** (`/portal/quickloan`): sign in as Asha, tick "Allow QuickLoan to use my data for loan purposes", the QR appears on the page. Phone scans, notice appears with three purposes | "Not one big 'I agree'. Each purpose is its own choice, in my language." Switch language to Kannada for a second |
| 0:45 | **Act 2: Consent** | Asha turns on credit check and marketing, leaves bureau sharing off. Biometric, receipt with tx. The portal turns to "Consent received" and shows the fields as "Provided securely in your Sammati app" | "I signed this with my key. The company cannot forge it." |
| 1:05 | **Act 3: Allowed** | Simulator: "Run credit check" is ALLOWED and returns only a reference (`status: none` until the phone sends something), never customer data; green ALLOWED appears on console and in the wallet feed together | "The gateway checked the ledger before releasing a single byte." Click "Share with bureau": BLOCKED (never consented) |
| 1:30 | **Act 3b: Use without reading** | Stage view, **Data flow** panel. Phone: the receipt's **Share your details securely** (or **Send securely** on the pass), **Use demo details**, confirm. The portal shows "Data submitted securely", then **Apply** there returns the decision card. Four lanes fill from real events: the phone's own fields in plain text, then the ciphertext in transit (hash, size, algorithm), then **Run loan decision**: the sealed Processor goes Decrypting, Scoring, Decision, Approved. Click **Try to view customer data** in the QuickLoan lane: only a ciphertext hash and "Not authorised to read content". Click **Try to read database**: the raw ciphertext. The privacy line appears: "No plaintext was visible to QuickLoan or any third party" | "My PAN and income were encrypted on my phone. QuickLoan's staff, their database, anyone on the network: ciphertext. Only the sealed processor opens it, for a second, and returns a decision." Say once: "The processor is a simulated enclave: the honest limit is in Q&A." If the venue is offline, press **Replay**: the chip says it is a recording, and you say so |
| 2:10 | **Act 4: The moment** | Phone: withdraw marketing. Console: "Send marketing SMS" turns **BLOCKED 451**. Cascade list on phone fills in: AdPartnerQ acknowledged. Then withdraw credit check (on the phone; or the presenter's **Withdraw and re-run** if the demo customer is used): the Data flow panel shows Blocked and "Ciphertext erased", and the phone says "Your encrypted details were erased." | "Withdraw is two taps. The very next request is blocked. The partner was told and confirmed. And the data we gave for the loan check? Not just blocked. Erased." Pause. Let the red row land |
| 2:50 | **Act 5: Three companies, one wallet** (10 s; cut first if running late) | Home screen shows QuickLoan, MediCare+, FoodRush. Withdraw `ad_targeting` at FoodRush only, others keep working | "One wallet, every company, per-purpose control." |
| 3:00 | **Act 6: Proof** | Auditor: Verify QuickLoan, all green (the loan decision is in the log too). Presenter clicks hidden **Tamper** control on one record, Verify again: **red mismatch in batch 4, record 63** | "A company edits its own log to hide an access. The regulator catches it without trusting the company." |
| 3:30 | **Act 7: Close** | Explorer link on Amoy, QR to scan | "Same contracts are live on a public testnet. This is the consent layer India's data economy needs." State the production path in one breath |

Total ≈ 3:50, leaving ~10 seconds slack. To make room for the Data flow panel, Act 3b grew from 30 to 40 s, and the time came from Act 5 (15 to 10 s) and Act 6 (35 to 30 s), which the audience already follows from the Auditor's own words. If the script runs long, cut Act 5 entirely. Judges' questions come after.

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
| Anything unexplained | Say "let me show you the recording of this step", never debug live in front of judges |

## 6. Pitch deck (6 slides, optional but short)
1. Problem: consent is a checkbox nobody controls
2. The DPDP moment: the law now requires purpose-specific, withdrawable consent and proof
3. Sammati: wallet, gateway, auditor, ledger (the architecture picture, simplified)
4. Live demo
5. Why this is real: Account Aggregator-style consent layer, production path, who pays (companies pay per verified check, citizens free)
6. Team and what we built in 24 hours

## 7. Judge Q&A

**Why blockchain, not a database?**
"Consent is a dispute between a user and a company, so the company cannot hold the evidence. A user-signed, shared ledger means neither side, and no single company, can rewrite history. A normal database gives you a log. This gives you a log that the audited party doesn't control."

**What about the right to erasure and immutability?**
"No personal data is on chain, only pseudonymous addresses, hashes and statuses. Erasure happens in the company's systems and is tracked as a rights request. The chain proves consent history, it does not store the person."

**What if a company just bypasses your gateway?**
"We split it into prevention and detection. Honest companies are enforced in real time. A company that bypasses the gateway shows up in the audit: data use without an anchored access record, or anchored access without valid consent at that moment. And the user's wallet has the signed receipts."

**Who pays gas, and does it scale?**
"The user never pays. A relayer submits signed messages. Only hashes are written, and access logs are batched into one Merkle root, so thousands of events cost one transaction. In production this runs on a consortium or L2 chain."

**What if the user loses the phone?**
"In this prototype, device key plus biometric. In production, social or Aadhaar-linked recovery with the same on-chain identity. We chose not to show seed phrases to normal users."

**How is this different from existing consent managers or cookie banners?**
"Cookie banners record a click on the company's own server. We have purpose-level, user-signed consent, enforced in the company's code path, with independent proof."

**Is this legally compliant?**
"It is designed around the Act's principles: itemised notice, purpose limitation, withdrawal as easy as consent, a consent-manager model, and auditability. We aren't claiming certification."

**Is the data real?**
"No. All customer data is fictional. The consent flow, signatures, enforcement and anchoring are real and running."

**Be honest about the demo shortcuts.**
"Company and processor keys are held by our core service for the demo. In production each company holds its own keys. The Sammati Processor is a simulated enclave: a separate service with its key in memory, not real hardware protection. The wallet also takes its public key on trust over plain HTTP on the venue network."

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
