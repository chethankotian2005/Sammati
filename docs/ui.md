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

### V1 My demo details (V-01, V-06), opened from W9 Me
- Read-only card with the fictional profile: PAN `ABCDE1234F` (IBM Plex Mono), income `6-9 LPA`, credit score `742`.
- Note under it: "Made-up details for the demo. They stay on this phone and are encrypted before they are sent anywhere."
- A quiet footer line, `mute` colour, always shown: "Demo processor (simulated enclave, not real hardware protection)". The simulation is never presented as production security.
- No edit, no copy, no share. It is the only place in the app where the plaintext appears.

### V2 Send securely, on W5 pass detail (V-01, V-04, V-06)
Only on a purpose in `VAULT_PURPOSES` (`credit_check`) while it is Active. Under that purpose row:
- Idle: text button "Send securely" (48 dp) and the hint "{company} gets a decision, not your details. Only the Sammati Processor can open them." Tap: device-credential prompt (`auth_reason_vault`), then a progress line "Encrypting and sending…".
- Sent: `allow`-coloured line with a lock icon, "Sent encrypted. {company} holds only a reference.", then the handle shortened (`0x4f2a…9be1`, tap to copy) and the button reads "Send again" (a new envelope replaces the old one).
- Erased: when `vault.erased` arrives, or the purpose is withdrawn, the line turns `mute` and reads "Your encrypted details were erased." The button is gone while the purpose is withdrawn. Withdrawing needs no extra step: the existing two-tap withdraw is what erases.
- Failed: `block`-coloured line "Could not send securely. Try again." with the existing retry pattern. Core or Processor unreachable uses `error_unreachable`.
- The vault never changes the pass-cut animation or the cascade list.

### Edge states
Offline banner "No connection. Showing last known consents."; expired consent chip "Expired 3 days ago, give consent again"; QR from a different network "Could not reach Sammati. Check Wi-Fi."; failed transaction "Could not record this. Try again" with retry.

## 3. Company Console (web)

Layout: left rail (Overview, Purposes, Consents, Live requests, Processors, Evidence), top bar with company switcher (QuickLoan, MediCare+, FoodRush).

- **Overview:** four numbers (active consents, allowed today, blocked today, last anchor), live feed beside a small consent trend chart.
- **Purposes:** table plus "Add purpose" drawer (code, plain description in 3 languages, categories, retention, sharing flag).
- **New consent request:** choose customer alias and purposes, large QR on right. "Waiting for scan…" then "Consent received" with tx.
- **Live requests:** two-column. Left: **Simulator** with big buttons ("Run credit check", "Send marketing SMS", "Share with bureau") firing real requests. Right: feed with ALLOWED/BLOCKED, reason code, latency. Blocked rows use `block` left border and show "451 · Consent withdrawn".
- **Live requests, QuickLoan only (V-05, V-06):** the simulator gains **Run loan decision**. The result row reads "Approved · limit 3,00,000 · SCORE_FAIR" in `allow`, or "Declined · …" in `block`, or the usual "451 · Consent withdrawn". Beside the feed, a **What QuickLoan holds** card shows only what its backend has: handle (short, tap to copy), ciphertext hash, status `stored` / `erased`, and the sentence "QuickLoan staff cannot read this. Only the Sammati Processor can open it." A small timeline under it fills from the `vault.*` and `processor.*` events: Encrypted → Stored → Requested → Decrypting → Decided → Erased, each with its time. No screen of the console shows a PAN or an income. The card also carries the quiet "simulated enclave" label.
- **Consents:** table of customers by purpose with status, filterable.
- **Processors:** per purpose list, ack state and time.
- **Evidence:** "Generate compliance pack" button, preview, download.

## 4. Auditor (web)

- **Home:** one card per company with a compliance scorecard (grants, withdrawals, allowed, blocked, avg withdrawal-to-block latency, pending acknowledgements, integrity status).
- **Ledger explorer:** reverse-chronological table with type, principal alias (short address), company, purpose, tx, ledger head; filters on top.
- **Verify integrity:** button per company. Progress rows "Recomputing hash chain… Rebuilding Merkle roots… Comparing with chain anchors…". Result: green "All 148 records match 7 anchors" or red "Mismatch in batch 4, record 63" with a diff of the stored vs expected hash. This is the second hero moment of the demo.
- **Report:** printable page: company, period, verification result, evidence list, anchor links.

