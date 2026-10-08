# Demo Plan — Sammati

## 1. The one sentence
"UPI made payments simple and trustworthy. Sammati does that for consent: one wallet, instant withdrawal that *actually blocks* data use, data the company never reads, and proof nobody can edit."

## 2. The four-minute script

One presenter talks, one operator clicks the console, Stage view and Auditor, one holds the phone. Everything below was played by `pnpm e2e` before it was rehearsed.

The three **hero moments** are marked ★. If anything goes wrong, protect those first.

| Time | Act | What judges see | What you say |
|---|---|---|---|
| 0:00 | **Hook** (15 s) | Title slide: "You have said yes to 40 apps. Do you know what you said yes to?" | One line on the problem and the DPDP Act. Name the three roles: wallet, gateway, auditor |
| 0:15 | **1. Connect** (30 s) | The **QuickLoan portal** (`/portal/quickloan`): sign in as Asha, tick "Allow QuickLoan to use my data for loan purposes", the QR appears on the page. Phone scans; the notice shows three purposes. Switch the phone to Kannada for a second. *(If the camera misbehaves: the console's **Send to user** to `asha@sammati` lands in the phone's inbox in under two seconds, tap **Review**)* | "Not one big 'I agree'. Each purpose is its own choice, in my language." |
| 0:45 | **2. Consent** (20 s) | Credit check and marketing on, bureau sharing left off. Biometric. Receipt with the transaction. The portal turns to "Consent received". | "I signed this with my key. The company cannot forge it." |
| 1:05 | **3. Allowed, then blocked** (20 s) | Console: **Run credit check** is green **ALLOWED** (a reference, no customer data). **Share with bureau**: red **BLOCKED**, never consented. The phone's feed shows both. | "The gateway checked the ledger before releasing a single byte." |
| 1:25 | **4. ★ Use without reading** (45 s) | **Stage → Data flow.** On the phone: receipt → **Share your details securely** → **Use demo details**. The portal says "Data submitted securely"; press **Apply**: a decision card. Four lanes fill from real events: the phone's own fields in plain text; the ciphertext crossing the network (hash, size, algorithm); **Run loan decision** and the Processor goes Decrypting, Scoring, Decision, Approved. Then click **Try to view customer data** in the QuickLoan lane: only a ciphertext hash and "Not authorised to read content". **Try to read database**: raw ciphertext. The line appears: "No plaintext was visible to QuickLoan or any third party." | "My PAN and income were encrypted on my phone. QuickLoan's staff, its database, anyone on the network: ciphertext. Only the sealed processor opens it, for a second, and returns a decision." Say once: **"The processor is a simulated enclave. The honest limit is in Q&A."** |
| 2:10 | **5. ★ The moment: blocked after withdraw** (35 s) | Phone: withdraw marketing, then credit check (two taps each). Console: **Send marketing SMS** turns **BLOCKED 451**. The phone's cascade list fills: AdPartnerQ notified, then acknowledged. The Data flow panel shows Blocked and **Ciphertext erased**; the phone says "Your encrypted details were erased." | "Withdraw is two taps. The very next request is blocked. The partner was told and confirmed. And the data I gave for the loan check? Not just blocked: erased." **Pause. Let the red row land.** |
| 2:45 | **6. A company asks you** (20 s) | Console **Send to user**: `asha@sammati`, one purpose, a short message, **Send request**. The phone's bell lights within two seconds; the card shows the message. **Decline**, or **Review** and approve. The console row goes Sent → Seen → Granted/Declined. Then type a made-up ID: the same "Request sent". | "No QR needed. The company never learns my address, and cannot tell whether an ID exists." |
| 3:05 | **7. Consent has a lifetime** (15 s, needs `pnpm demo:up:fast`) | **Alerts** tab on the phone: "expires in 1 minute", then "expired" for the 2-minute consent given before the show. Console **Expiring consents**: **Request renewal**. Phone: **Renew** → notice → approve → the console call is **ALLOWED** again. | "Consent expires on its own, the user is told, and one tap renews it." |
| 3:20 | **8. ★ Proof: tamper** (30 s) | Auditor: **Verify QuickLoan**, all green (the loan decision is in the log too). Operator clicks the hidden **Tamper** control on one record, **Verify** again: **red mismatch in batch N, record M**. | "A company edits its own log to hide an access. The regulator catches it without trusting the company." |
| 3:50 | **Close** (10 s) | Amoy explorer link, QR to scan | "The same contracts are live on a public testnet. This is the consent layer India's data economy needs." State the production path in one breath |

Total 4:00. Judges' questions come after.

### The three-minute version
Cut, in this order, until it fits: **Act 7** (−15 s), **Act 6** (−20 s), then trim **Act 4** to 30 s by skipping **Try to read database** (−15 s) and shorten the **Hook** to 10 s (−5 s) and the **Close** to 5 s (−5 s). That is 3:00 with all three hero moments intact: blocked after withdraw, the staff view that can only see ciphertext while the Processor decides, tamper detected. Never cut a hero moment; cut Acts 7, 6, 1 (use the inbox path), in that order.

