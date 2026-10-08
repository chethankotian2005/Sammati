# Demo Plan — Sammati

## 1. The one sentence
"UPI made payments simple and trustworthy. Sammati does that for consent: one wallet, instant withdrawal that *actually blocks* data use, data the company never reads, and proof nobody can edit."

## 2. The four-minute script

One presenter talks, one operator clicks the console and Auditor, one holds the phone. Everything below goes through the product's own screens and APIs; `pnpm e2e` plays the same story with a headless wallet before it is rehearsed. There is nothing to fire from a control panel: the company's own server (the sample lender) makes the calls, the way a real company's would.

The three **hero moments** are marked ★. If anything goes wrong, protect those first.

| Time | Act | What judges see | What you say |
|---|---|---|---|
| 0:00 | **Hook** (15 s) | Title slide: "You have said yes to 40 apps. Do you know what you said yes to?" | One line on the problem and the DPDP Act. Name the three roles: wallet, gateway, auditor |
| 0:15 | **1. Connect** (30 s) | The company's customer page (`/portal/<company>`): sign in with a customer id, tick "Allow {company} to use my data for loan purposes", the QR appears on the page. Phone scans; the notice lists the company's purposes. Switch the phone to Kannada for a second. *(If the camera misbehaves: the console's **Send to user** to the phone's Sammati ID lands in its inbox in under two seconds, tap **Review**)* | "Not one big 'I agree'. Each purpose is its own choice, in my language." |
| 0:45 | **2. Consent** (20 s) | Turn on the loan purpose, leave a sharing purpose off. Biometric. Receipt with the transaction. The portal turns to "Consent received". | "I signed this with my key. The company cannot forge it." |
| 1:05 | **3. Allowed, then blocked** (20 s) | The company's server calls its guarded endpoints (the sample lender, one `curl` each): the consented purpose answers **ALLOWED**, the one never consented answers **451 NO_CONSENT**. The console's Live requests and the phone's Activity show both within two seconds | "The gateway checked the ledger before releasing a single byte." |
| 1:25 | **4. ★ Use without reading** (45 s) | On the phone: receipt → **Share your details securely** → type a made-up PAN, income band and employment → confirm. The portal says "Data submitted securely"; press **Apply**: a decision card. The console's **What {company} holds** card shows only a handle, a ciphertext hash and a status, and its timeline fills: Encrypted, Stored, Requested, Decrypting, Decided | "My PAN and income were encrypted on my phone. The company's staff, its database, anyone on the network: ciphertext. Only the sealed processor opens it, for a second, and returns a decision." Say once: **"The processor is a simulated sealed service. The honest limit is in Q&A."** |
| 2:10 | **5. ★ The moment: blocked after withdraw** (35 s) | Phone: withdraw the sharing purpose, then the loan purpose (two taps each). The next call from the company's server is **BLOCKED 451**. The phone's cascade list fills: each processor notified, then acknowledged. The console timeline shows **Erased**; the phone says "Your encrypted details were erased." | "Withdraw is two taps. The very next request is blocked. The partner was told and confirmed. And the data I gave for the loan check? Not just blocked: erased." **Pause. Let the red row land.** |
| 2:45 | **6. A company asks you** (20 s) | Console **Send to user**: the phone's Sammati ID, one purpose, a short message, **Send request**. The phone's bell lights within two seconds; the card shows the message. **Decline**, or **Review** and approve. The console row goes Sent → Seen → Granted/Declined. Then type a made-up ID: the same "Request sent". | "No QR needed. The company never learns my address, and cannot tell whether an ID exists." |
| 3:05 | **7. Consent has a lifetime** (15 s) | Before the show, in **Me → Developer settings**, **Short expiry for testing** was switched on and a consent was given with 2 minutes; its chip says **Developer option**. **Alerts** tab: "expires in …", then "expired". Console **Expiring consents**: **Request renewal**. Phone: **Renew** → notice → approve → the company's call is **ALLOWED** again | "Consent expires on its own, the user is told, and one tap renews it. The two-minute choice is a switch I turned on for this test; Core has no special mode." |
| 3:20 | **8. ★ Proof: tamper** (30 s) | Auditor: **Verify** the company, all green (the loan decision is in the log too). The operator, in a terminal, runs `pnpm dev:tamper -- <company> <seq>` (the script prints the record it changed), then presses **Verify** again: **red mismatch in batch N, record M** | "A company edits its own log to hide an access. The regulator catches it without trusting the company. The edit was made to the database file itself: there is no button in any screen that can do this." |
| 3:50 | **Close** (10 s) | Amoy explorer link, QR to scan | "The same contracts are live on a public testnet. This is the consent layer India's data economy needs." State the production path in one breath |