## 5. Stage view (`/stage`, for the live demo)
Single screen for the projector: left column "Citizen" (live mirror of the phone via scrcpy window beside it, plus a feed of wallet events), centre three columns for QuickLoan, MediCare+, FoodRush showing live request feeds, right column a ledger ticker (tx, ledger head). The QuickLoan column also shows the confidential-processing timeline (the same chips as the console card, handle shortened) so the audience watches the data go in encrypted, a decision come out and the ciphertext vanish on withdrawal. A thin banner at top: current act of the demo script (optional presenter hint). Large type, high contrast, visible from the back of the room.

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

### 6.1 Shell keys (wallet)

Added with the app shell. Hindi and Kannada are first drafts and need the native-speaker check below. Language names are shown in their own script in every locale.

| Key | English | Hindi | Kannada |
|---|---|---|---|
| nav_consents | Consents | सहमतियाँ | ಒಪ್ಪಿಗೆಗಳು |
| nav_activity | Activity | गतिविधि | ಚಟುವಟಿಕೆ |
| nav_scan | Scan | स्कैन | ಸ್ಕ್ಯಾನ್ |
| nav_rights | Rights | अधिकार | ಹಕ್ಕುಗಳು |
| nav_me | Me | मैं | ನಾನು |
| consents_empty | No companies yet. Scan a QR code to connect your first one. | अभी कोई कंपनी नहीं। अपनी पहली कंपनी जोड़ने के लिए QR कोड स्कैन करें। | ಇನ್ನೂ ಯಾವುದೇ ಕಂಪನಿ ಇಲ್ಲ. ನಿಮ್ಮ ಮೊದಲ ಕಂಪನಿಯನ್ನು ಸಂಪರ್ಕಿಸಲು QR ಕೋಡ್ ಸ್ಕ್ಯಾನ್ ಮಾಡಿ. |
| activity_empty | No activity yet. Data access by companies will appear here. | अभी कोई गतिविधि नहीं। कंपनियों द्वारा डेटा का उपयोग यहाँ दिखेगा। | ಇನ್ನೂ ಯಾವುದೇ ಚಟುವಟಿಕೆ ಇಲ್ಲ. ಕಂಪನಿಗಳು ಡೇಟಾ ಬಳಸಿದಾಗ ಇಲ್ಲಿ ಕಾಣಿಸುತ್ತದೆ. |
| rights_access | See what a company holds | देखें कि कंपनी के पास क्या है | ಕಂಪನಿಯ ಬಳಿ ಏನಿದೆ ಎಂದು ನೋಡಿ |
| rights_erasure | Ask a company to erase data | कंपनी से डेटा मिटाने को कहें | ಡೇಟಾ ಅಳಿಸಲು ಕಂಪನಿಗೆ ಕೇಳಿ |
| rights_grievance | Raise a complaint | शिकायत दर्ज करें | ದೂರು ಸಲ್ಲಿಸಿ |
| me_language | Language | भाषा | ಭಾಷೆ |
| language_english | English | English | English |
| language_hindi | हिन्दी | हिन्दी | हिन्दी |
| language_kannada | ಕನ್ನಡ | ಕನ್ನಡ | ಕನ್ನಡ |
| me_developer | Developer settings | डेवलपर सेटिंग्स | ಡೆವಲಪರ್ ಸೆಟ್ಟಿಂಗ್‌ಗಳು |
| dev_core_url | Core URL | Core URL | Core URL |
| dev_core_url_hint | Address of the Sammati Core on your Wi-Fi, for example http://192.168.1.5:4000 | आपके Wi-Fi पर Sammati Core का पता, जैसे http://192.168.1.5:4000 | ನಿಮ್ಮ Wi-Fi ನಲ್ಲಿರುವ Sammati Core ವಿಳಾಸ, ಉದಾಹರಣೆಗೆ http://192.168.1.5:4000 |
| dev_core_url_invalid | Enter a full address starting with http:// or https:// | http:// या https:// से शुरू होने वाला पूरा पता दर्ज करें | http:// ಅಥವಾ https:// ನಿಂದ ಪ್ರಾರಂಭವಾಗುವ ಪೂರ್ಣ ವಿಳಾಸ ನಮೂದಿಸಿ |
| dev_save | Save | सहेजें | ಉಳಿಸಿ |
| dev_saved | Saved | सहेजा गया | ಉಳಿಸಲಾಗಿದೆ |

