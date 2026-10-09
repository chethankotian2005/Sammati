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

A company has no colour of its own: pass headers, dots and chips use `ink` for every company (no company is built in, so none has a brand colour here).

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
- Then **W14 Create account** (W-15): choose a Sammati ID, secure with fingerprint or PIN, fill in your details. No jargon.

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
- Footer: "You can withdraw any purpose later, as easily as you gave it." Under it a text button "How this protects you" (L-02) that opens a bottom sheet, below. Primary button "Give consent (2)" showing count; disabled when nothing is on.
- **How this protects you** (bottom sheet, `protect_*` in §6): four short points that are each true of the build (nothing pre-ticked; withdraw in two taps and the next request is blocked; every use is recorded and an edit shows; sensitive details are encrypted on the phone, with the secure processor said to be simulated), then one note: a prototype with made-up data, "aligned with the principles of" the Act, not legal advice and not a certification, pointing at `docs/dpdp-mapping.md`. It makes no legal claim that the mapping marks VERIFY: no section numbers, no "compliant", no "certified". It adds no new switch or step to giving consent.
- On tap: biometric prompt, then W4.

### W4 Confirmation
Animated stamp, then a receipt: company, purposes, expiry, ledger tx (short, copyable), "Recorded on the ledger". Buttons: "View proof", "Done".

### W5 Company pass detail
- Purpose list with switches, expiry, last used, count of accesses.
- Withdraw flow: flip switch off, bottom sheet "Stop QuickLoan using your data for marketing? They will be blocked right away." Buttons "Withdraw" (red) and "Keep". Result: pass-cut animation and a toast "Withdrawn. QuickLoan blocked."
- **Your details changed** (W-17): when an edit in My details touched a field that was sent for this purpose and the consent is still Active, the purpose row carries a `marigold`-outlined note with the icon `sync_problem` and the text "Your details changed. Update what {company} holds?" with a **Update** button (48 dp). One tap: device-credential prompt, re-encrypt only the fields that purpose needs, re-submit; the note disappears when the Processor confirms (`vault.stored`). The same note appears under the company's card on W1. It never appears for a withdrawn or expired consent.
- Below: **Cascade** section: "Also told: AdPartnerQ ✓ 2 s ago, CreditBureauX waiting…" filling live.

### W6 Activity
- Live feed rows: company dot, purpose, "Credit check · QuickLoan", ALLOWED (green) or BLOCKED (red) chip, time. New items appear at the top.
- Filter chips: All, Allowed, Blocked, by company.
- Tap row opens proof sheet (W7).
- **Data-use rows (W-18).** When an entry has `dataCategories` (a Processor use), the row's sentence is "{company} used your {data} for {purpose}. Decision shared: {outcome}." (`activity_used`), where {data} lists the category labels in the app's language ("PAN and yearly income", `list_and`) and {outcome} is Approved or Declined in that language. A BLOCKED use reads "{company} tried to use your data for {purpose}. Blocked." (`activity_used_blocked`). Rows without categories keep their existing wording. A new row arrives within 2 seconds of the evaluation (the `access.logged` event).

### W7 Proof sheet
- **Data use block (W-18).** For an entry with `dataCategories` the sheet opens with a block "How your data was used" of four labelled rows: **What was used** (the categories), **Where it was stored** ("Encrypted at rest on the Processor. Ciphertext hash:" and the hash shortened `0x4f2a…9be1`, tap to copy; "Not recorded on this phone" when this phone has no record of sending), **Where it was processed** ("Sammati Processor (simulated enclave)"), **What left the Processor** ("Decision only: {outcome}. No details."). Then the existing rows below it: record hash, batch anchor, Merkle "Verified ✓", explorer link. Nothing in the block is a value; the sheet replaces the removed inspector page.
- Plain sentence first: "This access was recorded and locked on the ledger."
- Rows: record hash, batch anchor tx, Merkle check "Verified ✓" (runs locally, shows green after check), "Open in block explorer".
- For consent receipts: signer (you), ledger head, tx, explorer link.

### W8 Rights
Three actions: "See what a company holds" (access), "Ask a company to erase data" (erasure), "Raise a complaint" (grievance). Each opens a short form (company, note) and shows status: Open, In progress, Resolved.
The "See what a company holds" view returns real data per company: purposes, consent status, categories held (ids and labels), handles, ciphertext hashes. It also includes a "Download my data summary" button that compiles this data across all companies into a JSON and PDF on the phone (built from local profile and Core metadata; Core never gets the profile).

### W9 Me
Language, **My details** (W15), Your Sammati ID (W12), **Your Nominee** (W18), security (biometric), wallet address (copy), developer settings (see W9b), **About** (W16).

### W9b Developer settings (X-01), from W9 Me
A plain list screen titled "Developer settings", with a `mute` caption "For testing. Nothing here is needed to use Sammati."
- **Core address** (existing): the field that points the phone at the laptop's Core, with Save.
- **Short expiry for testing**: a switch, **off by default**, with the hint "Adds 2 minutes and 10 minutes to the expiry choices, so you can watch a consent expire." Turning it on adds those two choices to the consent notice (W3) and the renewal flow; turning it off removes them (consents already made stay as they are). Core and the contracts know nothing about it: the customer signs a short `expiresAt`.
- A consent made with a short expiry shows a small outlined chip **Developer option** (icon and word, `marigold` outline on `surface`) next to its expiry on W5, on the receipt W4 and on the Alerts item that mentions it, so it is never mistaken for an ordinary consent. The wallet remembers which consents were made that way on this phone (the expiry is shorter than the shortest ordinary choice, 30 days).

### W11 Requests inbox (W-14), from the bell on W1 Home
- Home's app bar gets a bell with a count badge (`marigold` fill, number in `ink`) of open requests; the badge is also read by screen readers ("3 requests"). Tap opens W11. The badge and the list update the moment a `consent.requested` arrives.
- W11 lists request cards, newest first. A card: the company's name with its colour dot, "{company} is asking for {n} purposes", the purposes' titles, the company's message under "Message from {company}" if there is one, "Expires in 23 hours". Three actions, each 48 dp: **Review** (primary, opens the consent notice W3 for this request, and everything after that is W3, W4), **Decline** (text button), **Block this company** (text button in `block`).
- Decline signs and removes the card, with the toast "Request declined." Block asks first in a bottom sheet ("Block {company}? They will not be able to send you requests."; **Block** in `block`, **Keep** in the usual place), then signs, removes every card of that company and says "{company} is blocked."
- A new card arrives at the top with a brief colour wash (`marigold` fading to `surface` over 1.2 s; with reduced motion the card is simply there).
- Footer link "Blocked companies": a list with **Unblock** on each, and "You have not blocked anyone." when empty.
- Empty state: "No requests. When a company asks for your consent it will appear here."
- Offline (or Core unreachable): the last known list stays, with the banner "No connection. Showing last known requests." (the same banner pattern as W1). Actions need a connection and say so.

### W12 Your Sammati ID (N-01), from W9 Me
- A row on Me: "Your Sammati ID", its value `asha@sammati` or "No Sammati ID yet". Tap opens W12.
- W12 explains: "Companies can send you consent requests here. They never see your wallet address until you say yes." Without an ID: a field "Choose your ID" with the fixed suffix `@sammati` shown after it, the hint "3 to 30 letters, numbers, dots or dashes", and **Register**. Registering is a device-credential prompt, then the new ID in `ink` with a copy action.
- Errors: not 3 to 30 letters, numbers, dots, underscores or dashes: "Use 3 to 30 letters, numbers, dots or dashes"; taken: "That ID is taken. Try another."; no connection: "Could not reach Sammati. Check Wi-Fi."
- Changing the ID is registering another one; the old one is released. No phone number or email is ever asked for.

### W18 Your Nominee (D-06), from W9 Me
- A row on Me: "Your Nominee". Tap opens W18.
- Explanatory copy: "Nominate someone you trust to manage your data rights. This is a prototype feature without legal effect."
- A field to enter the nominee's Sammati ID, and a "Nominate" button.
- On success, shows the nominee's ID and "Nomination signed and stored locally."

### V1 (removed, X-01)
The wallet ships no sample profile and no screen that shows one. The standing line "Processor (simulated enclave, not real hardware protection)" lives on W10 and on the console's holdings card.