Total 4:00. Judges' questions come after.

**Optional, 30 s, the first to cut when late: a new company joins.** On a second screen, `/join`: fill in a company (nothing is prefilled) and press **Send for review**. Auditor > **Registrations** > **Approve** (sandbox on). The status page shows the address, the API key once and the 5-line quickstart; the company appears in the console switcher with a **SANDBOX** chip. Say: "Anyone can apply. The regulator decides who may ask people for consent. A new company starts in a sandbox with five lines of code and one key, and gets the same enforcement and the same proof."

### The three-minute version
Cut, in this order, until it fits: **Act 7** (−15 s), the optional new-company step, **Act 6** (−20 s), then trim **Act 4** to 30 s by skipping the timeline walk-through (−15 s) and shorten the **Hook** to 10 s (−5 s) and the **Close** to 5 s (−5 s). That is 3:00 with all three hero moments intact: blocked after withdraw, a decision from data the company never saw, tamper detected. Never cut a hero moment.

## 3. Rehearsal rules
- Rehearse the exact flow **at least 5 times**, with `pnpm e2e` passing before each.
- Use `pnpm dev:reset` between runs (it needs `DEV_TOOLS=true` and a stopped or idle stack; see `trd.md` §6.4).
- Decide who speaks and who clicks: one presenter, one operator (console, Auditor, terminal), one on standby for the phone and recovery.
- Memorise the three hero moments: **blocked after withdraw**, **a decision from data the company never saw**, **tamper detected**.

## 4. Setup checklist
- [ ] Laptop on charger. `pnpm demo:up` is running (chain, Core, **Processor on :4200**, web). It starts empty
- [ ] `pnpm e2e` passed on this laptop today (it starts its own throwaway stack on other ports, so it is safe beside the demo stack, but run it before the show, not during)
- [ ] One company registered through `/join` and approved in the Auditor beforehand, with its API key saved; the sample lender running for it: `FIDUCIARY=<address> SAMMATI_API_KEY=<key> pnpm --filter @sammati/example-lender start`. Its customer page `/portal/<company>` opens
- [ ] Phone on the same hotspot, and the address `pnpm demo:up` prints in its banner is the laptop's address on that hotspot (if the laptop is on two networks the banner lists both: set `CORE_PUBLIC_URL` to the right one); relayer funded
- [ ] The Processor answers: `curl http://<lan-ip>:4200/health` says `simulated-enclave`, and the phone can reach it on the same hotspot
- [ ] The phone has an account (W-15: ID chosen, device lock set) with **made-up** details in My details, so the share screen asks for nothing it has already been given, and the regulator has added its Sammati ID as a **test customer** (Auditor > Registrations > Test customers), because a new company is in the sandbox until promoted
- [ ] For Act 7: **Short expiry for testing** switched on in the phone's Developer settings, and a 2-minute consent given about two minutes before the act
- [ ] Phone shown to the room (mirrored or held up), brightness up, Do Not Disturb **off for this app only** if you want to show the phone notification, otherwise on
- [ ] Browser tabs preloaded: the company console (open on **Send to user**), the customer page signed out, Auditor, Amoy explorer. A terminal open in the repo with `DEV_TOOLS=true` set, for `pnpm dev:tamper`
- [ ] Wallet language English, Kannada one tap away
- [ ] Screen recording of the full demo saved locally (fallback), see `RELEASE_CHECKLIST.md`
- [ ] Amoy deployment addresses and explorer links verified the same day
- [ ] A second phone with the APK installed as a spare
- [ ] **Do not restart the Processor between rehearsal and stage without `pnpm dev:reset`**: its key is in memory, so old ciphertext becomes unreadable (`CIPHERTEXT_INVALID`) until the phone sends again

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

## 8. Lines worth repeating
- "Withdraw is not a setting, it's a switch that cuts the pipe."
- "Not one big 'I agree'. One decision per purpose."
- "The regulator verifies. The regulator doesn't have to trust."