Onboarding and wallet creation (W0), same status as above:

| Key | English | Hindi | Kannada |
|---|---|---|---|
| language_title | Choose your language | अपनी भाषा चुनें | ನಿಮ್ಮ ಭಾಷೆಯನ್ನು ಆಯ್ಕೆಮಾಡಿ |
| onb_continue | Continue | आगे बढ़ें | ಮುಂದುವರಿಸಿ |
| onb_next | Next | अगला | ಮುಂದೆ |
| onb_1 | See every company that has your consent | देखें किन कंपनियों के पास आपकी सहमति है | ನಿಮ್ಮ ಒಪ್ಪಿಗೆ ಹೊಂದಿರುವ ಪ್ರತಿ ಕಂಪನಿಯನ್ನು ನೋಡಿ |
| onb_2 | Say yes to a purpose, not to everything | हर चीज़ को नहीं, सिर्फ़ एक उद्देश्य को हाँ कहें | ಎಲ್ಲದಕ್ಕೂ ಅಲ್ಲ, ಒಂದು ಉದ್ದೇಶಕ್ಕೆ ಮಾತ್ರ ಹೌದು ಎನ್ನಿ |
| onb_3 | Withdraw in one tap | एक टैप में वापस लें | ಒಂದೇ ಟ್ಯಾಪ್‌ನಲ್ಲಿ ಹಿಂಪಡೆಯಿರಿ |
| wallet_create_title | Secure with fingerprint or PIN | फ़िंगरप्रिंट या PIN से सुरक्षित करें | ಫಿಂಗರ್‌ಪ್ರಿಂಟ್ ಅಥವಾ PIN ಮೂಲಕ ಸುರಕ್ಷಿತಗೊಳಿಸಿ |
| wallet_create_body | Your consents are signed on this phone. Only you can approve them. | आपकी सहमतियाँ इसी फ़ोन पर साइन होती हैं। इन्हें सिर्फ़ आप मंज़ूर कर सकते हैं। | ನಿಮ್ಮ ಒಪ್ಪಿಗೆಗಳಿಗೆ ಈ ಫೋನ್‌ನಲ್ಲೇ ಸಹಿ ಹಾಕಲಾಗುತ್ತದೆ. ನೀವು ಮಾತ್ರ ಅವುಗಳನ್ನು ಅನುಮೋದಿಸಬಹುದು. |
| wallet_create_button | Create wallet | वॉलेट बनाएँ | ವಾಲೆಟ್ ರಚಿಸಿ |
| wallet_no_lock | Set a screen lock on this phone, then try again. | इस फ़ोन पर स्क्रीन लॉक सेट करें, फिर दोबारा कोशिश करें। | ಈ ಫೋನ್‌ನಲ್ಲಿ ಸ್ಕ್ರೀನ್ ಲಾಕ್ ಹೊಂದಿಸಿ, ನಂತರ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ. |
| wallet_auth_failed | Could not confirm it is you. Try again. | पुष्टि नहीं हो सकी कि यह आप हैं। दोबारा कोशिश करें। | ಇದು ನೀವೇ ಎಂದು ದೃಢಪಡಿಸಲಾಗಲಿಲ್ಲ. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ. |
| wallet_create_failed | Could not create the wallet. Try again. | वॉलेट नहीं बन सका। दोबारा कोशिश करें। | ವಾಲೆಟ್ ರಚಿಸಲಾಗಲಿಲ್ಲ. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ. |
| auth_reason_create | Confirm to create your wallet | अपना वॉलेट बनाने के लिए पुष्टि करें | ನಿಮ್ಮ ವಾಲೆಟ್ ರಚಿಸಲು ದೃಢೀಕರಿಸಿ |
| auth_reason_sign | Confirm to approve this | इसे मंज़ूर करने के लिए पुष्टि करें | ಇದನ್ನು ಅನುಮೋದಿಸಲು ದೃಢೀಕರಿಸಿ |
| me_wallet_address | Wallet address | वॉलेट पता | ವಾಲೆಟ್ ವಿಳಾಸ |
| copied | Copied | कॉपी किया गया | ನಕಲಿಸಲಾಗಿದೆ |

