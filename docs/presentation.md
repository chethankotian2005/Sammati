# Sammati Presentation & Q&A

## Slide Deck Outline (6 Slides)

### Slide 1: The Problem
**Title:** You have said yes to 40 apps. Do you know what you said yes to?
**Content:**
- Consent today is a giant "I agree" checkbox that nobody controls.
- Citizens can't see who holds their data.
- Withdrawing consent rarely stops downstream data flows.
- Regulators have to trust the audited company's own logs.

**Speaker Notes:**
*15 seconds on the problem and the current state of consent. Introduce the three key personas: Asha the citizen, Ravi the compliance lead, and Meera the regulator auditor.*

### Slide 2: The DPDP Moment
**Title:** The Law Has Changed
**Content:**
- The DPDP Act requires clear, purpose-specific consent.
- Withdrawal must be "as easy as" giving it.
- Companies must prove compliance with independent logs.

**Speaker Notes:**
*The law is here, but the infrastructure isn't. We need a system that makes compliance easy for companies and transparent for users. "UPI made payments simple and trustworthy. Sammati does that for consent."*

### Slide 3: Sammati Architecture
**Title:** A Verifiable Consent Layer
**Content:**
- [Insert `architecture.svg` here]
- **Citizen Wallet**: One place to manage every purpose.
- **Gateway**: Enforces rules in real-time, blocking unauthorized data use.
- **Ledger**: User-signed, un-editable proof.
- **Auditor**: Independent regulator verification.

**Speaker Notes:**
*We built four pieces. A citizen wallet to hold receipts, a gateway that companies drop in to enforce consent in code, a shared ledger so nobody can rewrite history, and a regulator auditor that proves it all without asking the company for logs.*

### Slide 4: Live Demo
**Title:** Sammati in Action
**Content:**
- Connect & Consent
- Enforced Access
- Instant Withdrawal (The Cascade)
- Regulator Audit (Tamper Detection)

**Speaker Notes:**
*(Follow the demo cue script)*
*1. "Not one big 'I agree'. Each purpose is its own choice, in my language."*
*2. "I signed this with my key. The company cannot forge it."*
*3. "The gateway checked the ledger before releasing a single byte."*
*4. (Withdraw) "Withdraw is two taps. The very next request is blocked. And the company's partner was told and confirmed."*
*5. (Auditor Tamper) "A company edits its own log to hide an access. The regulator catches it without trusting the company."*

### Slide 5: Why This Is Real
**Title:** Built for Production
**Content:**
- Account Aggregator-style consent network.
- **Who pays**: Citizens are free; Companies pay per verified check.
- **Scale**: Batch anchoring (thousands of events = one tx).
- **Network**: Deployed to Polygon Amoy Testnet.

**Speaker Notes:**
*This isn't just a hack. We modeled this on India's Account Aggregator framework. Users don't pay gas. Relayers handle the chain, and companies pay for the enforcement and proof. Same contracts are live on a public testnet right now.*

### Slide 6: The Team
**Title:** Built in 24 Hours
**Content:**
- Team Sammati (3 Builders)
- Core & Smart Contracts
- Flutter Wallet (EIP-712 offline signing)
- Company Console & Auditor Web App
- Thank you!

**Speaker Notes:**
*We built the entire golden path in 24 hours. The consent layer India's data economy needs. Thank you, we're ready for questions.*

---

## Q&A Cheat Sheet

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
"It is designed around the DPDP Act's principles: itemised notice, purpose limitation, withdrawal as easy as consent, a consent-manager model, and auditability. We aren't claiming certification."

**Is the data real?**
"No. All customer data is fictional. The consent flow, signatures, enforcement and anchoring are real and running."

**Be honest about the demo shortcuts.**
"Company and processor keys are held by our core service for the demo. In production each company holds its own keys."

---

## Strings for Native-Speaker Review

Ensure a native speaker reviews the following exact strings before the demo.

| Key | Hindi | Kannada |
|---|---|---|
| `give_consent` | सहमति दें | ಒಪ್ಪಿಗೆ ನೀಡಿ |
| `withdraw` | वापस लें | ಹಿಂಪಡೆಯಿರಿ |
| `withdrawn_blocked` | वापस ली गई। {company} रोका गया। | ಹಿಂಪಡೆಯಲಾಗಿದೆ. {company} ನಿರ್ಬಂಧಿಸಲಾಗಿದೆ. |
| `allowed` | अनुमति दी गई | ಅನುಮತಿಸಲಾಗಿದೆ |
| `blocked` | रोका गया | ನಿರ್ಬಂಧಿಸಲಾಗಿದೆ |
| `scan_to_connect` | कनेक्ट करने के लिए स्कैन करें | ಸಂಪರ್ಕಿಸಲು ಸ್ಕ್ಯಾನ್ ಮಾಡಿ |
| `withdraw_easy` | आप बाद में किसी भी उद्देश्य की सहमति उतनी ही आसानी से वापस ले सकते हैं। | ನೀವು ನಂತರ ಯಾವುದೇ ಉದ್ದೇಶದ ಒಪ್ಪಿಗೆಯನ್ನು ನೀಡಿದಷ್ಟೇ ಸುಲಭವಾಗಿ ಹಿಂಪಡೆಯಬಹುದು. |
| `recorded` | लेजर पर दर्ज | ಲೆಡ್ಜರ್‌ನಲ್ಲಿ ದಾಖಲಾಗಿದೆ |

*(Also ensure any purpose descriptions created for QuickLoan, MediCare+, and FoodRush are translated naturally)*
