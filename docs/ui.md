# UI Spec — Sammati

## 1. Design direction
**Concept: "Consent as a receipt you can hold."** Familiar like GPay (white surfaces, big rounded actions, bottom nav), but the memorable element is the **Consent Pass**: each company is a card-like pass whose purposes are switches, and a withdrawal visibly *cuts the pass* (the purpose row greys out and the company's next request turns red on screen). Spend boldness there; keep everything else quiet.

Avoid: cream and terracotta, black plus neon, identical grey-shadow card grids, all-caps labels on everything, decorative gradients.

### 1.1 Tokens

| Token | Hex | Use |
|---|---|---|
| `ink` | `#16173F` | Primary text, app bar, primary buttons (deep indigo-night) |
| `marigold` | `#F4A300` | Brand accent, scan button, highlights |
| `paper` | `#F6F7FB` | App background |
| `surface` | `#FFFFFF` | Cards, sheets |
| `allow` | `#12805C` | ALLOWED, active consent |
| `block` | `#C8283B` | BLOCKED, withdrawn, tamper alerts |
| `mute` | `#6B6F8C` | Secondary text |
| `line` | `#E3E5F0` | Dividers |

Company identity colours (pass headers): QuickLoan `#2F5BEA`, MediCare+ `#0E9AA7`, FoodRush `#E4572E`.

### 1.2 Type
- **UI:** Manrope (400, 500, 700, 800). **Indic fallbacks:** Noto Sans Devanagari, Noto Sans Kannada, loaded and tested on the phone.
- **Hashes and tx ids:** IBM Plex Mono, shortened as `0x4f2a…9be1`, tap to copy.
- Scale (wallet): 28 / 20 / 16 / 14 / 12. Sentence case everywhere. Minimum body size 14, touch targets at least 48 dp.

### 1.3 Shape and motion
- Radius: 20 on passes and sheets, 14 on rows, 999 on switches and the scan button. Do not use one radius for everything.
- Motion only on user action or a real event: switch flip, pass-cut animation on withdraw (row slides to grey, 250 ms), live feed row inserting from top with a brief colour wash (green or red). No page-load choreography. Respect reduced-motion.

## 2. Wallet screens (Flutter)

### W0 Splash and onboarding
- Splash with logo only. Onboarding: 3 short screens ("See every company that has your consent", "Say yes to a purpose, not to everything", "Withdraw in one tap").
- Language picker first (English, हिन्दी, ಕನ್ನಡ).
- Create wallet: "Secure with fingerprint or PIN". No jargon.

### W1 Home (bottom nav: Consents · Activity · Scan · Rights · Me)
```
┌──────────────────────────┐
│ Namaste, Asha     🔔  EN │
│ 3 companies · 7 active   │
│ ┌──────────────────────┐ │
│ │ QuickLoan      (blue)│ │
│ │ ● Credit check  Active│ │
│ │ ○ Marketing  Withdrawn│ │
│ │ ● Bureau share Active │ │
│ │ Expires in 5 months   │ │
│ └──────────────────────┘ │
│ [MediCare+ pass] [FoodRush pass]
│                  ( ⌖ Scan ) ← large marigold centre button
└──────────────────────────┘
```
Empty state: "No companies yet. Scan a QR code to connect your first one."

### W2 Scan
Camera full screen, QR frame, torch toggle. On success: haptic and slide to W3.

### W3 Consent notice
- Header: company name, sector, "Asking for 3 purposes".
- Per purpose: title, one-sentence plain description, data categories as small chips, retention ("kept for 12 months"), third-party sharing flag in `block`-tinted chip when true, expiry dropdown, switch (default off).
- Required-for-service purposes are labelled "Needed for the service".
- Footer: "You can withdraw any purpose later, as easily as you gave it." Primary button "Give consent (2)" showing count; disabled when nothing is on.
- On tap: biometric prompt, then W4.

### W4 Confirmation
Animated stamp, then a receipt: company, purposes, expiry, ledger tx (short, copyable), "Recorded on the ledger". Buttons: "View proof", "Done".

### W5 Company pass detail
- Purpose list with switches, expiry, last used, count of accesses.
- Withdraw flow: flip switch off, bottom sheet "Stop QuickLoan using your data for marketing? They will be blocked right away." Buttons "Withdraw" (red) and "Keep". Result: pass-cut animation and a toast "Withdrawn. QuickLoan blocked."
- Below: **Cascade** section: "Also told: AdPartnerQ ✓ 2 s ago, CreditBureauX waiting…" filling live.

### W6 Activity
- Live feed rows: company dot, purpose, "Credit check · QuickLoan", ALLOWED (green) or BLOCKED (red) chip, time. New items appear at the top.
- Filter chips: All, Allowed, Blocked, by company.
- Tap row opens proof sheet (W7).

### W7 Proof sheet
- Plain sentence first: "This access was recorded and locked on the ledger."
- Rows: record hash, batch anchor tx, Merkle check "Verified ✓" (runs locally, shows green after check), "Open in block explorer".
- For consent receipts: signer (you), ledger head, tx, explorer link.

### W8 Rights
Three actions: "See what a company holds" (access), "Ask a company to erase data" (erasure), "Raise a complaint" (grievance). Each opens a short form (company, note) and shows status: Open, In progress, Resolved.

### W9 Me
Language, security (biometric), wallet address (copy), developer settings (Core URL, network), about.

### Edge states
Offline banner "No connection. Showing last known consents."; expired consent chip "Expired 3 days ago, give consent again"; QR from a different network "Could not reach Sammati. Check Wi-Fi."; failed transaction "Could not record this. Try again" with retry.

## 3. Company Console (web)

Layout: left rail (Overview, Purposes, Consents, Live requests, Processors, Evidence), top bar with company switcher (QuickLoan, MediCare+, FoodRush).

- **Overview:** four numbers (active consents, allowed today, blocked today, last anchor), live feed beside a small consent trend chart.
- **Purposes:** table plus "Add purpose" drawer (code, plain description in 3 languages, categories, retention, sharing flag).
- **New consent request:** choose customer alias and purposes, large QR on right. "Waiting for scan…" then "Consent received" with tx.
- **Live requests:** two-column. Left: **Simulator** with big buttons ("Run credit check", "Send marketing SMS", "Share with bureau") firing real requests. Right: feed with ALLOWED/BLOCKED, reason code, latency. Blocked rows use `block` left border and show "451 · Consent withdrawn".
- **Consents:** table of customers by purpose with status, filterable.
- **Processors:** per purpose list, ack state and time.
- **Evidence:** "Generate compliance pack" button, preview, download.

## 4. Auditor (web)

- **Home:** one card per company with a compliance scorecard (grants, withdrawals, allowed, blocked, avg withdrawal-to-block latency, pending acknowledgements, integrity status).
- **Ledger explorer:** reverse-chronological table with type, principal alias (short address), company, purpose, tx, ledger head; filters on top.
- **Verify integrity:** button per company. Progress rows "Recomputing hash chain… Rebuilding Merkle roots… Comparing with chain anchors…". Result: green "All 148 records match 7 anchors" or red "Mismatch in batch 4, record 63" with a diff of the stored vs expected hash. This is the second hero moment of the demo.
- **Report:** printable page: company, period, verification result, evidence list, anchor links.

## 5. Stage view (`/stage`, for the live demo)
Single screen for the projector: left column "Citizen" (live mirror of the phone via scrcpy window beside it, plus a feed of wallet events), centre three columns for QuickLoan, MediCare+, FoodRush showing live request feeds, right column a ledger ticker (tx, ledger head). A thin banner at top: current act of the demo script (optional presenter hint). Large type, high contrast, visible from the back of the room.

## 6. Copy and i18n

Voice: plain verbs, sentence case, describe what happens. Errors state what went wrong and what to do, no apologising. An action keeps one name through the flow ("Withdraw" button, "Withdrawn" toast).

| Key | English | Hindi | Kannada |
|---|---|---|---|
| give_consent | Give consent | सहमति दें | ಒಪ್ಪಿಗೆ ನೀಡಿ |
| withdraw | Withdraw | वापस लें | ಹಿಂಪಡೆಯಿರಿ |
| withdrawn_blocked | Withdrawn. {company} is blocked. | वापस ली गई। {company} रोका गया। | ಹಿಂಪಡೆಯಲಾಗಿದೆ. {company} ನಿರ್ಬಂಧಿಸಲಾಗಿದೆ. |
| allowed | Allowed | अनुमति दी गई | ಅನುಮತಿಸಲಾಗಿದೆ |
| blocked | Blocked | रोका गया | ನಿರ್ಬಂಧಿಸಲಾಗಿದೆ |
| scan_to_connect | Scan to connect | कनेक्ट करने के लिए स्कैन करें | ಸಂಪರ್ಕಿಸಲು ಸ್ಕ್ಯಾನ್ ಮಾಡಿ |
| withdraw_easy | You can withdraw any purpose later, as easily as you gave it. | आप बाद में किसी भी उद्देश्य की सहमति उतनी ही आसानी से वापस ले सकते हैं। | ನೀವು ನಂತರ ಯಾವುದೇ ಉದ್ದೇಶದ ಒಪ್ಪಿಗೆಯನ್ನು ನೀಡಿದಷ್ಟೇ ಸುಲಭವಾಗಿ ಹಿಂಪಡೆಯಬಹುದು. |
| recorded | Recorded on the ledger | लेजर पर दर्ज | ಲೆಡ್ಜರ್‌ನಲ್ಲಿ ದಾಖಲಾಗಿದೆ |

Have a native speaker check every Hindi and Kannada string, including purpose descriptions, before the demo.

## 7. Accessibility and quality floor
- Contrast AA minimum; status never relies on colour alone (chips carry text and icon).
- Screen-reader labels on switches ("Credit check, QuickLoan, on").
- Reduced motion disables the pass-cut animation, leaving an instant state change.
- Test on a real mid-range Android phone in bright light.