Scan, consent notice (W2, W3) and receipt (W4), same status as above. `{count}`, `{days}`, `{months}`, `{purpose}`, `{company}` and `{date}` are placeholders; the counted keys use ICU plurals in the ARB files:

| Key | English | Hindi | Kannada |
|---|---|---|---|
| scan_hint | Point the camera at the company's QR code. | कैमरे को कंपनी के QR कोड की ओर रखें। | ಕ್ಯಾಮೆರಾವನ್ನು ಕಂಪನಿಯ QR ಕೋಡ್‌ನತ್ತ ಹಿಡಿಯಿರಿ. |
| scan_torch | Torch | टॉर्च | ಟಾರ್ಚ್ |
| scan_camera_denied | Allow camera access to scan QR codes. | QR कोड स्कैन करने के लिए कैमरे की अनुमति दें। | QR ಕೋಡ್ ಸ್ಕ್ಯಾನ್ ಮಾಡಲು ಕ್ಯಾಮೆರಾ ಅನುಮತಿ ನೀಡಿ. |
| scan_invalid_qr | This is not a Sammati QR code. | यह Sammati का QR कोड नहीं है। | ಇದು Sammati QR ಕೋಡ್ ಅಲ್ಲ. |
| error_unreachable | Could not reach Sammati. Check Wi-Fi. | Sammati तक नहीं पहुँच सके। Wi-Fi जाँचें। | Sammati ಅನ್ನು ತಲುಪಲಾಗಲಿಲ್ಲ. Wi-Fi ಪರಿಶೀಲಿಸಿ. |
| request_gone | This request is no longer valid. Ask the company for a new QR code. | यह अनुरोध अब मान्य नहीं है। कंपनी से नया QR कोड माँगें। | ಈ ವಿನಂತಿ ಇನ್ನು ಮಾನ್ಯವಾಗಿಲ್ಲ. ಕಂಪನಿಯಿಂದ ಹೊಸ QR ಕೋಡ್ ಕೇಳಿ. |
| notice_mismatch | This notice could not be verified, so nothing was signed. Ask the company for a new QR code. | यह सूचना सत्यापित नहीं हो सकी, इसलिए कुछ भी साइन नहीं हुआ। कंपनी से नया QR कोड माँगें। | ಈ ಸೂಚನೆಯನ್ನು ಪರಿಶೀಲಿಸಲಾಗಲಿಲ್ಲ, ಆದ್ದರಿಂದ ಏನನ್ನೂ ಸಹಿ ಮಾಡಿಲ್ಲ. ಕಂಪನಿಯಿಂದ ಹೊಸ QR ಕೋಡ್ ಕೇಳಿ. |
| grant_failed | Could not record this. Try again. | इसे दर्ज नहीं कर सके। दोबारा कोशिश करें। | ಇದನ್ನು ದಾಖಲಿಸಲಾಗಲಿಲ್ಲ. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ. |
| retry | Try again | दोबारा कोशिश करें | ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ |
| asking_for_purposes | {count, plural, =1{Asking for 1 purpose} other{Asking for {count} purposes}} | {count, plural, other{{count} उद्देश्यों के लिए पूछ रहे हैं}} | {count, plural, other{{count} ಉದ್ದೇಶಗಳಿಗಾಗಿ ಕೇಳುತ್ತಿದೆ}} |
| give_consent_count | Give consent ({count}) | सहमति दें ({count}) | ಒಪ್ಪಿಗೆ ನೀಡಿ ({count}) |
| needed_for_service | Needed for the service | सेवा के लिए ज़रूरी | ಸೇವೆಗೆ ಅಗತ್ಯ |
| shares_third_party | Shared with third parties | तीसरे पक्ष के साथ साझा | ಮೂರನೇ ಪಕ್ಷಗಳೊಂದಿಗೆ ಹಂಚಲಾಗುತ್ತದೆ |
| retention_days | {days, plural, =1{kept for 1 day} other{kept for {days} days}} | {days, plural, other{{days} दिन रखा जाएगा}} | {days, plural, other{{days} ದಿನಗಳ ಕಾಲ ಇರಿಸಲಾಗುತ್ತದೆ}} |
| retention_months | {months, plural, =1{kept for 1 month} other{kept for {months} months}} | {months, plural, other{{months} महीने रखा जाएगा}} | {months, plural, other{{months} ತಿಂಗಳು ಇರಿಸಲಾಗುತ್ತದೆ}} |
| expiry_label | Consent lasts | सहमति की अवधि | ಒಪ್ಪಿಗೆಯ ಅವಧಿ |
| expiry_30d | 30 days | 30 दिन | 30 ದಿನಗಳು |
| expiry_6m | 6 months | 6 महीने | 6 ತಿಂಗಳು |
| expiry_1y | 1 year | 1 साल | 1 ವರ್ಷ |
| purpose_switch_label | {purpose}, {company} | {purpose}, {company} | {purpose}, {company} |
| receipt_expires | Valid until {date} | {date} तक मान्य | {date} ವರೆಗೆ ಮಾನ್ಯ |
| receipt_tx | Ledger transaction | लेजर लेन-देन | ಲೆಡ್ಜರ್ ವಹಿವಾಟು |
| done | Done | हो गया | ಮುಗಿಯಿತು |
| error_generic | Something went wrong. Try again. | कुछ गड़बड़ हो गई। दोबारा कोशिश करें। | ಏನೋ ತಪ್ಪಾಗಿದೆ. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ. |