### V2 Send securely, on W5 pass detail (V-01, V-04, V-06)
Only on a purpose in `VAULT_PURPOSES` (`credit_check`) while it is Active. Under that purpose row:
- Idle: text button "Send securely" (48 dp) and the hint "{company} gets a decision, not your details. Only the Sammati Processor can open them." Tap: opens W10, where the customer types what is sent, confirms with the device credential (`auth_reason_vault`), and sees the progress line "Encrypting and sending…". The sent, erased and failed lines below are shown on both screens.
- Sent: `allow`-coloured line with a lock icon, "Sent encrypted. {company} holds only a reference.", then the handle shortened (`0x4f2a…9be1`, tap to copy) and the button reads "Send again" (a new envelope replaces the old one).
- Erased: when `vault.erased` arrives, or the purpose is withdrawn, the line turns `mute` and reads "{company} no longer holds your {data}." (`erased_named`, {data} from the purpose's categories; "Your encrypted details were erased." if the categories are unknown). The button is gone while the purpose is withdrawn. Withdrawing needs no extra step: the existing two-tap withdraw is what erases.
- Failed: `block`-coloured line "Could not send securely. Try again." with the existing retry pattern (the button stays). Core or Processor unreachable uses `error_unreachable`; the user declining the device prompt uses `wallet_auth_failed`. A refusal for lack of consent is a failure like any other, never shown as sent.
- The state is held while the app runs; after a restart the section is idle again until the next `vault.stored` / `vault.erased` event (there is no read endpoint for "what do I have stored", on purpose: the wallet does not ask the Processor questions about stored data).
- The vault never changes the pass-cut animation or the cascade list.

### W10 Share your details securely (W-13), after consent or from a pass
Opens from the receipt (W4) as a primary button "Share your details securely" when a data-using purpose was granted, from "Send securely" on W5 (V2), and from "Update" on a changed-details note (W-17). Closing it never withdraws anything.
- Opening it asks for the device credential once (`auth_reason_profile`), because the profile is locked (W-16). Cancelled or failed: the screen says the details are locked and offers **Unlock**; nothing is shown.
- Intro: "{company} needs these details for this purpose. They are encrypted on this phone, so {company} never sees them."
- **Only the fields this purpose's data categories need** (`trd.md` §4.6) are shown, grouped in two lists. **From My details**: fields the profile already has, each a read-only row (label and value, the PAN and mobile value shown in full because the person is looking at their own phone) with **Edit**. **{company} also needs these**: fields the profile lacks, as inputs with the same labels, hints and errors as My details (W15). Nothing else is asked: a field no category of this purpose names never appears here. If every needed field is present the second list is absent and the button is one tap. If the purpose names no field the wallet can supply: "{company} does not need any details from you for this." and no button.
- Typed values are validated on the device as they are entered (errors appear after the field was touched), and are saved into My details when sent (hint under the inputs: "Saved in My details, so you only type them once."). "Send securely" stays disabled until every needed field is present and valid. No sample, "use demo details" or prefilled value exists.
- Send: device-credential prompt (`auth_reason_vault`), "Encrypting and sending…", then the sent state of V2 ("Sent encrypted. {company} holds only a reference.", the handle shortened) and a "Done" button. Failed, unreachable and refused states are V2's.
- The values on this screen live in its state only and are cleared once sent and when it closes. Nothing is logged or shown on any other screen except My details, where the person put them.
- A standing line, `mute` colour, always shown: "Processor (simulated enclave, not real hardware protection)". The simulation is never presented as production security. Hint under the fields: "Use made-up details while Sammati is a prototype."
### Edge states
**Many companies and sandbox (R-04, R-03).** Home lists a pass for every company the customer has consented to, however many; the company's colour comes from Core (`ink` for a company that joined through R-01, so no new colour exists). If a request belongs to a sandbox company and the customer is not a test customer, Core answers 403 `SANDBOX_COMPANY` and the wallet shows its existing generic "could not open this request" state; this build adds no wallet string for it.

Offline banner "No connection. Showing last known consents."; expired consent chip "Expired 3 days ago, give consent again"; QR from a different network "Could not reach Sammati. Check Wi-Fi."; failed transaction "Could not record this. Try again" with retry.

### W13 Alerts (N-05, W-11), the notification centre: a tab on W1
- The bottom bar becomes Consents · Activity · [Scan] · **Alerts** · Rights · Me. Alerts has an unread **dot** (`marigold`, 10 dp, with a text alternative "Unread alerts" for screen readers) on its icon while anything is unread. Labels stay one short word in each language so six items fit at 360 dp; every item is still at least 48 dp.
- The list is newest first under two headers, **Today** and **Earlier**. An item: the company's colour dot and name, an icon for the type (`schedule`, `event_busy`, `autorenew`, `delete_outline`, `done_all`), one plain sentence, its time ("2 min ago"), and, if unread, the dot at the start. Unread items sit on `surface`, read ones on `paper`; a state is never colour alone (the dot, the bold sentence and the icon all change).
- Sentences: expiring "Your consent for {purpose} at {company} expires in {time}"; expired "Your consent for {purpose} at {company} has expired" (the same wording as W1's chip, "Expired {n} days ago, give consent again"); renewal requested "{company} asks you to renew your consent for {purpose}" with the company's message under "Message from {company}"; erased "{company} erased your data for {purpose} (after you withdrew consent / after consent expired)"; cascade "{processor} confirmed it stopped using your data for {purpose}".
- Actions are text buttons of 48 dp under the sentence: **Renew** (primary), **Let expire**, **View proof**. Renew calls Core for a renewal request and opens the consent notice W3 for that one purpose with the expiry choices (and the two short choices when the Developer option is on, W9b); everything after is W3 and W4. Let expire records the choice and says "Okay. This consent will expire on its own." View proof opens the proof sheet W7 for that consent. An item whose consent has since been renewed shows "Renewed" instead of its actions, and one left to expire shows "Left to expire".
- A new alert arrives at the top with the same brief colour wash as W11 (reduced motion: it is simply there). Tapping an item, or any action, marks it read; **Mark all as read** sits in the app bar. The banner "No connection. Showing last known alerts." appears when Core cannot be reached, with the list kept.
- Empty: "No alerts. Expiry reminders and updates from companies will appear here."
- On a consent card (W1) and the pass (W5) an expired consent keeps the chip "Expired {n} days ago, give consent again", and tapping it now starts the same Renew flow.

### W14 Create account (W-15), after the language picker and onboarding
One screen, three steps, with "Step {n} of 3" and a progress bar of three segments (`ink` filled, `line` empty). Back moves one step; nothing is created before step 2.
- **Step 1, Choose your Sammati ID.** Explanation as W12. A field with the fixed suffix `@sammati` after it, lower-cased as typed. As the person types (checked 400 ms after the last key, and not for an invalid format), a status line under it: "Checking…", then `allow`-coloured "{handle} is available" (check icon) or `block`-coloured "That ID is taken. Try another." Invalid shape: "Use 3 to 30 letters, numbers, dots or dashes". No connection: "Could not reach Sammati. Check Wi-Fi." (the field is kept). **Continue** is enabled only for an available ID. A text button **Choose later** skips the ID (it can be registered in W12); the account is otherwise complete.
- **Step 2, Secure with fingerprint or PIN.** The existing create-wallet copy and button. Pressing it asks for the device credential, creates the wallet, then registers the ID (a second prompt, `auth_reason_id`) while the screen says "Your wallet is created. Registering {handle}…". If registering fails the screen stays on this step: "Your wallet is ready, but {handle} could not be registered." with **Try again** and **Choose another ID**; the wallet is not created twice. A phone with no screen lock gets the existing "no lock" message and nothing is created.
- **Step 3, Your details.** The title "Your details", the line "Fill in what you like, once. Every field is optional. A company only gets a detail after you say yes to a purpose that needs it.", then the same grouped form as W15 (Identity, Contact, Financial, Health, Preferences; groups collapsed except the first), and a `mute` privacy line ("Stored only on this phone, locked with your fingerprint or PIN. Sammati's servers never receive them."). **Save and continue** (disabled when nothing was typed and nothing is wrong) and **Skip for now**. Saving encrypts the profile on the device (no extra prompt: the person has just passed it) and lands on Home. A field with an error blocks Save until fixed or cleared.
- Killing the app between steps: a wallet that exists but has not finished setup is returned to step 3 on the next launch (an ID that was not registered can be done from W12).

### W15 My details (W-16, W-17), from W9 Me
- Locked on entry: the screen shows a lock icon, "Your details are locked" and **Unlock**, and prompts immediately (`auth_reason_profile`). Success shows the profile; a cancel or failure keeps it locked. The profile locks again when the app goes to the background.
- Unlocked: five groups with headings ("Who you are", "How to reach you", "Money", "Health", "Your preferences"), each a list of rows: the label (from the category registry, `trd.md` §4.6) and the value, or `mute` "Not added". Tap a row to edit it in a sheet: a text field, a date field (DD/MM/YYYY), or a choice list, per the kind; **Save**, and **Remove** for a field that has a value. Errors are shown under the field after it is touched. A choice shows its translated label; the stored value is the English code.
- Empty profile: "Nothing added yet. Add a detail once and use it with any company." above the groups.
- Under the groups, always: "Stored only on this phone, locked with your fingerprint or PIN. Sammati's servers never receive them."
- Saving a value that was already sent to a company (W-17) marks that consent (W5, W1) and toasts "Saved on this phone". Saving never contacts any server.
- If the stored blob cannot be authenticated or read: "Your saved details could not be read. Add them again." and an empty profile; nothing partial is shown.
- 48 dp rows; labels never truncated (wrap), checked at 360 dp and large text, in all three languages.

### W16 About, from W9 Me
"About Sammati": one line that it is a prototype ("Sammati is a prototype. Use made-up details."), the standing simulated-processor line, the storage line ("Stored only on this phone…") and a titled block **No account recovery in this build**: "If you lose this phone or clear the app's data, your wallet, your Sammati ID and your saved details are gone, and you start again with a new account. Backup and recovery are planned for a real release." Static text, no controls.

## 3. Company Console (web)

Layout: left rail (Overview, Purposes, Consents, Live requests, Processors, Rights inbox, Evidence), top bar with a company switcher that lists **every approved company from Core** (R-04), pills for up to five, a dropdown beyond that. A company in sandbox shows a **SANDBOX** chip (a flask icon and the word, `marigold` outline on `paper`) next to its name in the switcher and in the page title, with the tooltip "Test sandbox: only test customers can be asked". **Live requests** shows a card "Your requests come from your own server" with a link to the integration guide, above the feed.

- **Overview:** four numbers (active consents, allowed today, blocked today, last anchor), live feed beside a small consent trend chart.
- **Purposes:** table plus "Add purpose" drawer (code, plain description in 3 languages, categories, retention, sharing flag).
- **New consent request:** two tabs. **QR (in person)**: choose customer alias and purposes, large QR on right. "Waiting for scan…" then "Consent received" with tx. **Send to user** (N-02): a field "Sammati ID" (placeholder `asha@sammati`), the same purposes picker, an optional message (140 characters, with a counter) and "Expires in" (1 hour, 24 hours, 3 days, 7 days), then **Send request**. The answer is always "Request sent" for a well-formed ID, and the page says so: "We tell you nothing about whether this ID exists." Below, a table of requests sent: ID as typed, purposes, a status chip (Sent, Seen, Granted, Declined, Expired: each with icon and word), sent time, expiry; it updates live from `request.updated`, and a Granted row links to the Consents section. A rate-limit answer reads "You are sending too fast. Try again in {n} seconds."
- **Live requests:** the feed of ALLOWED/BLOCKED rows with reason code and latency, driven by real `access.logged` events from the company's own server. Blocked rows use `block` left border and show "451 · Consent withdrawn". There are no buttons that fire requests: the company's server makes them. An empty feed says "No requests yet. Calls from your server appear here."
- **Live requests, a company that uses the Processor (V-05, V-06):** beside the feed, a **What {company} holds** card shows only what its backend has: handle (short, tap to copy), ciphertext hash, status `stored` / `erased`, and the sentence "{company} staff cannot read this. Only the Sammati Processor can open it." A small timeline under it fills from the `vault.*` and `processor.*` events: Encrypted → Stored → Requested → Decrypting → Decided → Erased, each with its time; Decided reads "Approved · limit 3,00,000 · SCORE_FAIR" in `allow` or "Declined · …" in `block`. No screen of the console shows a PAN or an income. The card also carries the quiet "simulated enclave" label.
- **Consents:** table of customers by purpose with status, filterable. Above it, **Expiring consents** (N-03, N-04): the company's consents that expire within the window or expired within it, soonest first. Columns: customer (the company's own alias), purpose, expires (absolute and relative), a state chip (**Expiring** with `warn` styling, **Expired** with `expired`, each with an icon and the word), the renewal's status chip if one was asked (Sent, Seen, Granted, Declined, Expired), and the action **Request renewal** (48 px tall; while a request is open it reads "Requested" and is disabled). Updates live from `consent.updated` and `request.updated`. Empty: "No consents are about to expire." A rate-limit answer reads "You are sending too fast. Try again in {n} seconds."
- **Processors:** per purpose list, ack state and time.
- **Rights inbox:** table of access, correction, erasure, and grievance requests. Each row shows customer handle, type, status, date, note. An action "Resolve" allows the company to mark the request as resolved with a reply note. For erasure, marking resolved confirms erasure of company data and triggers Processor erasure + consent withdrawal.
- **Evidence:** "Generate evidence pack" button, preview, download. Titles say "evidence", never "compliance" (L-02).

### 3.1 Company customer portal (`/portal/:slug`, C-09)

A company's customer page, not part of the console: header in `ink` with the company's name, one column, 640 px, large controls (48 px), sentence case. It looks like a company website because it is meant to be taken for one; the footer says "Sample page. Consent by Sammati." The states of `trd.md` §6.10:

- **Logged out:** a card "Sign in to apply", one text input **"Your customer ID"**, a button "Continue". There is no password and no other field; in particular none for a PAN or an income. An alias shaped like a PAN is refused with the message "That looks like a PAN. {company} does not need it here."
- **Application form:** "Hello, {alias}". A card "Apply for a loan" with the checkbox **"Allow {company} to use my data for loan purposes"**, unticked. Beneath it, indented and in plain language, the company's purposes, read from Core: the loan purpose (this is what the box asks for) and, each with its own unticked box, the others, those that share data marked "Shared with third parties". "Apply" is disabled with the line "Allow the use of your data first".
- **Awaiting scan:** the same card with the QR (240 px, white tile) and "Waiting for you to approve in the Sammati app...", a live status chip (● Waiting / ✓ Connected), "Untick to cancel".
- **Consent received:** "✓ Consent received" and "Recorded on the ledger" with the transaction shortened (tap to copy). Beneath, three rows (PAN, Income, Employment), each "Provided securely in your Sammati app" with a lock icon. Apply disabled with "Share your details in the Sammati app".
- **Data submitted:** "✓ Data submitted securely", the handle and ciphertext hash shortened (tap to copy), the line "{company} holds only a reference. Only the Sammati Processor can open your details." Apply enabled.
- **Decided:** a decision card: **Approved** (`allow`, ✓) with "Limit 3,00,000" and the reason codes as chips, or **Declined** (`block`, ✕) with the reasons. No data is shown, only the outcome.
- **Withdrawn:** "Consent withdrawn. Application cannot be processed" in `block` with an icon; Apply disabled; the data rows are replaced by "Your encrypted details were erased" once the Processor says so.
- **Error:** a `block` banner naming what failed, "Try again", and the form is kept.
Status is never colour alone. Every dynamic line is an `aria-live` region.

### 3.2 Join Sammati (`/join`, R-01)
**Data categories (C-01, §6.1a of the PRD):** wherever a company declares what a purpose uses, the console and `/join` show the registry as grouped checkboxes (Identity, Contact, Financial, Health, Preferences) with the English label of each category and its id in `mute` mono; there is no free-text field, so a company cannot invent a category. The Auditor's Registrations tab and the company's Purposes table show the labels, not ids.

A public page, no login, in Sammati's own look (`ink` header, `paper` body, `marigold` primary action), with an **EN · हि · ಕ** switch. One column, max width 720.

- **Intro:** "Ask people for consent the right way" and one sentence: "Register your company. The regulator reviews it. Then you can ask customers for consent and check it before you use their data."
- **Company:** "Company name", "Sector", "Contact email" with the note "Used only for this application. Deleted when the regulator decides."
- **Purposes** (one card each, "Add a purpose" up to 8, "Remove" on each): "Code" (`credit_check`, lower case with underscores), "Title" and "What you will do with the data, in plain words" each in three labelled fields (English, हिन्दी, ಕನ್ನಡ), "Data categories" (comma separated), "Kept for (days)", two checkboxes "Shared with third parties" and "Needed for the service".
- **Processors** (optional, "Add a processor" up to 6): "Name" and "Used for" (a dropdown of the purposes above).
- **Submit** "Send for review". Each field shows its problem beneath it in `block` with an icon (never colour alone), on blur and on submit; the button is not disabled, it explains. While sending: "Sending…". A refusal from Core (`NAME_TAKEN`, `RATE_LIMITED`, `TOO_MANY_PENDING`) is a `block` banner with what to do.
- On success the page moves to the status page and remembers the application in this browser.

### 3.3 Application status and onboarding result (`/join/:applicationId`, R-01, R-03)

One page that follows the application and polls every 3 s (and on focus). The id in the address is the applicant's secret.

| State | Shows |
|---|---|
| Pending | "Waiting for the regulator" with the company name, a pulsing-free dot and the time sent; "Keep this page's address. You can come back to it." |
| Rejected | `block` card "Not approved", the regulator's note, "You can apply again with the changes". No key, no id |
| Approved | A `SANDBOX` chip and "{name} is registered". **Fiduciary address** (Plex Mono, shortened, tap to copy in full). **API key**, once: a card with the key in full (Plex Mono), a **Copy** button, and the warning "Shown once. Sammati keeps only a fingerprint of it, so it cannot be shown again."; after it was read once: "You have already seen your key. Ask the regulator to issue a new one." Then **Integrate in 5 lines**: the quickstart (below) with the address, a placeholder or the key, and the first purpose code filled in, each block with a Copy button. Then "Send your first request" (a `curl` for a targeted request) and "Using the Processor" (a `curl` for `evaluate`). Then a "Sandbox" note: what a sandbox company can and cannot do, and "Ask the regulator to promote you when you are ready" |

The quickstart text is exactly `integration.md` §2 (a web test compares the two). The page keeps the API key for the life of the tab, because Core hands it over on the first read only and the page polls; reload the tab and it is gone, as it should be. The page is available in English, Hindi and Kannada; the rest of the web console is English only. Reduced motion: no pulsing; the status line simply changes. Every status has a word and an icon.

Copy (English / Hindi / Kannada; native-speaker check needed, like §6):

| Key | English | Hindi | Kannada |
|---|---|---|---|
| join_title | Ask people for consent the right way | लोगों से सही तरीके से सहमति मांगें | ಜನರಿಂದ ಸರಿಯಾದ ರೀತಿಯಲ್ಲಿ ಒಪ್ಪಿಗೆ ಕೇಳಿ |
| join_company | Company name | कंपनी का नाम | ಕಂಪನಿಯ ಹೆಸರು |
| join_sector | Sector | क्षेत्र | ವಲಯ |
| join_email | Contact email | संपर्क ईमेल | ಸಂಪರ್ಕ ಇಮೇಲ್ |
| join_email_note | Used only for this application. Deleted when the regulator decides. | केवल इस आवेदन के लिए। नियामक के निर्णय पर हटा दिया जाएगा। | ಈ ಅರ್ಜಿಗೆ ಮಾತ್ರ. ನಿಯಂತ್ರಕರು ತೀರ್ಮಾನಿಸಿದಾಗ ಅಳಿಸಲಾಗುತ್ತದೆ. |
| join_purposes | Purposes you will ask for | आप किन उद्देश्यों के लिए सहमति मांगेंगे | ನೀವು ಕೇಳುವ ಉದ್ದೇಶಗಳು |
| join_add_purpose | Add a purpose | उद्देश्य जोड़ें | ಉದ್ದೇಶ ಸೇರಿಸಿ |
| join_processors | Partners that receive data (optional) | डेटा पाने वाले साझेदार (वैकल्पिक) | ಡೇಟಾ ಪಡೆಯುವ ಪಾಲುದಾರರು (ಐಚ್ಛಿಕ) |
| join_submit | Send for review | समीक्षा के लिए भेजें | ಪರಿಶೀಲನೆಗೆ ಕಳುಹಿಸಿ |
| join_pending | Waiting for the regulator | नियामक की प्रतीक्षा | ನಿಯಂತ್ರಕರಿಗಾಗಿ ಕಾಯುತ್ತಿದೆ |
| join_rejected | Not approved | स्वीकृत नहीं | ಅನುಮೋದಿಸಲಾಗಿಲ್ಲ |
| join_approved | {name} is registered | {name} पंजीकृत है | {name} ನೋಂದಾಯಿಸಲಾಗಿದೆ |
| join_sandbox | Sandbox | सैंडबॉक्स | ಸ್ಯಾಂಡ್‌ಬಾಕ್ಸ್ |
| join_key_once | Shown once. Sammati keeps only a fingerprint of it, so it cannot be shown again. | केवल एक बार दिखाया जाता है। Sammati केवल उसका फ़िंगरप्रिंट रखता है, इसलिए इसे दोबारा नहीं दिखाया जा सकता। | ಒಮ್ಮೆ ಮಾತ್ರ ತೋರಿಸಲಾಗುತ್ತದೆ. Sammati ಅದರ ಫಿಂಗರ್‌ಪ್ರಿಂಟ್ ಮಾತ್ರ ಇಟ್ಟುಕೊಳ್ಳುತ್ತದೆ, ಆದ್ದರಿಂದ ಅದನ್ನು ಮತ್ತೆ ತೋರಿಸಲಾಗುವುದಿಲ್ಲ. |
| join_key_seen | You have already seen your key. Ask the regulator to issue a new one. | आप अपनी कुंजी पहले देख चुके हैं। नियामक से नई कुंजी माँगें। | ನಿಮ್ಮ ಕೀಲಿಯನ್ನು ನೀವು ಈಗಾಗಲೇ ನೋಡಿದ್ದೀರಿ. ಹೊಸದನ್ನು ನೀಡಲು ನಿಯಂತ್ರಕರನ್ನು ಕೇಳಿ. |
| join_integrate | Integrate in 5 lines | 5 पंक्तियों में जोड़ें | 5 ಸಾಲುಗಳಲ್ಲಿ ಸೇರಿಸಿ |
| join_copy | Copy | कॉपी करें | ನಕಲಿಸಿ |
| join_intro | Register your company. The regulator reviews it. Then you can ask customers for consent and check it before you use their data. | अपनी कंपनी पंजीकृत करें। नियामक उसकी समीक्षा करता है। फिर आप ग्राहकों से सहमति मांग सकते हैं और उनका डेटा इस्तेमाल करने से पहले उसे जाँच सकते हैं। | ನಿಮ್ಮ ಕಂಪನಿಯನ್ನು ನೋಂದಾಯಿಸಿ. ನಿಯಂತ್ರಕರು ಅದನ್ನು ಪರಿಶೀಲಿಸುತ್ತಾರೆ. ನಂತರ ನೀವು ಗ್ರಾಹಕರ ಒಪ್ಪಿಗೆ ಕೇಳಬಹುದು ಮತ್ತು ಅವರ ಡೇಟಾ ಬಳಸುವ ಮೊದಲು ಅದನ್ನು ಪರಿಶೀಲಿಸಬಹುದು. |
| join_remove | Remove | हटाएं | ತೆಗೆದುಹಾಕಿ |
| join_code | Code | कोड | ಕೋಡ್ |
| join_title_field | Title | शीर्षक | ಶೀರ್ಷಿಕೆ |
| join_description | What you will do with the data, in plain words | आप डेटा के साथ क्या करेंगे, सरल शब्दों में | ನೀವು ಡೇಟಾದೊಂದಿಗೆ ಏನು ಮಾಡುತ್ತೀರಿ, ಸರಳ ಮಾತುಗಳಲ್ಲಿ |
| join_categories | Data categories (comma separated) | डेटा श्रेणियाँ (अल्पविराम से अलग) | ಡೇಟಾ ವರ್ಗಗಳು (ಅಲ್ಪವಿರಾಮದಿಂದ ಬೇರ್ಪಡಿಸಿ) |
| join_retention | Kept for (days) | कितने दिन रखा जाएगा | ಎಷ್ಟು ದಿನ ಇಡಲಾಗುತ್ತದೆ |
| join_shares | Shared with third parties | तीसरे पक्ष के साथ साझा | ಮೂರನೇ ಪಕ್ಷಗಳೊಂದಿಗೆ ಹಂಚಲಾಗುತ್ತದೆ |
| join_required | Needed for the service | सेवा के लिए आवश्यक | ಸೇವೆಗೆ ಅಗತ್ಯ |
| join_add_processor | Add a partner | साझेदार जोड़ें | ಪಾಲುದಾರರನ್ನು ಸೇರಿಸಿ |
| join_processor_name | Name | नाम | ಹೆಸರು |
| join_processor_for | Used for | किसलिए | ಯಾವುದಕ್ಕೆ |
| join_sending | Sending… | भेजा जा रहा है… | ಕಳುಹಿಸಲಾಗುತ್ತಿದೆ… |
| join_pending_hint | Keep this page's address. You can come back to it. | इस पेज का पता रखें। आप इस पर वापस आ सकते हैं। | ಈ ಪುಟದ ವಿಳಾಸ ಇಟ್ಟುಕೊಳ್ಳಿ. ನೀವು ಇದಕ್ಕೆ ಮರಳಿ ಬರಬಹುದು. |
| join_rejected_hint | You can apply again with the changes. | आप बदलावों के साथ फिर आवेदन कर सकते हैं। | ಬದಲಾವಣೆಗಳೊಂದಿಗೆ ನೀವು ಮತ್ತೆ ಅರ್ಜಿ ಸಲ್ಲಿಸಬಹುದು. |
| join_address | Fiduciary address | फिड्यूशियरी पता | ಫಿಡ್ಯೂಷಿಯರಿ ವಿಳಾಸ |
| join_api_key | API key | एपीआई कुंजी | ಎಪಿಐ ಕೀಲಿ |
| join_first_request | Send your first request | अपना पहला अनुरोध भेजें | ನಿಮ್ಮ ಮೊದಲ ವಿನಂತಿಯನ್ನು ಕಳುಹಿಸಿ |
| join_processor_howto | Using the Processor | प्रोसेसर का उपयोग | ಪ್ರೊಸೆಸರ್ ಬಳಕೆ |
| join_sandbox_note | In the sandbox you can ask, and receive consent from, only the regulator's test customers. Ask the regulator to promote you when you are ready. | सैंडबॉक्स में आप केवल नियामक के परीक्षण ग्राहकों से सहमति मांग और पा सकते हैं। तैयार होने पर नियामक से प्रोन्नत करने को कहें। | ಸ್ಯಾಂಡ್‌ಬಾಕ್ಸ್‌ನಲ್ಲಿ ನೀವು ನಿಯಂತ್ರಕರ ಪರೀಕ್ಷಾ ಗ್ರಾಹಕರನ್ನು ಮಾತ್ರ ಕೇಳಬಹುದು ಮತ್ತು ಅವರಿಂದ ಮಾತ್ರ ಒಪ್ಪಿಗೆ ಪಡೆಯಬಹುದು. ಸಿದ್ಧರಾದಾಗ ಬಡ್ತಿ ನೀಡಲು ನಿಯಂತ್ರಕರನ್ನು ಕೇಳಿ. |
| join_copied | Copied | कॉपी हो गया | ನಕಲಿಸಲಾಗಿದೆ |

## 4. Auditor (web)

- **Home:** one card per company with a scorecard (grants, withdrawals, allowed, blocked, avg withdrawal-to-block latency, pending acknowledgements, integrity status).
- **Ledger explorer:** reverse-chronological table with type, principal alias (short address), company, purpose, tx, ledger head; filters on top.
- **Verify integrity:** button per company. Progress rows "Recomputing hash chain… Rebuilding Merkle roots… Comparing with chain anchors…". Result: green "All 148 records match 7 anchors" or red "Mismatch in batch 4, record 63" with a diff of the stored vs expected hash. The mismatch is what an edited log looks like.
- **Report:** printable page titled "Consent and access evidence report": company, period, the log integrity check ("Log integrity check", result "MATCH" or "MISMATCH" against the on-chain anchors; the words violation, certification and compliance proof are not used), evidence list, anchor links, and a closing "Scope and limits" note: the report lists evidence from the ledger and the access log, it is not a legal finding, and the mapping of Sammati to the Act, with its unchecked points, is in `docs/dpdp-mapping.md` (L-02). No section number is printed.
- Scorecards count "Access without valid consent" (allowed use with no valid consent at that moment), not "violations".
- **Scorecards and filters for any number of companies (R-04):** the home grid wraps (`auto-fill`, 280 px minimum) and the ledger explorer's company filter lists the approved companies from Core, so a fourth or tenth company needs no change.
- **Sign-in in production (`trd.md` §10.8):** a build made for production (not `pnpm dev`) shows, before any Auditor content, a single card "Regulator sign-in" with the access code field; the code is kept in this tab's session only, sent as `x-sammati-regulator-key` on every Auditor call, and a wrong code shows "That access code was not accepted." The Registrations tab reuses the same code, so it is asked once. The company console likewise redirects to its sign-in when there is no operator session.
- **Registrations (R-02):** a third tab beside Scorecards and Ledger. First the **regulator access code** field (password type, "Ask your administrator for the regulator access code."), kept in this tab's session only; until it is accepted the tab shows nothing else. Then three filter chips (Pending, Approved, Rejected; Pending has a count badge). A list of applications, newest first: company, sector, time, status chip (icon and word). Selecting one opens the **review panel**: company, sector, contact email, each purpose (code, the three titles and descriptions, categories, retention, sharing, required) and each processor, and a checklist the regulator ticks for themselves (no effect on the system): "Purposes are specific", "Retention is justified", "Sharing is disclosed". Below: a note field (required to reject, optional to approve), a "Start in sandbox" checkbox (ticked), and **Approve** and **Reject** buttons. Approving is one request to Core, so the page shows one honest status line while it runs ("Approving: generating the company's key, registering the company, its purposes and processors on the ledger, creating the API key. This takes a few seconds."), never a timed set of steps; then "Approved. {name} is in the directory", with the ledger transactions as short copyable hashes. A failure says which step failed and that Approve can be repeated. Approved companies appear in a second list with a **Sandbox / Live** control ("Promote to live" and "Return to sandbox", each with a confirm) and **Issue a new API key** (confirm: "The old key stops working at once"). A last card, **Test customers**, lists the customers a sandbox company may ask (Sammati ID if known, else a short address), with "Add" (a Sammati ID or an address) and "Remove". Reduced motion: progress rows change without animation.

## 5. (removed, X-01)
There is no presenter screen. Nothing in the console, Auditor or portal is controlled by a hidden shortcut: the Auditor has no tamper or reset control. A tester edits a stored log row with `pnpm dev:tamper` (`trd.md` §6.4) and presses the real **Verify**.

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
| vault_pan | PAN | PAN | PAN |
| vault_income | Income | आय | ಆದಾಯ |
| vault_score | Credit score | क्रेडिट स्कोर | ಕ್ರೆಡಿಟ್ ಸ್ಕೋರ್ |
| vault_simulated | Processor (simulated enclave, not real hardware protection) | प्रोसेसर (सिम्युलेटेड एन्क्लेव, असली हार्डवेयर सुरक्षा नहीं) | ಪ್ರೊಸೆಸರ್ (ಸಿಮ್ಯುಲೇಟೆಡ್ ಎನ್‌ಕ್ಲೇವ್, ನಿಜವಾದ ಹಾರ್ಡ್‌ವೇರ್ ರಕ್ಷಣೆ ಅಲ್ಲ) |
| vault_send | Send securely | सुरक्षित रूप से भेजें | ಸುರಕ್ಷಿತವಾಗಿ ಕಳುಹಿಸಿ |
| vault_send_again | Send again | दोबारा भेजें | ಮತ್ತೆ ಕಳುಹಿಸಿ |
| vault_send_hint | {company} gets a decision, not your details. Only the Sammati Processor can open them. | {company} को फ़ैसला मिलता है, आपका विवरण नहीं। उन्हें सिर्फ़ Sammati Processor खोल सकता है। | {company} ಗೆ ನಿರ್ಧಾರ ಸಿಗುತ್ತದೆ, ನಿಮ್ಮ ವಿವರಗಳಲ್ಲ. ಅವುಗಳನ್ನು Sammati Processor ಮಾತ್ರ ತೆರೆಯಬಹುದು. |
| vault_sending | Encrypting and sending… | एन्क्रिप्ट करके भेज रहे हैं… | ಎನ್‌ಕ್ರಿಪ್ಟ್ ಮಾಡಿ ಕಳುಹಿಸಲಾಗುತ್ತಿದೆ… |
| vault_sent | Sent encrypted. {company} holds only a reference. | एन्क्रिप्ट करके भेजा गया। {company} के पास सिर्फ़ एक संदर्भ है। | ಎನ್‌ಕ್ರಿಪ್ಟ್ ಮಾಡಿ ಕಳುಹಿಸಲಾಗಿದೆ. {company} ಬಳಿ ಕೇವಲ ಒಂದು ಉಲ್ಲೇಖವಿದೆ. |
| vault_erased | Your encrypted details were erased. | आपका एन्क्रिप्टेड विवरण मिटा दिया गया। | ನಿಮ್ಮ ಎನ್‌ಕ್ರಿಪ್ಟ್ ಮಾಡಿದ ವಿವರಗಳನ್ನು ಅಳಿಸಲಾಗಿದೆ. |
| vault_failed | Could not send securely. Try again. | सुरक्षित रूप से नहीं भेज सके। दोबारा कोशिश करें। | ಸುರಕ್ಷಿತವಾಗಿ ಕಳುಹಿಸಲಾಗಲಿಲ್ಲ. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ. |
| auth_reason_vault | Confirm to send your details securely | अपना विवरण सुरक्षित भेजने के लिए पुष्टि करें | ನಿಮ್ಮ ವಿವರಗಳನ್ನು ಸುರಕ್ಷಿತವಾಗಿ ಕಳುಹಿಸಲು ದೃಢೀಕರಿಸಿ |

Share your details securely (W10, W-13), same status as above. `{company}` is a placeholder. The income-band and employment labels are shown to the user; what is encrypted is the fixed value (`0-3 LPA`, `salaried`, ...). The portal's strings are English only, like the console's, and are listed in §3.1.

| Key | English | Hindi | Kannada |
|---|---|---|---|
| share_title | Share your details securely | अपना विवरण सुरक्षित रूप से साझा करें | ನಿಮ್ಮ ವಿವರಗಳನ್ನು ಸುರಕ್ಷಿತವಾಗಿ ಹಂಚಿಕೊಳ್ಳಿ |
| share_intro | {company} needs these to decide your loan. They are encrypted on this phone, so {company} never sees them. | {company} को आपका लोन तय करने के लिए ये चाहिए। ये इसी फ़ोन पर एन्क्रिप्ट होते हैं, इसलिए {company} इन्हें कभी नहीं देखती। | {company} ಗೆ ನಿಮ್ಮ ಸಾಲ ನಿರ್ಧರಿಸಲು ಇವು ಬೇಕು. ಇವು ಈ ಫೋನ್‌ನಲ್ಲೇ ಎನ್‌ಕ್ರಿಪ್ಟ್ ಆಗುತ್ತವೆ, ಆದ್ದರಿಂದ {company} ಅವನ್ನು ಎಂದಿಗೂ ನೋಡುವುದಿಲ್ಲ. |
| share_pan | PAN | PAN | PAN |
| share_pan_hint | Like ABCDE1234F | जैसे ABCDE1234F | ಉದಾಹರಣೆ ABCDE1234F |
| share_pan_invalid | Enter a PAN like ABCDE1234F | ABCDE1234F जैसा PAN दर्ज करें | ABCDE1234F ಮಾದರಿಯ PAN ನಮೂದಿಸಿ |
| share_income | Income band | आय वर्ग | ಆದಾಯ ವರ್ಗ |
| income_0_3 | Up to 3 LPA | 3 LPA तक | 3 LPA ವರೆಗೆ |
| income_3_6 | 3 to 6 LPA | 3 से 6 LPA | 3 ರಿಂದ 6 LPA |
| income_6_9 | 6 to 9 LPA | 6 से 9 LPA | 6 ರಿಂದ 9 LPA |
| income_9_plus | 9 LPA and above | 9 LPA और अधिक | 9 LPA ಮತ್ತು ಹೆಚ್ಚು |
| share_employment | Employment | रोज़गार | ಉದ್ಯೋಗ |
| emp_salaried | Salaried | वेतनभोगी | ವೇತನದಾರ |
| emp_self_employed | Self-employed | स्वरोज़गार | ಸ್ವಯಂ ಉದ್ಯೋಗಿ |
| emp_student | Student | विद्यार्थी | ವಿದ್ಯಾರ್ಥಿ |
| emp_unemployed | Not employed | बेरोज़गार | ಉದ್ಯೋಗವಿಲ್ಲ |
| share_cta | Share your details securely | अपना विवरण सुरक्षित रूप से साझा करें | ನಿಮ್ಮ ವಿವರಗಳನ್ನು ಸುರಕ್ಷಿತವಾಗಿ ಹಂಚಿಕೊಳ್ಳಿ |

Requests inbox (W11) and Sammati ID (W12), same status as above. `{company}`, `{handle}`, `{count}` and `{hours}` are placeholders; counted keys use ICU plurals in the ARB files:

| Key | English | Hindi | Kannada |
|---|---|---|---|
| inbox_title | Requests | अनुरोध | ವಿನಂತಿಗಳು |
| inbox_badge_label | {count, plural, =1{1 request} other{{count} requests}} | {count, plural, other{{count} अनुरोध}} | {count, plural, other{{count} ವಿನಂತಿಗಳು}} |
| inbox_empty | No requests. When a company asks for your consent it will appear here. | कोई अनुरोध नहीं। जब कोई कंपनी आपकी सहमति माँगेगी, वह यहाँ दिखेगा। | ಯಾವುದೇ ವಿನಂತಿ ಇಲ್ಲ. ಕಂಪನಿ ನಿಮ್ಮ ಒಪ್ಪಿಗೆ ಕೇಳಿದಾಗ ಅದು ಇಲ್ಲಿ ಕಾಣಿಸುತ್ತದೆ. |
| inbox_asks | {company} is asking for {count, plural, =1{1 purpose} other{{count} purposes}} | {company} {count, plural, other{{count} उद्देश्यों के लिए सहमति माँग रही है}} | {company} {count, plural, other{{count} ಉದ್ದೇಶಗಳಿಗಾಗಿ ಒಪ್ಪಿಗೆ ಕೇಳುತ್ತಿದೆ}} |
| inbox_message_from | Message from {company} | {company} का संदेश | {company} ಅವರ ಸಂದೇಶ |
| inbox_expires_hours | {hours, plural, =1{Expires in 1 hour} other{Expires in {hours} hours}} | {hours, plural, other{{hours} घंटे में समाप्त}} | {hours, plural, other{{hours} ಗಂಟೆಗಳಲ್ಲಿ ಅವಧಿ ಮುಗಿಯುತ್ತದೆ}} |
| inbox_expires_soon | Expires in under an hour | एक घंटे से कम में समाप्त | ಒಂದು ಗಂಟೆಗಿಂತ ಕಡಿಮೆಯಲ್ಲಿ ಅವಧಿ ಮುಗಿಯುತ್ತದೆ |
| inbox_offline | No connection. Showing last known requests. | कनेक्शन नहीं है। पिछले ज्ञात अनुरोध दिख रहे हैं। | ಸಂಪರ್ಕವಿಲ್ಲ. ಕೊನೆಯ ತಿಳಿದ ವಿನಂತಿಗಳನ್ನು ತೋರಿಸಲಾಗುತ್ತಿದೆ. |
| request_review | Review | देखें | ಪರಿಶೀಲಿಸಿ |
| request_decline | Decline | अस्वीकार करें | ತಿರಸ್ಕರಿಸಿ |
| request_block | Block this company | इस कंपनी को ब्लॉक करें | ಈ ಕಂಪನಿಯನ್ನು ನಿರ್ಬಂಧಿಸಿ |
| request_block_confirm | Block {company}? They will not be able to send you requests. | {company} को ब्लॉक करें? वे आपको अनुरोध नहीं भेज सकेंगी। | {company} ಅನ್ನು ನಿರ್ಬಂಧಿಸಬೇಕೇ? ಅವರು ನಿಮಗೆ ವಿನಂತಿಗಳನ್ನು ಕಳುಹಿಸಲು ಸಾಧ್ಯವಿಲ್ಲ. |
| request_declined | Request declined. | अनुरोध अस्वीकार किया गया। | ವಿನಂತಿಯನ್ನು ತಿರಸ್ಕರಿಸಲಾಗಿದೆ. |
| request_blocked | {company} is blocked. | {company} ब्लॉक है। | {company} ಅನ್ನು ನಿರ್ಬಂಧಿಸಲಾಗಿದೆ. |
| blocked_title | Blocked companies | ब्लॉक की गई कंपनियाँ | ನಿರ್ಬಂಧಿತ ಕಂಪನಿಗಳು |
| blocked_empty | You have not blocked anyone. | आपने किसी को ब्लॉक नहीं किया है। | ನೀವು ಯಾರನ್ನೂ ನಿರ್ಬಂಧಿಸಿಲ್ಲ. |
| request_unblock | Unblock | अनब्लॉक करें | ನಿರ್ಬಂಧ ತೆಗೆಯಿರಿ |
| auth_reason_decline | Confirm to decline this request | इस अनुरोध को अस्वीकार करने की पुष्टि करें | ಈ ವಿನಂತಿಯನ್ನು ತಿರಸ್ಕರಿಸಲು ದೃಢೀಕರಿಸಿ |
| auth_reason_block | Confirm to block this company | इस कंपनी को ब्लॉक करने की पुष्टि करें | ಈ ಕಂಪನಿಯನ್ನು ನಿರ್ಬಂಧಿಸಲು ದೃಢೀಕರಿಸಿ |
| id_title | Your Sammati ID | आपकी Sammati ID | ನಿಮ್ಮ Sammati ID |
| id_none | No Sammati ID yet | अभी कोई Sammati ID नहीं | ಇನ್ನೂ Sammati ID ಇಲ್ಲ |
| id_explain | Companies can send you consent requests here. They never see your wallet address until you say yes. | कंपनियाँ आपको यहाँ सहमति अनुरोध भेज सकती हैं। जब तक आप हाँ नहीं कहते, वे आपका वॉलेट पता नहीं देखतीं। | ಕಂಪನಿಗಳು ನಿಮಗೆ ಇಲ್ಲಿ ಒಪ್ಪಿಗೆ ವಿನಂತಿಗಳನ್ನು ಕಳುಹಿಸಬಹುದು. ನೀವು ಹೌದು ಎನ್ನುವವರೆಗೆ ಅವರು ನಿಮ್ಮ ವಾಲೆಟ್ ವಿಳಾಸವನ್ನು ನೋಡುವುದಿಲ್ಲ. |
| id_choose | Choose your ID | अपनी ID चुनें | ನಿಮ್ಮ ID ಆಯ್ಕೆಮಾಡಿ |
| id_hint | 3 to 30 letters, numbers, dots or dashes | 3 से 30 अक्षर, अंक, बिंदु या डैश | 3 ರಿಂದ 30 ಅಕ್ಷರಗಳು, ಅಂಕೆಗಳು, ಚುಕ್ಕೆ ಅಥವಾ ಡ್ಯಾಶ್ |
| id_invalid | Use 3 to 30 letters, numbers, dots or dashes | 3 से 30 अक्षर, अंक, बिंदु या डैश इस्तेमाल करें | 3 ರಿಂದ 30 ಅಕ್ಷರಗಳು, ಅಂಕೆಗಳು, ಚುಕ್ಕೆ ಅಥವಾ ಡ್ಯಾಶ್ ಬಳಸಿ |
| id_taken | That ID is taken. Try another. | यह ID ली जा चुकी है। दूसरी आज़माएँ। | ಆ ID ಈಗಾಗಲೇ ಬಳಕೆಯಲ್ಲಿದೆ. ಬೇರೆಯದನ್ನು ಪ್ರಯತ್ನಿಸಿ. |
| id_register | Register | पंजीकृत करें | ನೋಂದಾಯಿಸಿ |
| id_registered | Your ID is {handle} | आपकी ID {handle} है | ನಿಮ್ಮ ID {handle} |
| auth_reason_id | Confirm to register your Sammati ID | अपनी Sammati ID पंजीकृत करने की पुष्टि करें | ನಿಮ್ಮ Sammati ID ನೋಂದಾಯಿಸಲು ದೃಢೀಕರಿಸಿ |

| nav_alerts | Alerts | अलर्ट | ಎಚ್ಚರಿಕೆಗಳು |
| alerts_title | Alerts | अलर्ट | ಎಚ್ಚರಿಕೆಗಳು |
| alerts_unread | Unread alerts | अपठित अलर्ट | ಓದದ ಎಚ್ಚರಿಕೆಗಳು |
| alerts_today | Today | आज | ಇಂದು |
| alerts_earlier | Earlier | पहले | ಹಿಂದಿನವು |
| alerts_mark_all | Mark all as read | सभी को पढ़ा हुआ मानें | ಎಲ್ಲವನ್ನೂ ಓದಿದಂತೆ ಗುರುತಿಸಿ |
| alerts_empty | No alerts. Expiry reminders and updates from companies will appear here. | कोई अलर्ट नहीं। समाप्ति की याद दिलाने वाले संदेश और कंपनियों के अपडेट यहाँ दिखेंगे। | ಯಾವುದೇ ಎಚ್ಚರಿಕೆಗಳಿಲ್ಲ. ಅವಧಿ ಮುಗಿಯುವ ನೆನಪುಗಳು ಮತ್ತು ಕಂಪನಿಗಳ ಅಪ್‌ಡೇಟ್‌ಗಳು ಇಲ್ಲಿ ಕಾಣಿಸುತ್ತವೆ. |
| alerts_offline | No connection. Showing last known alerts. | कनेक्शन नहीं है। पिछले ज्ञात अलर्ट दिख रहे हैं। | ಸಂಪರ್ಕವಿಲ್ಲ. ಕೊನೆಯ ತಿಳಿದ ಎಚ್ಚರಿಕೆಗಳನ್ನು ತೋರಿಸಲಾಗುತ್ತಿದೆ. |
| alert_expiring | Your consent for {purpose} at {company} expires in {time} | {company} में {purpose} के लिए आपकी सहमति {time} में समाप्त होगी | {company} ನಲ್ಲಿ {purpose} ಗಾಗಿ ನಿಮ್ಮ ಒಪ್ಪಿಗೆ {time} ನಲ್ಲಿ ಮುಗಿಯುತ್ತದೆ |
| alert_expired | Your consent for {purpose} at {company} has expired | {company} में {purpose} के लिए आपकी सहमति समाप्त हो गई है | {company} ನಲ್ಲಿ {purpose} ಗಾಗಿ ನಿಮ್ಮ ಒಪ್ಪಿಗೆ ಮುಗಿದಿದೆ |
| alert_renewal | {company} asks you to renew your consent for {purpose} | {company} आपसे {purpose} के लिए सहमति नवीनीकृत करने को कहती है | {company} ನಿಮ್ಮನ್ನು {purpose} ಗಾಗಿ ಒಪ್ಪಿಗೆಯನ್ನು ನವೀಕರಿಸಲು ಕೇಳುತ್ತದೆ |
| alert_erased_withdrawn | {company} erased your data for {purpose} after you withdrew consent | आपके सहमति वापस लेने के बाद {company} ने {purpose} का आपका डेटा मिटा दिया | ನೀವು ಒಪ್ಪಿಗೆ ಹಿಂಪಡೆದ ನಂತರ {company} {purpose} ಗಾಗಿ ನಿಮ್ಮ ಡೇಟಾವನ್ನು ಅಳಿಸಿದೆ |
| alert_erased_expired | {company} erased your data for {purpose} after consent expired | सहमति समाप्त होने के बाद {company} ने {purpose} का आपका डेटा मिटा दिया | ಒಪ್ಪಿಗೆ ಮುಗಿದ ನಂತರ {company} {purpose} ಗಾಗಿ ನಿಮ್ಮ ಡೇಟಾವನ್ನು ಅಳಿಸಿದೆ |
| alert_cascade | {processor} confirmed it stopped using your data for {purpose} | {processor} ने पुष्टि की कि उसने {purpose} के लिए आपके डेटा का उपयोग बंद कर दिया है | {processor} {purpose} ಗಾಗಿ ನಿಮ್ಮ ಡೇಟಾ ಬಳಕೆಯನ್ನು ನಿಲ್ಲಿಸಿದೆ ಎಂದು ದೃಢಪಡಿಸಿದೆ |
| alert_ago | {time} ago | {time} पहले | {time} ಹಿಂದೆ |
| alert_renew | Renew | नवीनीकृत करें | ನವೀಕರಿಸಿ |
| alert_let_expire | Let expire | समाप्त होने दें | ಮುಗಿಯಲು ಬಿಡಿ |
| alert_view_proof | View proof | प्रमाण देखें | ಪುರಾವೆ ನೋಡಿ |
| alert_let_expire_done | Okay. This consent will expire on its own. | ठीक है। यह सहमति अपने आप समाप्त हो जाएगी। | ಸರಿ. ಈ ಒಪ್ಪಿಗೆ ತಾನಾಗಿಯೇ ಮುಗಿಯುತ್ತದೆ. |
| alert_renew_failed | Could not open the renewal. Try again. | नवीनीकरण नहीं खुल सका। फिर कोशिश करें। | ನವೀಕರಣ ತೆರೆಯಲಾಗಲಿಲ್ಲ. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ. |
| alert_state_renewed | Renewed | नवीनीकृत | ನವೀಕರಿಸಲಾಗಿದೆ |
| alert_state_left | Left to expire | समाप्त होने दिया | ಮುಗಿಯಲು ಬಿಡಲಾಗಿದೆ |
| duration_days | {count, plural, =1{1 day} other{{count} days}} | {count, plural, other{{count} दिन}} | {count, plural, =1{1 ದಿನ} other{{count} ದಿನಗಳು}} |
| duration_hours | {count, plural, =1{1 hour} other{{count} hours}} | {count, plural, other{{count} घंटे}} | {count, plural, =1{1 ಗಂಟೆ} other{{count} ಗಂಟೆಗಳು}} |
| duration_minutes | {count, plural, =1{1 minute} other{{count} minutes}} | {count, plural, other{{count} मिनट}} | {count, plural, =1{1 ನಿಮಿಷ} other{{count} ನಿಮಿಷಗಳು}} |
| duration_seconds | {count, plural, =1{1 second} other{{count} seconds}} | {count, plural, other{{count} सेकंड}} | {count, plural, =1{1 ಸೆಕೆಂಡ್} other{{count} ಸೆಕೆಂಡುಗಳು}} |
| expiry_short_2m | 2 minutes (testing) | 2 मिनट (परीक्षण) | 2 ನಿಮಿಷಗಳು (ಪರೀಕ್ಷೆ) |
| expiry_short_10m | 10 minutes (testing) | 10 मिनट (परीक्षण) | 10 ನಿಮಿಷಗಳು (ಪರೀಕ್ಷೆ) |
| dev_short_expiry | Short expiry for testing | परीक्षण के लिए छोटी अवधि | ಪರೀಕ್ಷೆಗಾಗಿ ಚಿಕ್ಕ ಅವಧಿ |
| dev_short_expiry_hint | Adds 2 minutes and 10 minutes to the expiry choices, so you can watch a consent expire. | समाप्ति के विकल्पों में 2 और 10 मिनट जोड़ता है, ताकि आप सहमति को समाप्त होते देख सकें। | ಅವಧಿ ಆಯ್ಕೆಗಳಿಗೆ 2 ಮತ್ತು 10 ನಿಮಿಷ ಸೇರಿಸುತ್ತದೆ, ಸಮ್ಮತಿ ಮುಗಿಯುವುದನ್ನು ನೋಡಲು. |
| dev_option_chip | Developer option | डेवलपर विकल्प | ಡೆವಲಪರ್ ಆಯ್ಕೆ |
| share_note_made_up | Use made-up details while Sammati is a prototype. | जब तक Sammati प्रोटोटाइप है, बनावटी विवरण इस्तेमाल करें। | Sammati ಮಾದರಿ ಹಂತದಲ್ಲಿರುವವರೆಗೆ ಕಾಲ್ಪನಿಕ ವಿವರಗಳನ್ನು ಬಳಸಿ. |
| notif_expiring_title | Consent expiring soon | सहमति जल्द समाप्त होगी | ಒಪ್ಪಿಗೆ ಶೀಘ್ರದಲ್ಲಿ ಮುಗಿಯಲಿದೆ |
| notif_expired_title | Consent expired | सहमति समाप्त हो गई | ಒಪ್ಪಿಗೆ ಮುಗಿದಿದೆ |
| notif_renewal_title | Renewal requested | नवीनीकरण का अनुरोध | ನವೀಕರಣದ ವಿನಂತಿ |
| notif_erased_title | Your data was erased | आपका डेटा मिटा दिया गया | ನಿಮ್ಮ ಡೇಟಾ ಅಳಿಸಲಾಗಿದೆ |
| notif_cascade_title | Company confirmed | कंपनी ने पुष्टि की | ಕಂಪನಿ ದೃಢಪಡಿಸಿದೆ |
| notif_channel | Consent alerts | सहमति अलर्ट | ಒಪ್ಪಿಗೆ ಎಚ್ಚರಿಕೆಗಳು |
Legal alignment (L-02): the sheet opened by "How this protects you" on the consent notice. Same status as above: first drafts, native-speaker check needed. The English is deliberately plain and claims nothing the mapping marks VERIFY.

| Key | English | Hindi | Kannada |
|---|---|---|---|
| protect_link | How this protects you | यह आपको कैसे सुरक्षित रखता है | ಇದು ನಿಮ್ಮನ್ನು ಹೇಗೆ ರಕ್ಷಿಸುತ್ತದೆ |
| protect_1 | Each purpose is your own choice. Nothing is ticked for you. | हर उद्देश्य आपका अपना चुनाव है। आपके लिए कुछ भी पहले से चुना नहीं गया है। | ಪ್ರತಿ ಉದ್ದೇಶವೂ ನಿಮ್ಮದೇ ಆಯ್ಕೆ. ನಿಮಗಾಗಿ ಯಾವುದನ್ನೂ ಮೊದಲೇ ಆಯ್ಕೆ ಮಾಡಿಲ್ಲ. |
| protect_2 | You can withdraw any purpose later in two taps. The company's next request is blocked. | आप बाद में दो टैप में किसी भी उद्देश्य की सहमति वापस ले सकते हैं। कंपनी का अगला अनुरोध रोक दिया जाता है। | ನೀವು ನಂತರ ಎರಡು ಟ್ಯಾಪ್‌ಗಳಲ್ಲಿ ಯಾವುದೇ ಉದ್ದೇಶದ ಒಪ್ಪಿಗೆಯನ್ನು ಹಿಂಪಡೆಯಬಹುದು. ಕಂಪನಿಯ ಮುಂದಿನ ವಿನಂತಿಯನ್ನು ನಿರ್ಬಂಧಿಸಲಾಗುತ್ತದೆ. |
| protect_3 | Every time a company uses your data it is recorded. If the record is edited later, the edit shows. | जब भी कोई कंपनी आपके डेटा का उपयोग करती है, वह दर्ज होता है। बाद में रिकॉर्ड बदला गया तो बदलाव पकड़ में आ जाता है। | ಕಂಪನಿಯು ನಿಮ್ಮ ಡೇಟಾ ಬಳಸಿದಾಗಲೆಲ್ಲ ಅದು ದಾಖಲಾಗುತ್ತದೆ. ನಂತರ ದಾಖಲೆಯನ್ನು ಬದಲಿಸಿದರೆ ಆ ಬದಲಾವಣೆ ಗೊತ್ತಾಗುತ್ತದೆ. |
| protect_4 | When a company needs sensitive details, they are encrypted on this phone first. The company gets a decision, not your details. In this build the secure processor is simulated. | जब किसी कंपनी को संवेदनशील जानकारी चाहिए, तो वह पहले इसी फ़ोन पर एन्क्रिप्ट होती है। कंपनी को फ़ैसला मिलता है, आपकी जानकारी नहीं। इस डेमो में सुरक्षित प्रोसेसर नकली (सिम्युलेटेड) है। | ಕಂಪನಿಗೆ ಸೂಕ್ಷ್ಮ ವಿವರಗಳು ಬೇಕಾದಾಗ, ಅವು ಮೊದಲು ಈ ಫೋನ್‌ನಲ್ಲೇ ಎನ್‌ಕ್ರಿಪ್ಟ್ ಆಗುತ್ತವೆ. ಕಂಪನಿಗೆ ನಿರ್ಧಾರ ಸಿಗುತ್ತದೆ, ನಿಮ್ಮ ವಿವರಗಳಲ್ಲ. ಈ ಡೆಮೊದಲ್ಲಿ ಸುರಕ್ಷಿತ ಪ್ರೊಸೆಸರ್ ಅನುಕರಣೆಯಾಗಿದೆ. |
| protect_note | Sammati is a prototype with made-up data. It is aligned with the principles of India's DPDP Act, 2023. This is not legal advice and not a certification. What is mapped, and what is still unchecked, is in docs/dpdp-mapping.md. | Sammati एक प्रोटोटाइप है और इसमें बनावटी डेटा है। यह भारत के DPDP अधिनियम, 2023 के सिद्धांतों के अनुरूप बनाया गया है। यह क़ानूनी सलाह या प्रमाणन नहीं है। क्या मैप किया गया है और क्या अभी जाँचना बाकी है, यह docs/dpdp-mapping.md में है। | Sammati ಒಂದು ಮಾದರಿ ಅಪ್ಲಿಕೇಶನ್ ಆಗಿದ್ದು ಕಾಲ್ಪನಿಕ ಡೇಟಾ ಬಳಸುತ್ತದೆ. ಇದನ್ನು ಭಾರತದ DPDP ಕಾಯ್ದೆ, 2023 ರ ತತ್ವಗಳಿಗೆ ಅನುಗುಣವಾಗಿ ರೂಪಿಸಲಾಗಿದೆ. ಇದು ಕಾನೂನು ಸಲಹೆ ಅಥವಾ ಪ್ರಮಾಣೀಕರಣ ಅಲ್ಲ. ಯಾವುದನ್ನು ಹೋಲಿಸಲಾಗಿದೆ ಮತ್ತು ಯಾವುದನ್ನು ಇನ್ನೂ ಪರಿಶೀಲಿಸಬೇಕು ಎಂಬುದು docs/dpdp-mapping.md ನಲ್ಲಿದೆ. |

### 6.2 Keys added with the proof sheet, cascade list and "How this protects you"

These shipped in the app before the spec listed them; the table is the app's text, so spec and code agree (the consistency pass, `tasks.md`).

| Key | English | Hindi | Kannada |
|---|---|---|---|
| appName | Sammati | Sammati | Sammati |
| scan_paste_hint | Paste the QR text here | यहाँ QR का पाठ पेस्ट करें | QR ಪಠ್ಯವನ್ನು ಇಲ್ಲಿ ಅಂಟಿಸಿ |
| scan_paste_open | Open | खोलें | ತೆರೆಯಿರಿ |
| receipt_view_proof | View proof | प्रमाण देखें | ಪುರಾವೆ ನೋಡಿ |
| proof_headline | This access was recorded and locked on the ledger. | यह एक्सेस रिकॉर्ड किया गया और लेजर पर लॉक किया गया। | ಈ ಪ್ರವೇಶ ದಾಖಲಾಗಿದೆ ಮತ್ತು ಲೆಡ್ಜರ್‌ನಲ್ಲಿ ಲಾಕ್ ಮಾಡಲಾಗಿದೆ. |
| proof_record_hash | Record hash | रिकॉर्ड हैश | ದಾಖಲೆ ಹ್ಯಾಶ್ |
| proof_batch_anchor | Batch anchor | बैच एंकर | ಬ್ಯಾಚ್ ಆಂಕರ್ |
| proof_merkle_verified | Verified ✓ | सत्यापित ✓ | ಪರಿಶೀಲಿಸಲಾಗಿದೆ ✓ |
| proof_merkle_failed | Verification failed | सत्यापन विफल | ಪರಿಶೀಲನೆ ವಿಫಲವಾಗಿದೆ |
| proof_merkle_checking | Checking… | जाँच हो रही है… | ಪರಿಶೀಲಿಸಲಾಗುತ್ತಿದೆ… |
| proof_open_explorer | Open in block explorer | ब्लॉक एक्सप्लोरर में खोलें | ಬ್ಲಾಕ್ ಎಕ್ಸ್‌ಪ್ಲೋರರ್‌ನಲ್ಲಿ ತೆರೆಯಿರಿ |
| proof_consent_signer | Signer (you) | हस्ताक्षरकर्ता (आप) | ಸಹಿ ಮಾಡಿದವರು (ನೀವು) |
| proof_ledger_head | Ledger head | लेजर हेड | ಲೆಡ್ಜರ್ ಹೆಡ್ |
| proof_consent_tx | Transaction | लेन-देन | ವಹಿವಾಟು |
| proof_loading | Loading proof… | प्रमाण लोड हो रहा है… | ಪುರಾವೆ ಲೋಡ್ ಆಗುತ್ತಿದೆ… |
| proof_failed | Could not load proof. Try again. | प्रमाण लोड नहीं हो सका। दोबारा कोशिश करें। | ಪುರಾವೆ ಲೋಡ್ ಮಾಡಲಾಗಲಿಲ್ಲ. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ. |
| cascade_title | Also told | इन्हें भी बताया गया | ಇವರಿಗೂ ತಿಳಿಸಲಾಗಿದೆ |
| cascade_waiting | Waiting… | प्रतीक्षा में… | ಕಾಯುತ್ತಿದೆ… |
| cascade_acked | {n} s ago | {n} सेकंड पहले | {n} ಸೆಕೆಂಡ್ ಹಿಂದೆ |

Have a native speaker check every Hindi and Kannada string, including purpose descriptions, before release.

### 6.3 Keys for the account and profile (W-15 to W-17)

Hindi and Kannada are first drafts and need the native-speaker check, like the rest. The `cat_*` rows are the data category labels of the registry (`shared/src/categories.ts`). They are **not** ARB keys: the wallet reads them from the registry in the app's language (`data_categories.dart`, kept identical by `data_categories_test.dart` against the shared vectors), so each label exists once. A key that already exists keeps its text unless it appears here (`share_intro` changes). The strings `vault_profile_title`, `vault_profile_note`, `vault_pan`, `vault_income`, `vault_score` and `share_use_demo` belonged to the removed sample profile and are deleted.

| Key | English | Hindi | Kannada |
|---|---|---|---|
| acct_step | Step {n} of 3 | चरण {n} / 3 | ಹಂತ {n} / 3 |
| acct_id_title | Choose your Sammati ID | अपनी Sammati ID चुनें | ನಿಮ್ಮ Sammati ID ಆಯ್ಕೆಮಾಡಿ |
| acct_id_checking | Checking… | जाँच हो रही है… | ಪರಿಶೀಲಿಸಲಾಗುತ್ತಿದೆ… |
| acct_id_available | {handle} is available | {handle} उपलब्ध है | {handle} ಲಭ್ಯವಿದೆ |
| acct_id_later | Choose later | बाद में चुनें | ನಂತರ ಆಯ್ಕೆಮಾಡಿ |
| acct_registering | Your wallet is created. Registering {handle}… | आपका वॉलेट बन गया है। {handle} पंजीकृत हो रही है… | ನಿಮ್ಮ ವಾಲೆಟ್ ರಚಿಸಲಾಗಿದೆ. {handle} ನೋಂದಾಯಿಸಲಾಗುತ್ತಿದೆ… |
| acct_register_failed | Your wallet is ready, but {handle} could not be registered. | आपका वॉलेट तैयार है, लेकिन {handle} पंजीकृत नहीं हो सकी। | ನಿಮ್ಮ ವಾಲೆಟ್ ಸಿದ್ಧವಾಗಿದೆ, ಆದರೆ {handle} ನೋಂದಾಯಿಸಲು ಆಗಲಿಲ್ಲ. |
| acct_choose_another | Choose another ID | दूसरी ID चुनें | ಬೇರೆ ID ಆಯ್ಕೆಮಾಡಿ |
| acct_profile_title | Your details | आपकी जानकारी | ನಿಮ್ಮ ವಿವರಗಳು |
| acct_profile_body | Fill in what you like, once. Every field is optional. A company only gets a detail after you say yes to a purpose that needs it. | जो चाहें, एक बार भर दें। हर खाना वैकल्पिक है। किसी कंपनी को कोई जानकारी तभी मिलती है जब आप उस उद्देश्य के लिए हाँ कहें जिसे उसकी ज़रूरत है। | ನಿಮಗೆ ಬೇಕಾದದ್ದನ್ನು ಒಮ್ಮೆ ತುಂಬಿ. ಪ್ರತಿ ಕ್ಷೇತ್ರವೂ ಐಚ್ಛಿಕ. ಆ ವಿವರ ಬೇಕಾದ ಉದ್ದೇಶಕ್ಕೆ ನೀವು ಹೌದು ಎಂದ ನಂತರವೇ ಕಂಪನಿಗೆ ಅದು ಸಿಗುತ್ತದೆ. |
| acct_skip | Skip for now | अभी छोड़ें | ಈಗ ಬಿಟ್ಟುಬಿಡಿ |
| acct_finish | Save and continue | सहेजें और आगे बढ़ें | ಉಳಿಸಿ ಮುಂದುವರಿಸಿ |
| profile_title | My details | मेरी जानकारी | ನನ್ನ ವಿವರಗಳು |
| profile_group_identity | Who you are | आप कौन हैं | ನೀವು ಯಾರು |
| profile_group_contact | How to reach you | आप तक कैसे पहुँचें | ನಿಮ್ಮನ್ನು ಸಂಪರ್ಕಿಸುವ ವಿಧಾನ |
| profile_group_financial | Money | पैसा | ಹಣಕಾಸು |
| profile_group_health | Health | स्वास्थ्य | ಆರೋಗ್ಯ |
| profile_group_prefs | Your preferences | आपकी पसंद | ನಿಮ್ಮ ಆದ್ಯತೆಗಳು |
| profile_private | Stored only on this phone, locked with your fingerprint or PIN. Sammati's servers never receive them. | केवल इसी फ़ोन में रखी जाती है, आपके फ़िंगरप्रिंट या PIN से बंद। Sammati के सर्वर इन्हें कभी नहीं पाते। | ಈ ಫೋನ್‌ನಲ್ಲಿ ಮಾತ್ರ ಉಳಿಯುತ್ತದೆ, ನಿಮ್ಮ ಫಿಂಗರ್‌ಪ್ರಿಂಟ್ ಅಥವಾ PIN ನಿಂದ ಲಾಕ್ ಆಗಿರುತ್ತದೆ. Sammati ಸರ್ವರ್‌ಗಳಿಗೆ ಇದು ಎಂದಿಗೂ ತಲುಪುವುದಿಲ್ಲ. |
| profile_locked | Your details are locked | आपकी जानकारी बंद है | ನಿಮ್ಮ ವಿವರಗಳು ಲಾಕ್ ಆಗಿವೆ |
| profile_unlock | Unlock | खोलें | ಅನ್‌ಲಾಕ್ ಮಾಡಿ |
| auth_reason_profile | Confirm to open your details | अपनी जानकारी खोलने के लिए पुष्टि करें | ನಿಮ್ಮ ವಿವರಗಳನ್ನು ತೆರೆಯಲು ದೃಢೀಕರಿಸಿ |
| profile_empty | Nothing added yet. Add a detail once and use it with any company. | अभी कुछ नहीं जोड़ा। एक बार जोड़ें और किसी भी कंपनी के साथ इस्तेमाल करें। | ಇನ್ನೂ ಏನನ್ನೂ ಸೇರಿಸಿಲ್ಲ. ಒಮ್ಮೆ ಸೇರಿಸಿ, ಯಾವುದೇ ಕಂಪನಿಯೊಂದಿಗೆ ಬಳಸಿ. |
| profile_not_set | Not added | जोड़ा नहीं गया | ಸೇರಿಸಿಲ್ಲ |
| profile_save | Save | सहेजें | ಉಳಿಸಿ |
| profile_remove | Remove | हटाएँ | ತೆಗೆದುಹಾಕಿ |
| profile_saved | Saved on this phone | इस फ़ोन में सहेजा गया | ಈ ಫೋನ್‌ನಲ್ಲಿ ಉಳಿಸಲಾಗಿದೆ |
| profile_lost | Your saved details could not be read. Add them again. | आपकी सहेजी जानकारी पढ़ी नहीं जा सकी। उसे फिर से जोड़ें। | ನಿಮ್ಮ ಉಳಿಸಿದ ವಿವರಗಳನ್ನು ಓದಲಾಗಲಿಲ್ಲ. ಅವನ್ನು ಮತ್ತೆ ಸೇರಿಸಿ. |
| cat_identity_name | Full name | पूरा नाम | ಪೂರ್ಣ ಹೆಸರು |
| cat_identity_dob | Date of birth | जन्म तिथि | ಹುಟ್ಟಿದ ದಿನಾಂಕ |
| cat_identity_gender | Gender | लिंग | ಲಿಂಗ |
| cat_contact_mobile | Mobile number | मोबाइल नंबर | ಮೊಬೈಲ್ ಸಂಖ್ಯೆ |
| cat_contact_email | Email | ईमेल | ಇಮೇಲ್ |
| cat_contact_address | Home address | घर का पता | ಮನೆಯ ವಿಳಾಸ |
| cat_financial_pan | PAN | पैन (PAN) | ಪ್ಯಾನ್ (PAN) |
| cat_financial_income_band | Yearly income | वार्षिक आय | ವಾರ್ಷಿಕ ಆದಾಯ |
| cat_financial_employment | Type of work | काम का प्रकार | ಕೆಲಸದ ಬಗೆ |
| cat_financial_employer | Employer | नियोक्ता | ಉದ್ಯೋಗದಾತ |
| cat_health_blood_group | Blood group | रक्त समूह | ರಕ್ತದ ಗುಂಪು |
| cat_health_allergies | Allergies | एलर्जी | ಅಲರ್ಜಿಗಳು |
| cat_health_insurance_policy | Health insurance policy number | स्वास्थ्य बीमा पॉलिसी नंबर | ಆರೋಗ್ಯ ವಿಮೆ ಪಾಲಿಸಿ ಸಂಖ್ಯೆ |
| cat_prefs_food | Food preference | भोजन की पसंद | ಆಹಾರದ ಆದ್ಯತೆ |
| cat_prefs_delivery_address | Delivery address | डिलीवरी का पता | ಡೆಲಿವರಿ ವಿಳಾಸ |
| gender_female | Female | महिला | ಮಹಿಳೆ |
| gender_male | Male | पुरुष | ಪುರುಷ |
| gender_other | Other | अन्य | ಇತರೆ |
| gender_prefer_not | Prefer not to say | बताना नहीं चाहते | ಹೇಳಲು ಇಷ್ಟವಿಲ್ಲ |
| food_vegetarian | Vegetarian | शाकाहारी | ಸಸ್ಯಾಹಾರಿ |
| food_non_vegetarian | Non-vegetarian | मांसाहारी | ಮಾಂಸಾಹಾರಿ |
| food_vegan | Vegan | वीगन | ವೀಗನ್ |
| dob_hint | DD/MM/YYYY | DD/MM/YYYY | DD/MM/YYYY |
| err_name | Enter your full name, 2 to 80 characters | अपना पूरा नाम दर्ज करें, 2 से 80 अक्षर | ನಿಮ್ಮ ಪೂರ್ಣ ಹೆಸರು ನಮೂದಿಸಿ, 2 ರಿಂದ 80 ಅಕ್ಷರಗಳು |
| err_dob | Enter a real date like 31/12/1995 | 31/12/1995 जैसी असली तारीख दर्ज करें | 31/12/1995 ನಂತಹ ನಿಜವಾದ ದಿನಾಂಕ ನಮೂದಿಸಿ |
| err_mobile | Enter a 10-digit mobile number | 10 अंकों का मोबाइल नंबर दर्ज करें | 10 ಅಂಕಿಗಳ ಮೊಬೈಲ್ ಸಂಖ್ಯೆ ನಮೂದಿಸಿ |
| err_email | Enter an email like name@example.com | name@example.com जैसा ईमेल दर्ज करें | name@example.com ನಂತಹ ಇಮೇಲ್ ನಮೂದಿಸಿ |
| err_text | Too short or too long | बहुत छोटा या बहुत लंबा | ತುಂಬಾ ಚಿಕ್ಕದು ಅಥವಾ ತುಂಬಾ ಉದ್ದ |
| err_policy | Use 4 to 30 letters, digits or dashes | 4 से 30 अक्षर, अंक या डैश इस्तेमाल करें | 4 ರಿಂದ 30 ಅಕ್ಷರ, ಅಂಕಿ ಅಥವಾ ಡ್ಯಾಶ್ ಬಳಸಿ |
| share_intro | {company} needs these details for this purpose. They are encrypted on this phone, so {company} never sees them. | {company} को इस उद्देश्य के लिए ये जानकारी चाहिए। ये इसी फ़ोन पर एन्क्रिप्ट होती हैं, इसलिए {company} इन्हें कभी नहीं देखती। | ಈ ಉದ್ದೇಶಕ್ಕಾಗಿ {company} ಗೆ ಈ ವಿವರಗಳು ಬೇಕು. ಅವು ಈ ಫೋನ್‌ನಲ್ಲೇ ಎನ್‌ಕ್ರಿಪ್ಟ್ ಆಗುತ್ತವೆ, ಆದ್ದರಿಂದ {company} ಅವನ್ನು ಎಂದಿಗೂ ನೋಡುವುದಿಲ್ಲ. |
| share_have | From My details | मेरी जानकारी से | ನನ್ನ ವಿವರಗಳಿಂದ |
| share_missing | {company} also needs these | {company} को ये भी चाहिए | {company} ಗೆ ಇವೂ ಬೇಕು |
| share_saved_note | Saved in My details, so you only type them once. | मेरी जानकारी में सहेजा जाता है, ताकि आपको एक ही बार लिखना पड़े। | ನನ್ನ ವಿವರಗಳಲ್ಲಿ ಉಳಿಸಲಾಗುತ್ತದೆ, ಆದ್ದರಿಂದ ಒಮ್ಮೆ ಮಾತ್ರ ಟೈಪ್ ಮಾಡಿದರೆ ಸಾಕು. |
| share_none_needed | {company} does not need any details from you for this. | {company} को इसके लिए आपसे कोई जानकारी नहीं चाहिए। | ಇದಕ್ಕಾಗಿ {company} ಗೆ ನಿಮ್ಮಿಂದ ಯಾವುದೇ ವಿವರ ಬೇಕಿಲ್ಲ. |
| share_edit | Edit | बदलें | ಬದಲಿಸಿ |
| details_changed | Your details changed. Update what {company} holds? | आपकी जानकारी बदली है। {company} के पास जो है उसे अपडेट करें? | ನಿಮ್ಮ ವಿವರಗಳು ಬದಲಾಗಿವೆ. {company} ಬಳಿ ಇರುವುದನ್ನು ಅಪ್‌ಡೇಟ್ ಮಾಡಬೇಕೆ? |
| details_update | Update | अपडेट करें | ಅಪ್‌ಡೇಟ್ ಮಾಡಿ |
| me_about | About | परिचय | ಕುರಿತು |
| about_title | About Sammati | Sammati के बारे में | Sammati ಕುರಿತು |
| about_prototype | Sammati is a prototype. Use made-up details. | Sammati एक प्रोटोटाइप है। बनावटी जानकारी का उपयोग करें। | Sammati ಒಂದು ಮಾದರಿ ಅಪ್ಲಿಕೇಶನ್. ಕಾಲ್ಪನಿಕ ವಿವರಗಳನ್ನು ಬಳಸಿ. |
| about_no_recovery_title | No account recovery in this build | इस संस्करण में खाता पुनर्प्राप्ति नहीं है | ಈ ಆವೃತ್ತಿಯಲ್ಲಿ ಖಾತೆ ಮರುಪಡೆಯುವಿಕೆ ಇಲ್ಲ |
| about_no_recovery_body | If you lose this phone or clear the app's data, your wallet, your Sammati ID and your saved details are gone, and you start again with a new account. Backup and recovery are planned for a real release. | यह फ़ोन खो जाए या ऐप का डेटा मिट जाए, तो आपका वॉलेट, आपकी Sammati ID और सहेजी हुई जानकारी चली जाती है और आपको नया खाता बनाना पड़ता है। असली संस्करण में बैकअप और पुनर्प्राप्ति की योजना है। | ಈ ಫೋನ್ ಕಳೆದುಹೋದರೆ ಅಥವಾ ಆ್ಯಪ್‌ನ ಡೇಟಾ ಅಳಿಸಿದರೆ, ನಿಮ್ಮ ವಾಲೆಟ್, ನಿಮ್ಮ Sammati ID ಮತ್ತು ಉಳಿಸಿದ ವಿವರಗಳು ಹೋಗುತ್ತವೆ, ಮತ್ತು ನೀವು ಹೊಸ ಖಾತೆಯೊಂದಿಗೆ ಮತ್ತೆ ಆರಂಭಿಸಬೇಕು. ನಿಜವಾದ ಬಿಡುಗಡೆಯಲ್ಲಿ ಬ್ಯಾಕಪ್ ಮತ್ತು ಮರುಪಡೆಯುವಿಕೆಗೆ ಯೋಜನೆ ಇದೆ. |

### 6.4 Keys for data use (W-18)

| Key | English | Hindi | Kannada |
|---|---|---|---|
| activity_used | {company} used your {data} for {purpose}. Decision shared: {outcome}. | {company} ने {purpose} के लिए आपका {data} इस्तेमाल किया। साझा किया गया फ़ैसला: {outcome}। | {company} {purpose} ಗಾಗಿ ನಿಮ್ಮ {data} ಬಳಸಿದೆ. ಹಂಚಿಕೊಂಡ ನಿರ್ಧಾರ: {outcome}. |
| activity_used_blocked | {company} tried to use your data for {purpose}. Blocked. | {company} ने {purpose} के लिए आपका डेटा इस्तेमाल करने की कोशिश की। रोका गया। | {company} {purpose} ಗಾಗಿ ನಿಮ್ಮ ಡೇಟಾ ಬಳಸಲು ಪ್ರಯತ್ನಿಸಿದೆ. ನಿರ್ಬಂಧಿಸಲಾಗಿದೆ. |
| outcome_approved | approved | मंज़ूर | ಅನುಮೋದಿಸಲಾಗಿದೆ |
| outcome_declined | declined | अस्वीकृत | ತಿರಸ್ಕರಿಸಲಾಗಿದೆ |
| list_and | {rest} and {last} | {rest} और {last} | {rest} ಮತ್ತು {last} |
| use_title | How your data was used | आपके डेटा का उपयोग कैसे हुआ | ನಿಮ್ಮ ಡೇಟಾ ಹೇಗೆ ಬಳಕೆಯಾಯಿತು |
| use_what | What was used | क्या इस्तेमाल हुआ | ಏನು ಬಳಕೆಯಾಯಿತು |
| use_stored | Where it was stored | कहाँ रखा गया | ಎಲ್ಲಿ ಸಂಗ್ರಹಿಸಲಾಗಿದೆ |
| use_stored_value | Encrypted at rest on the Processor. Ciphertext hash: | प्रोसेसर पर एन्क्रिप्टेड रूप में। सिफरटेक्स्ट हैश: | ಪ್ರೊಸೆಸರ್‌ನಲ್ಲಿ ಎನ್‌ಕ್ರಿಪ್ಟ್ ಆಗಿ. ಸೈಫರ್‌ಟೆಕ್ಸ್ಟ್ ಹ್ಯಾಶ್: |
| use_stored_unknown | Not recorded on this phone | इस फ़ोन पर दर्ज नहीं | ಈ ಫೋನ್‌ನಲ್ಲಿ ದಾಖಲಾಗಿಲ್ಲ |
| use_where | Where it was processed | कहाँ प्रोसेस हुआ | ಎಲ್ಲಿ ಸಂಸ್ಕರಿಸಲಾಯಿತು |
| use_where_value | Sammati Processor (simulated enclave) | Sammati प्रोसेसर (सिम्युलेटेड एन्क्लेव) | Sammati ಪ್ರೊಸೆಸರ್ (ಅನುಕರಣೆ ಎನ್‌ಕ್ಲೇವ್) |
| use_left | What left the Processor | प्रोसेसर से क्या बाहर गया | ಪ್ರೊಸೆಸರ್‌ನಿಂದ ಹೊರಬಂದದ್ದು |
| use_left_value | Decision only: {outcome}. No details. | सिर्फ़ फ़ैसला: {outcome}। कोई जानकारी नहीं। | ನಿರ್ಧಾರ ಮಾತ್ರ: {outcome}. ವಿವರಗಳಿಲ್ಲ. |
| erased_named | {company} no longer holds your {data}. | {company} के पास अब आपका {data} नहीं है। | {company} ಬಳಿ ಇನ್ನು ನಿಮ್ಮ {data} ಇಲ್ಲ. |

## 7. Accessibility and quality floor
- Contrast AA minimum; status never relies on colour alone (chips carry text and icon).
- Screen-reader labels on switches ("Credit check, QuickLoan, on").
- Reduced motion disables the pass-cut animation, leaving an instant state change.
- Test on a real mid-range Android phone in bright light.