## 3. Rehearsal rules
- Rehearse the exact flow **at least 5 times**, with `pnpm e2e` passing before each.
- Use `pnpm demo:reset` between runs.
- Decide who speaks and who clicks: one presenter, one operator (console and auditor), one on standby for the phone and recovery.
- Memorise the three hero moments: **blocked after withdraw**, **the staff view can only see ciphertext**, **tamper detected**.

## 4. Stage setup checklist
- [ ] Laptop on charger. `pnpm demo:up:fast` is running (chain, Core, **Processor on :4200**, three companies, web). It is `pnpm demo:up` plus `DEMO_FAST_EXPIRY`: use plain `pnpm demo:up` only if Act 7 is cut
- [ ] `pnpm e2e` passed on this laptop today (it stops anything on the demo ports, so run it before the stack goes up, not during)
- [ ] Phone on the same hotspot, and the address `pnpm demo:up` prints in its banner is the laptop's address on that hotspot (if the laptop is on two networks the banner lists both: set `CORE_PUBLIC_URL` to the right one); relayer funded
- [ ] The Processor answers: `curl http://<lan-ip>:4200/health` says `simulated-enclave`, and the phone can reach it on the same hotspot (the wallet gets the address from Core, set by `PROCESSOR_PUBLIC_URL` or detected like `CORE_PUBLIC_URL`)
- [ ] `pnpm demo:reset` done, so: no QuickLoan consents on the phone, no registered Sammati IDs, no alerts, an empty vault. **Then** register `asha@sammati` on the phone (Me → Your Sammati ID) for Act 6, and give **MediCare+** a **2 minutes (demo)** consent about two minutes before Act 7 so it has expired or is about to when you get there
- [ ] Phone mirrored with `scrcpy` on the projector, brightness up, Do Not Disturb **off for this app only** if you want to show the phone notification, otherwise on
- [ ] Browser tabs preloaded: Stage view on **Data flow**, QuickLoan console (open on **Send to user**), `/portal/quickloan` signed out, Auditor, Amoy explorer
- [ ] Wallet language English, Kannada one tap away
- [ ] `/stage` opens on the Data flow panel and the **Live feed offline** chip is not showing; **Replay** plays `web/public/flow-replay.json` (regenerate it after any change to the events with `E2E_RECORD_FLOW=web/public/flow-replay.json pnpm e2e`)
- [ ] Screen recording of the full demo saved locally (fallback), see `RELEASE_CHECKLIST.md`
- [ ] Amoy deployment addresses and explorer links verified the same day
- [ ] A second phone with the APK installed as a spare
- [ ] **Do not restart the Processor between rehearsal and stage without `pnpm demo:reset`**: its key is in memory, so old ciphertext becomes unreadable (`CIPHERTEXT_INVALID`) until the phone sends again

### What the phone can and cannot do with the app closed (say it if asked)
- **Reminders for consents the phone already knows** (3 days and 1 day before expiry, and at expiry) are scheduled on the phone, so they fire with the app closed.
- **Everything a company sends** (a renewal request, "your data was erased", a processor's confirmation) reaches the phone over the live connection. So **the app must be open, or the phone awake with the app still running**. Anything missed waits on the Alerts tab.
- **Push to a closed app (Firebase) is not built.** Local notifications have **not been tested on a real phone** yet. Do not claim background push; see `RELEASE_CHECKLIST.md` for the test that would change that.
- **Company onboarding and a sandbox company are not built**: the demo uses the three seed companies.

## 5. Failure plan

| If this breaks | Do this |
|---|---|
| Phone cannot reach the laptop | Switch hotspot, or use the spare phone; if still down, use the emulator on the laptop |
| Camera will not scan | Use Act 6's path instead: **Send to user** to `asha@sammati`, then **Review** on the phone |
| Chain stalls | `pnpm demo:reset`; if no time, play the recorded demo and narrate |
| Biometric fails | Fall back to PIN (built in) |
| Venue network is down or the stack will not start | Open `/stage/flow?replay=1`: the same screen plays a recording of a real run, marked "Replay of a recording". Say that it is a recording |
| "Send securely" fails or Run loan decision answers an error | Check the Processor's `/health`; if its key changed, tap **Send again** on the phone, then run the decision again. If it is still broken, skip Act 4: but it is a hero moment, so play the replay instead of dropping it |
| A targeted request does not arrive | Pull down in the phone's inbox; check the phone's Core address in Me → Developer settings. Skip Act 6 |
| The 2-minute consent has not expired yet | Skip Act 7, or wait for the next Q&A question and come back |
| Alerts tab empty | The stack was not started with `demo:up:fast`: say so, skip Act 7 |
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

**Is this DPDP-compliant?**
"It is aligned with the principles of the Act, not certified. `docs/dpdp-mapping.md` lists what each feature maps to and what is still unchecked. It is a prototype with made-up data, not legal advice."
