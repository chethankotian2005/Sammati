# Sammati Presentation & Q&A

## Slide Deck Outline (7 Slides)

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
- India's DPDP Act, 2023 puts consent at the centre: clear, purpose-specific, withdrawable.
- Withdrawal is meant to be "as easy as" giving it.
- Companies need a record that notice was given and consent obtained. Independent logs make that record checkable.
- (Exact wording of each point is marked VERIFY in `docs/dpdp-mapping.md` until checked.)

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

### Slide 6: How Sammati lines up with the Act's principles
**Title:** Aligned with the principles. Not certified.
**Content:**
- Notice and consent: itemised plain-language purposes, a separate choice per purpose, nothing pre-ticked, in English, Hindi and Kannada (the seed's Hindi and Kannada purpose text is still being reviewed).
- Withdrawal and erasure: two taps to withdraw, the company's next request is blocked, the sealed copy is erased, processors are told and acknowledge on chain.
- Consent-manager role: accountable to the person (only her signature changes consent); Core never receives the data it manages.
- Honest gaps: simulated enclave, demo-held keys, no breach flow, no children's data, no correction or nomination.
- Footer: "28 obligations mapped: 10 implemented, 12 partial, 6 out of scope. Every legal point is marked VERIFY until checked. docs/dpdp-mapping.md"

**Speaker Notes:**
*20 seconds. "We mapped the Act's obligations to what we built, and we put the gaps on the same slide. We say aligned with the principles, not compliant: nobody has certified this, and every legal point we haven't checked against the official text is marked for a lawyer to verify."*

### Slide 7: The Team
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

**Be honest about the demo shortcuts.**
"Company and processor keys are held by our core service for the demo. In production each company holds its own keys. The Sammati Processor is a simulated enclave: a separate service with an in-memory key, not real hardware protection."

**Who can read the data?**
"The customer, and the Processor for the second it takes to compute a decision. The company, our core service, the auditor and any database see ciphertext or a reference number. Core never receives the encrypted data and holds no key."

**Is the Processor trusted?**
"In this build yes, and we say so: a separate service with an in-memory key. Production runs it in a hardware enclave (AWS Nitro or Intel SGX) with remote attestation, so even its operator cannot read the data."

**What stops the company from calling the Processor for another purpose?**
"The envelope is bound to one purpose, every call is checked against the chain for the purpose it names, and every call is an anchored log entry."

**What happens on withdrawal?**
"The next request gets a 451, and the Processor erases the encrypted copy. The data is gone, not just locked."

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
