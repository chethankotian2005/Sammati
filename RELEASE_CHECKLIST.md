# Release checklist

Run this the day of the demo, in this order. Tick nothing you did not see happen. Anything that fails goes on the failure plan in `docs/demo.md` §5.

## 1. On the laptop (10 minutes)
- [ ] `git status` clean, on the commit you will present; `git tag demo-ready`
- [ ] `pnpm install`, then `pnpm -r typecheck`, `pnpm -r test`, `pnpm lint` all pass
- [ ] `pnpm e2e` passes in under 45 s (it starts its own stack: stop `demo:up` first)
- [ ] `pnpm demo:up:fast` is up; `pnpm demo:reset` done; the banner address is the laptop's address on the hotspot
- [ ] `curl http://<lan-ip>:4000/v1/health` says `live`; `curl http://<lan-ip>:4200/health` says `simulated-enclave`
- [ ] Stage view opens on **Data flow** with no "Live feed offline" chip; `/stage/flow?replay=1` plays the recording
- [ ] Amoy explorer links open and show the deployed contracts

## 2. On the real phone (the one you will present with)
Install the release build (`flutter build apk --release`), same hotspot as the laptop.

- [ ] First run: language, intro, create wallet, biometric prompt works (and PIN fallback)
- [ ] Scan the portal QR: the notice shows three purposes in English and in Kannada
- [ ] Grant two purposes: receipt with a transaction; the portal says "Consent received"
- [ ] Console **Run credit check** is ALLOWED; **Share with bureau** is BLOCKED; the phone's feed shows both
- [ ] **Share your details securely** → demo details → the portal says "Data submitted securely"; **Apply** gives a decision; Data flow lanes fill
- [ ] Withdraw: the console turns BLOCKED 451 at once, the cascade list shows an acknowledgement, the phone says the details were erased
- [ ] **Sammati ID**: register `asha@sammati`; console **Send to user** reaches the inbox in about 2 seconds; Review, Decline and Block all work; a made-up ID gets the same "Request sent" and nothing arrives
- [ ] **Expiry** (stack in fast mode): grant with **2 minutes (demo)**; Alerts shows "expires in 1 minute", then "expired"; console **Expiring consents** → **Request renewal**; **Renew** and approve; the same console call is ALLOWED
- [ ] Auditor: **Verify** green; **Tamper** then **Verify** red, naming the record
- [ ] Rotate the phone, set text size to the largest, switch to Hindi: nothing is cut off
- [ ] Airplane mode on, then off: the wallet shows its offline banner and recovers

### Not yet tested on a real phone: do this, then update `demo.md` only if it works
These are specified and built, but never run on a device. Until one has been, the product does not claim them.
- [ ] **Scheduled reminders with the app closed**: grant a 2-minute consent, swipe the app away, wait. Did "Consent expiring soon" appear? Did "Consent expired"? (Android may need "Alarms and reminders" and unrestricted battery for the app.)
- [ ] **A phone notification while the app is open**: send a renewal request from the console; does a banner appear as well as the Alerts item?
- [ ] **A company message with the app in the background** (home button, screen on): does it arrive? With the screen off? Write down exactly what happened; that is the limit to state.
- If any of these fail, the limit in `demo.md` ("the app must be open") already covers it. If the first one passes, `demo.md` may say that reminders for known consents fire with the app closed, on this phone model only.

## 3. The spare phone
- [ ] Same APK installed, wallet created, a different language selected
- [ ] It scans the portal QR and gets ALLOWED (so it can take over mid-demo)
- [ ] Charged, on the hotspot, Do Not Disturb set

## 4. Record the fallback video (once everything above passed)
Record on a **clean** `pnpm demo:reset` run, screen mirrored so both the phone and the laptop are in frame (or record both and join them). Keep the narration to the script.

- [ ] Take 1, full four minutes, as in `docs/demo.md` §2, all eight acts
- [ ] Take 2, three-minute cut (no Acts 6 and 7)
- [ ] Short clips as insurance, each on its own: **withdraw then BLOCKED** (Act 5), **Data flow with the staff view** (Act 4), **tamper then red Verify** (Act 8), **a targeted request arriving** (Act 6), **expiry then Renew then ALLOWED** (Act 7)
- [ ] Also record the replay: `E2E_RECORD_FLOW=web/public/flow-replay.json pnpm e2e`, commit the file
- [ ] Save the files on the laptop **and** on the spare phone; check one plays without a network
- [ ] Say in the video's first line that it is a recording
- [ ] Note the commit hash and date in the file name

## 5. Last five minutes before going on
- [ ] `pnpm demo:reset` (not a restart of the Processor on its own)
- [ ] Register `asha@sammati` on the phone; give MediCare+ the 2-minute consent about two minutes before Act 7
- [ ] Phone brightness up, notifications set as decided, mirroring running
- [ ] Tabs open: Stage (Data flow), console on **Send to user**, portal signed out, Auditor, explorer
- [ ] One person owns the recovery: the recording, the spare phone, and the sentence "let me show you the recording of this step"