Consent home (W1) and pass detail (W5), same status as above. Counted keys use ICU plurals in the ARB files; the withdraw sheet text and its two buttons (`withdraw`, `keep`) follow the W5 spec:

| Key | English | Hindi | Kannada |
|---|---|---|---|
| consents_summary | {companies, plural, =1{1 company · {active} active} other{{companies} companies · {active} active}} | {companies, plural, other{{companies} कंपनियाँ · {active} सक्रिय}} | {companies, plural, other{{companies} ಕಂಪನಿಗಳು · {active} ಸಕ್ರಿಯ}} |
| status_active | Active | सक्रिय | ಸಕ್ರಿಯ |
| status_expired | Expired | समाप्त | ಅವಧಿ ಮುಗಿದಿದೆ |
| status_withdrawn | Withdrawn | वापस ली गई | ಹಿಂಪಡೆಯಲಾಗಿದೆ |
| expired_ago | {days, plural, =0{Expired today, give consent again} =1{Expired 1 day ago, give consent again} other{Expired {days} days ago, give consent again}} | {days, plural, other{{days} दिन पहले समाप्त, फिर से सहमति दें}} | {days, plural, other{{days} ದಿನಗಳ ಹಿಂದೆ ಅವಧಿ ಮುಗಿದಿದೆ, ಮತ್ತೆ ಒಪ್ಪಿಗೆ ನೀಡಿ}} |
| expires_in_days | {days, plural, =1{Expires in 1 day} other{Expires in {days} days}} | {days, plural, other{{days} दिन में समाप्त}} | {days, plural, other{{days} ದಿನಗಳಲ್ಲಿ ಅವಧಿ ಮುಗಿಯುತ್ತದೆ}} |
| expires_in_months | {months, plural, =1{Expires in 1 month} other{Expires in {months} months}} | {months, plural, other{{months} महीने में समाप्त}} | {months, plural, other{{months} ತಿಂಗಳಲ್ಲಿ ಅವಧಿ ಮುಗಿಯುತ್ತದೆ}} |
| offline_banner | No connection. Showing last known consents. | कनेक्शन नहीं है। पिछली ज्ञात सहमतियाँ दिख रही हैं। | ಸಂಪರ್ಕವಿಲ್ಲ. ಕೊನೆಯ ತಿಳಿದ ಒಪ್ಪಿಗೆಗಳನ್ನು ತೋರಿಸಲಾಗುತ್ತಿದೆ. |
| withdraw_confirm | Stop {company} using your data for {purpose}? They will be blocked right away. | {company} को {purpose} के लिए आपका डेटा इस्तेमाल करने से रोकें? उन्हें तुरंत रोक दिया जाएगा। | {purpose} ಗಾಗಿ {company} ನಿಮ್ಮ ಡೇಟಾ ಬಳಸುವುದನ್ನು ನಿಲ್ಲಿಸಬೇಕೇ? ಅವರನ್ನು ತಕ್ಷಣ ನಿರ್ಬಂಧಿಸಲಾಗುತ್ತದೆ. |
| keep | Keep | रखें | ಇರಿಸಿ |
| auth_reason_withdraw | Confirm to withdraw consent | सहमति वापस लेने के लिए पुष्टि करें | ಒಪ್ಪಿಗೆ ಹಿಂಪಡೆಯಲು ದೃಢೀಕರಿಸಿ |

