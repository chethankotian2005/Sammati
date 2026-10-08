# Demo Plan — Sammati

## 1. The one sentence
"UPI made payments simple and trustworthy. Sammati does that for consent: one wallet, instant withdrawal that *actually blocks* data use, and proof nobody can edit."

## 2. Structure (4 minutes)

| Time | Act | What judges see | What you say |
|---|---|---|---|
| 0:00 | **Hook** | Title slide: "You have said yes to 40 apps. Do you know what you said yes to?" | 15 seconds on the problem and DPDP. Name the three roles |
| 0:20 | **Act 1: Connect** | Console shows QuickLoan QR. Phone scans, notice appears with three purposes | "Not one big 'I agree'. Each purpose is its own choice, in my language." Switch language to Kannada for a second |
| 0:55 | **Act 2: Consent** | Asha turns on credit check and marketing, leaves bureau sharing off. Biometric, receipt with tx | "I signed this with my key. The company cannot forge it." |
| 1:20 | **Act 3: Allowed** | Simulator: "Run credit check" returns data, green ALLOWED appears on console and in the wallet feed together | "The gateway checked the ledger before releasing a single byte." Click "Share with bureau": BLOCKED (never consented) |
| 1:50 | **Act 4: The moment** | Phone: withdraw marketing. Console: "Send marketing SMS" turns **BLOCKED 451**. Cascade list on phone fills in: AdPartnerQ acknowledged | "Withdraw is two taps. The very next request is blocked. And the company's partner was told and confirmed." Pause. Let the red row land |
| 2:30 | **Act 5: Three companies, one wallet** | Home screen shows QuickLoan, MediCare+, FoodRush. Withdraw `ad_targeting` at FoodRush only, others keep working | "One wallet, every company, per-purpose control." |
| 2:50 | **Act 6: Proof** | Auditor: Verify QuickLoan, all green. Presenter clicks hidden **Tamper** control on one record, Verify again: **red mismatch in batch 4, record 63** | "A company edits its own log to hide an access. The regulator catches it without trusting the company." |
| 3:30 | **Act 7: Close** | Explorer link on Amoy, QR to scan | "Same contracts are live on a public testnet. This is the consent layer India's data economy needs." State the production path in one breath |

Total ≈ 3:50, leaving ~10 seconds slack. Judges' questions come after.

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

## 5. Failure plan

| If this breaks | Do this |
|---|---|
| Phone cannot reach the laptop | Switch hotspot, or use the spare phone; if still down, use the emulator on the laptop |
| Chain stalls | `pnpm demo:reset`; if no time, play the recorded demo and narrate |
| Biometric fails | Fall back to PIN (built in) |
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
"Company and processor keys are held by our core service for the demo. In production each company holds its own keys."

## 8. Lines worth repeating
- "Withdraw is not a setting, it's a switch that cuts the pipe."
- "Not one big 'I agree'. One decision per purpose."
- "The regulator verifies. The regulator doesn't have to trust."