Activity feed (W6), same status as above. The decision chips reuse `allowed` and `blocked`; the `reason_*` lines explain a blocked row and map one-to-one to the five reason codes (`CONSENT_WITHDRAWN`, `CONSENT_EXPIRED`, `NO_CONSENT`, `LEDGER_UNAVAILABLE`, `NO_PRINCIPAL`):

| Key | English | Hindi | Kannada |
|---|---|---|---|
| filter_all | All | सभी | ಎಲ್ಲಾ |
| reason_consent_withdrawn | Consent withdrawn | सहमति वापस ली गई | ಒಪ್ಪಿಗೆ ಹಿಂಪಡೆಯಲಾಗಿದೆ |
| reason_consent_expired | Consent expired | सहमति समाप्त | ಒಪ್ಪಿಗೆ ಅವಧಿ ಮುಗಿದಿದೆ |
| reason_no_consent | No consent given | सहमति नहीं दी गई | ಒಪ್ಪಿಗೆ ನೀಡಿಲ್ಲ |
| reason_ledger_unavailable | Could not check consent, so blocked | सहमति जाँच नहीं हो सकी, इसलिए रोका गया | ಒಪ್ಪಿಗೆ ಪರಿಶೀಲಿಸಲಾಗಲಿಲ್ಲ, ಆದ್ದರಿಂದ ನಿರ್ಬಂಧಿಸಲಾಗಿದೆ |
| reason_no_principal | Could not tell whose data this was | यह पता नहीं चला कि डेटा किसका था | ಇದು ಯಾರ ಡೇಟಾ ಎಂದು ತಿಳಿಯಲಿಲ್ಲ |
| time_now | Just now | अभी अभी | ಈಗಷ್ಟೇ |
| time_seconds | {n} s ago | {n} सेकंड पहले | {n} ಸೆಕೆಂಡ್ ಹಿಂದೆ |
| time_minutes | {n} min ago | {n} मिनट पहले | {n} ನಿಮಿಷ ಹಿಂದೆ |
| time_hours | {n} h ago | {n} घंटे पहले | {n} ಗಂಟೆ ಹಿಂದೆ |
| time_days | {n} d ago | {n} दिन पहले | {n} ದಿನ ಹಿಂದೆ |
| activity_row_label | {purpose}, {company}, {decision}, {time} | {purpose}, {company}, {decision}, {time} | {purpose}, {company}, {decision}, {time} |
| offline_activity_banner | No connection. Showing last known activity. | कनेक्शन नहीं है। पिछली ज्ञात गतिविधि दिख रही है। | ಸಂಪರ್ಕವಿಲ್ಲ. ಕೊನೆಯ ತಿಳಿದ ಚಟುವಟಿಕೆಯನ್ನು ತೋರಿಸಲಾಗುತ್ತಿದೆ. |

Confidential processing (V1, V2), same status as above. `{company}` is a placeholder. `PAN` and `Processor` are kept as names in all three languages. The console strings are English only.

| Key | English | Hindi | Kannada |
|---|---|---|---|
| vault_profile_title | My demo details | मेरा डेमो विवरण | ನನ್ನ ಡೆಮೊ ವಿವರಗಳು |
| vault_profile_note | Made-up details for the demo. They stay on this phone and are encrypted before they are sent anywhere. | डेमो के लिए बनाए गए विवरण। ये इसी फ़ोन पर रहते हैं और कहीं भी भेजने से पहले एन्क्रिप्ट हो जाते हैं। | ಡೆಮೊಗಾಗಿ ಮಾಡಿದ ವಿವರಗಳು. ಇವು ಈ ಫೋನ್‌ನಲ್ಲೇ ಇರುತ್ತವೆ ಮತ್ತು ಎಲ್ಲಿಗಾದರೂ ಕಳುಹಿಸುವ ಮೊದಲು ಎನ್‌ಕ್ರಿಪ್ಟ್ ಆಗುತ್ತವೆ. |
| vault_pan | PAN | PAN | PAN |
| vault_income | Income | आय | ಆದಾಯ |
| vault_score | Credit score | क्रेडिट स्कोर | ಕ್ರೆಡಿಟ್ ಸ್ಕೋರ್ |
| vault_simulated | Demo processor (simulated enclave, not real hardware protection) | डेमो प्रोसेसर (सिम्युलेटेड एन्क्लेव, असली हार्डवेयर सुरक्षा नहीं) | ಡೆಮೊ ಪ್ರೊಸೆಸರ್ (ಸಿಮ್ಯುಲೇಟೆಡ್ ಎನ್‌ಕ್ಲೇವ್, ನಿಜವಾದ ಹಾರ್ಡ್‌ವೇರ್ ರಕ್ಷಣೆ ಅಲ್ಲ) |
| vault_send | Send securely | सुरक्षित रूप से भेजें | ಸುರಕ್ಷಿತವಾಗಿ ಕಳುಹಿಸಿ |
| vault_send_again | Send again | दोबारा भेजें | ಮತ್ತೆ ಕಳುಹಿಸಿ |
| vault_send_hint | {company} gets a decision, not your details. Only the Sammati Processor can open them. | {company} को फ़ैसला मिलता है, आपका विवरण नहीं। उन्हें सिर्फ़ Sammati Processor खोल सकता है। | {company} ಗೆ ನಿರ್ಧಾರ ಸಿಗುತ್ತದೆ, ನಿಮ್ಮ ವಿವರಗಳಲ್ಲ. ಅವುಗಳನ್ನು Sammati Processor ಮಾತ್ರ ತೆರೆಯಬಹುದು. |
| vault_sending | Encrypting and sending… | एन्क्रिप्ट करके भेज रहे हैं… | ಎನ್‌ಕ್ರಿಪ್ಟ್ ಮಾಡಿ ಕಳುಹಿಸಲಾಗುತ್ತಿದೆ… |
| vault_sent | Sent encrypted. {company} holds only a reference. | एन्क्रिप्ट करके भेजा गया। {company} के पास सिर्फ़ एक संदर्भ है। | ಎನ್‌ಕ್ರಿಪ್ಟ್ ಮಾಡಿ ಕಳುಹಿಸಲಾಗಿದೆ. {company} ಬಳಿ ಕೇವಲ ಒಂದು ಉಲ್ಲೇಖವಿದೆ. |
| vault_erased | Your encrypted details were erased. | आपका एन्क्रिप्टेड विवरण मिटा दिया गया। | ನಿಮ್ಮ ಎನ್‌ಕ್ರಿಪ್ಟ್ ಮಾಡಿದ ವಿವರಗಳನ್ನು ಅಳಿಸಲಾಗಿದೆ. |
| vault_failed | Could not send securely. Try again. | सुरक्षित रूप से नहीं भेज सके। दोबारा कोशिश करें। | ಸುರಕ್ಷಿತವಾಗಿ ಕಳುಹಿಸಲಾಗಲಿಲ್ಲ. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ. |
| auth_reason_vault | Confirm to send your details securely | अपना विवरण सुरक्षित भेजने के लिए पुष्टि करें | ನಿಮ್ಮ ವಿವರಗಳನ್ನು ಸುರಕ್ಷಿತವಾಗಿ ಕಳುಹಿಸಲು ದೃಢೀಕರಿಸಿ |

Have a native speaker check every Hindi and Kannada string, including purpose descriptions, before the demo.

## 7. Accessibility and quality floor
- Contrast AA minimum; status never relies on colour alone (chips carry text and icon).
- Screen-reader labels on switches ("Credit check, QuickLoan, on").
- Reduced motion disables the pass-cut animation, leaving an instant state change.
- Test on a real mid-range Android phone in bright light.
