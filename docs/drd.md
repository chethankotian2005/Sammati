# DRD — Data Requirements (Sammati)

## 1. Data classification and the on-chain rule

| Class | Examples | On chain? | Where it lives |
|---|---|---|---|
| Pseudonymous identifier | Principal address, fiduciary address | Yes | Chain, Core DB |
| Consent metadata | Purpose id, status, expiry, notice hash | Yes | Chain, Core cache |
| Integrity artefacts | Ledger head, Merkle roots | Yes | Chain |
| Access log entries | Who requested what, decision, time | **Hash only** (via Merkle root) | Core DB (full entry) |
| Notice text | Plain-language purpose descriptions | **Hash only** | Core DB / console |
| Personal data | Name, phone, income, health record | **Never** | Company's own system. Never in Sammati's databases; a tester types made-up values |
| Customer profile | The fields of the registry in `trd.md` §4.6 (name, date of birth, mobile, email, address, PAN, income band, employment, employer, blood group, allergies, insurance policy, food preference, delivery address) | **Never** | **The customer's phone only**, as AES-256-GCM ciphertext in `flutter_secure_storage` (§3b). Never in Core, the chain, a company, the web apps or any log |
| Profile key | The random key that encrypts the profile at rest | **Never** | The phone's secure storage, read only after the device-credential check. Never sent anywhere |
| Profile envelope | The profile fields one purpose needs, sealed for the Processor | **Never** | Same as the vault ciphertext below: the Processor's database only |
| Sammati ID (handle) | `asha@sammati` mapped to a principal address | **Never** | Core DB (`identities`). Pseudonymous: it names no one, and no phone or email is stored |
| Notification | "Your consent for credit check expires in 3 days" as a type, times and codes | **Never** | Core DB (`notifications`). The words are written on the phone from the type and payload; no personal data is in a row |
| Request target | Which wallet a targeted request is addressed to | **Never** | Core DB (`request_targets`). Never returned to the company: it sees an opaque request id and a status |
| Company application | Name, sector, purposes, processors a company asks to register | **Never** | Core DB (`fiduciary_applications`). Company data, not customer data; the purposes later go on chain as hashes only |
| Contact email | The applicant's email address | **Never** | The application row only, until the regulator decides, then erased. Never in a log, event or response to anyone but the regulator |
| API key | The secret a company's server sends to Core | **Never** | Only `SHA-256(key)` in Core DB (`fiduciary_credentials`). The key itself is held in memory once, for the applicant's single read |
| Company and processor private keys (demo shortcut) | Keys Core generates for approved companies and their processors | **Never** | Core DB (`fiduciary_keys`, `processor_keys`), disclosed in `demo.md`. Production: the company holds its own key and Core stores only the address |
| Company-side alias | "Customer #4821" mapped to a principal address | **Never** | Company's system only |
| Vault ciphertext | An AES-GCM envelope of PAN, income band and score | **Never** | The Processor's own database only (§3, `vault`) |
| Vault handle and ciphertext hash | `keccak256(envelope)`, `keccak256(ciphertext ‖ tag)` | No (they could be anchored, but are not) | Processor DB, the company's system, WebSocket events |
| Processor key | The X25519 private key | **Never** | Processor memory (or `PROCESSOR_KEY` in its environment) only. Never in a database, a log, an event or Core |
| Loan decision | `approved`, limit, decision codes | **Never** | Returned to the company, which holds it as its own data; not stored by the Processor |

**Rule:** if a field could identify a real person on its own, it does not go on chain and does not go into Sammati's database.

**Hard rule (W-15 to W-17): the profile never leaves the phone in plain form.** Core, the chain and every other server (the web apps, the company's backend, the Auditor) never receive a profile value, in any request, response, WebSocket event, log line, error message, URL or database row. The only way a profile value leaves the phone is inside a per-purpose ciphertext envelope addressed to the Processor (`trd.md` §4.4), built from just the fields that purpose's data categories name, and opened only by the Processor, in memory, for one evaluation. This is enforced, not just stated: `pnpm e2e` submits a profile of distinctive made-up values and searches every database file, log line and event of the run for them (`trd.md` §11), and a wallet test fails if any request the wallet makes carries one. Nothing in Core's schema has a column that could hold one; adding such a column is a change to this rule first.

**Ciphertext is not personal data in Sammati's databases, and only because the key is held solely by the Processor.** Core, the company, the web apps, the auditor and anyone with a copy of a database see random-looking bytes they cannot open: Core never receives an envelope and has no key. That claim holds only while the key stays in the Processor; a deployment that gave the key to any other party would make the vault personal data again and move it out of this classification. Profile values in this build are made up in any case.

## 2. On-chain data model
See `trd.md` §3 for Solidity structs. Keys:
- `consentKey = keccak256(abi.encode(fiduciary, purposeId))`, stored as `consents[principal][consentKey]`.
- `purposeId = keccak256(abi.encodePacked(fiduciary, code))`.
- `nonces[principal]` monotonic.
- `ledgerHead` single rolling hash, `bytes32(0)` at deployment: `ledgerHead = keccak256(abi.encode(ledgerHead, actionHash))`.
  `actionHash = keccak256(abi.encode(uint8 actionType, address principal, address fiduciary, bytes32 purposeId, uint64 expiresAtOrZero, uint64 blockTimestamp))`.
  Action types: `0` RegisterFiduciary, `1` RegisterPurpose, `2` RegisterProcessor, `3` SetPurposeActive, `4` Grant, `5` Withdraw, `6` Acknowledge. Slots by action (unused slots are zero): RegisterFiduciary → `fiduciary` = the new fiduciary. RegisterPurpose and SetPurposeActive → `fiduciary` = caller, `purposeId`. RegisterProcessor → `principal` = the processor address (the slot is reused), `fiduciary` = caller, `purposeId`. Grant and Withdraw → principal, fiduciary, purposeId. Acknowledge → principal, fiduciary, purposeId (the processor is in the event only). `expiresAtOrZero` is the consent expiry on Grant, 1 or 0 for SetPurposeActive (active or not), otherwise 0.

## 3. Off-chain schema (SQLite)

```sql
CREATE TABLE fiduciaries (
  address TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  sector TEXT NOT NULL,
  color TEXT,
  registered_tx TEXT,
  slug TEXT UNIQUE,                    -- console route /company/<slug> (R-04). Always set
  sandbox INTEGER NOT NULL DEFAULT 0,  -- 1: only test customers may be asked (R-03)
);

CREATE TABLE purposes (
  id TEXT PRIMARY KEY,                 -- purposeId (bytes32 hex)
  fiduciary TEXT NOT NULL REFERENCES fiduciaries(address),
  code TEXT NOT NULL,                  -- e.g. credit_check
  title_en TEXT NOT NULL, title_hi TEXT, title_kn TEXT,
  desc_en TEXT NOT NULL, desc_hi TEXT, desc_kn TEXT,
  data_categories TEXT NOT NULL,       -- JSON array of ids from the registry (trd.md §4.6), unique, in registry order. No free text
  retention_days INTEGER NOT NULL,
  shares_third_party INTEGER NOT NULL DEFAULT 0,
  desc_hash TEXT NOT NULL,
  required INTEGER NOT NULL DEFAULT 0  -- core service purpose vs optional
);

CREATE TABLE processors (
  address TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  purpose_id TEXT NOT NULL REFERENCES purposes(id),
  webhook_url TEXT
);

CREATE TABLE requests (                -- consent requests behind QR codes
  id TEXT PRIMARY KEY,
  fiduciary TEXT NOT NULL,
  purposes TEXT NOT NULL,              -- JSON array of purpose ids
  customer_alias TEXT NOT NULL,        -- company-side alias, shown only in console
  notice_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  status TEXT NOT NULL                 -- open | used | expired
);

CREATE TABLE consents_cache (          -- mirror of chain state
  principal TEXT NOT NULL,
  fiduciary TEXT NOT NULL,
  purpose_id TEXT NOT NULL,
  status TEXT NOT NULL,                -- Active | Withdrawn
  granted_at INTEGER, expires_at INTEGER, updated_at INTEGER,
  notice_hash TEXT,
  last_tx TEXT,
  PRIMARY KEY (principal, fiduciary, purpose_id)
);

CREATE TABLE ledger_events (            -- indexed chain events for explorer
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,                  -- granted | withdrawn | ack | anchor | purpose
  principal TEXT, fiduciary TEXT, purpose_id TEXT,
  tx_hash TEXT NOT NULL, block_number INTEGER NOT NULL,
  ledger_head TEXT, at INTEGER NOT NULL,
  payload TEXT,                        -- JSON
  log_index INTEGER NOT NULL DEFAULT 0, -- position in the block; (tx_hash, log_index) makes indexing idempotent
  UNIQUE (tx_hash, log_index)
);

CREATE TABLE indexer_state (            -- the indexer's cursor, so a restart resumes where it stopped
  key TEXT PRIMARY KEY,                -- last_block | last_block_hash
  value TEXT NOT NULL
);

CREATE TABLE access_logs (
  seq INTEGER NOT NULL,                -- per-fiduciary sequence
  fiduciary TEXT NOT NULL,
  id TEXT NOT NULL,                    -- uuid
  principal TEXT NOT NULL,
  purpose_code TEXT NOT NULL,
  decision TEXT NOT NULL,              -- ALLOWED | BLOCKED
  reason TEXT,                         -- OK | CONSENT_WITHDRAWN | CONSENT_EXPIRED | NO_CONSENT | LEDGER_UNAVAILABLE | NO_PRINCIPAL
  endpoint TEXT NOT NULL,
  latency_ms INTEGER,
  at INTEGER NOT NULL,
  prev_hash TEXT NOT NULL,
  hash TEXT NOT NULL,
  batch_index INTEGER,                 -- set after anchoring
  data_categories TEXT,                -- V-09: JSON array of registry ids the evaluation read. NULL = old format
  outcome TEXT,                        -- V-09: approved | declined | blocked | error | '' . NULL = old format
  PRIMARY KEY (fiduciary, seq)
);

CREATE TABLE anchor_batches (
  fiduciary TEXT NOT NULL,
  idx INTEGER NOT NULL,
  merkle_root TEXT NOT NULL,
  from_seq INTEGER NOT NULL, to_seq INTEGER NOT NULL, count INTEGER NOT NULL,
  tx_hash TEXT NOT NULL, at INTEGER NOT NULL,
  PRIMARY KEY (fiduciary, idx)
);

CREATE TABLE cascade_acks (
  principal TEXT NOT NULL, purpose_id TEXT NOT NULL, processor TEXT NOT NULL,
  notified_at INTEGER, acked_at INTEGER, tx_hash TEXT,
  PRIMARY KEY (principal, purpose_id, processor)
);

CREATE TABLE identities (               -- Sammati IDs (N-01); pseudonymous, no phone or email
  handle TEXT PRIMARY KEY,             -- asha@sammati, lower case
  principal TEXT NOT NULL UNIQUE,      -- one handle per wallet
  registered_at INTEGER NOT NULL
);

CREATE TABLE request_targets (         -- who a request is addressed to (N-02); extends `requests`
  request_id TEXT PRIMARY KEY REFERENCES requests(id),
  fiduciary TEXT NOT NULL,
  principal TEXT,                      -- NULL when the handle was unknown or the request was dropped: the row looks the same to the company
  message TEXT,                        -- at most 140 characters
  status TEXT NOT NULL,                -- sent | seen | granted | declined (expired is computed from expires_at)
  kind TEXT NOT NULL DEFAULT 'targeted',  -- targeted | renewal (a company asked to renew) | self_renewal (the customer pressed Renew; internal, never listed to a company)
  created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
  seen_at INTEGER, decided_at INTEGER
);

CREATE TABLE notifications (          -- the wallet's Alerts (N-03, N-05)
  id TEXT PRIMARY KEY,                 -- ntf_<8 hex>
  dedupe_key TEXT NOT NULL UNIQUE,     -- one row per (consent, threshold) or event: see trd.md §6.12
  principal TEXT NOT NULL,             -- lower-case address
  type TEXT NOT NULL,                  -- consent.expiring | consent.expired | consent.renewal_requested | data.erased | cascade.acknowledged
  fiduciary TEXT NOT NULL,
  purpose_id TEXT,
  payload TEXT NOT NULL,               -- JSON: times, codes, a short company message. Never personal data
  created_at INTEGER NOT NULL,
  read_at INTEGER,
  action_taken TEXT                    -- renewed | let_expire | viewed_proof
);
CREATE INDEX idx_notifications_principal ON notifications(principal, created_at);

CREATE TABLE blocks (                  -- "Block this company" (N-02)
  principal TEXT NOT NULL, fiduciary TEXT NOT NULL, blocked_at INTEGER NOT NULL,
  PRIMARY KEY (principal, fiduciary)
);

CREATE TABLE rights_requests (
  id TEXT PRIMARY KEY,
  principal TEXT NOT NULL, fiduciary TEXT NOT NULL,
  type TEXT NOT NULL,                  -- access | correction | erasure | grievance
  note TEXT, status TEXT NOT NULL,     -- open | in_progress | resolved
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
```

Onboarding tables (R-01 to R-03), all in Core's database:

```sql
CREATE TABLE fiduciary_applications (   -- R-01
  id TEXT PRIMARY KEY,                 -- 16 random bytes, hex: also the applicant's bearer secret
  name TEXT NOT NULL,
  slug TEXT NOT NULL,                  -- unique among fiduciaries and pending applications
  sector TEXT NOT NULL,
  contact_email TEXT,                  -- demo only; set to NULL when the regulator decides
  purposes TEXT NOT NULL,              -- JSON array, trd.md §6.12 ApplicationInput.purposes
  processors TEXT NOT NULL,            -- JSON array
  status TEXT NOT NULL,                -- pending | approved | rejected
  note TEXT,                           -- the regulator's note
  fiduciary TEXT,                      -- set when approval starts; the company's address
  sandbox INTEGER,                     -- the choice made at approval
  created_at INTEGER NOT NULL, decided_at INTEGER
);

CREATE TABLE fiduciary_credentials (    -- R-03: one API key per approved company
  fiduciary TEXT PRIMARY KEY REFERENCES fiduciaries(address),
  api_key_hash TEXT NOT NULL UNIQUE,   -- SHA-256 of the key, hex. The key is never stored
  issued_at INTEGER NOT NULL
);

CREATE TABLE fiduciary_keys (           -- demo shortcut: Core holds the company's key (trd.md §12)
  address TEXT PRIMARY KEY, private_key TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE TABLE processor_keys (           -- demo shortcut: Core signs the processor's acknowledgements
  address TEXT PRIMARY KEY, private_key TEXT NOT NULL, created_at INTEGER NOT NULL
);

CREATE TABLE sandbox_testers (          -- R-03: customers a sandbox company may ask
  principal TEXT PRIMARY KEY, added_at INTEGER NOT NULL
);

CREATE TABLE console_operators (        -- C-10: company operator login
  email TEXT PRIMARY KEY,
  password_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE fiduciary_operators (      -- C-10: operator-to-company link
  fiduciary TEXT REFERENCES fiduciaries(address),
  operator_email TEXT REFERENCES console_operators(email),
  PRIMARY KEY (fiduciary, operator_email)
);

CREATE TABLE console_sessions (         -- C-10: operator sessions
  token TEXT PRIMARY KEY,
  operator_email TEXT REFERENCES console_operators(email),
  expires_at INTEGER NOT NULL
);
```

Rules: no row of `fiduciaries`, `purposes`, `processors` or `fiduciary_credentials` exists until a company is approved (R-02): nothing is pre-registered. A reset (`clearAll`) empties every table above, because the chain they describe is gone. Private keys and API keys never appear in a response, event, log line or error message; the only place a key is ever returned is the applicant's one read of their own status.

The vault lives in the **Processor's own SQLite file** (`processor/data/processor.sqlite`), never in Core's:

```sql
CREATE TABLE vault (
  handle TEXT PRIMARY KEY,             -- keccak256(canonical envelope), bytes32 hex
  principal TEXT NOT NULL,             -- lowercase address
  fiduciary TEXT NOT NULL,             -- lowercase address
  purpose_code TEXT NOT NULL,          -- e.g. credit_check
  ciphertext_hash TEXT NOT NULL,       -- keccak256(ciphertext || tag)
  ciphertext BLOB,                     -- the canonical envelope bytes; NULL once erased
  request_id TEXT NOT NULL,            -- from the signed submission (idempotency)
  created_at INTEGER NOT NULL,
  erased_at INTEGER,                   -- NULL while the ciphertext exists
  erase_cause TEXT,                    -- withdrawn | expired | no_consent | superseded
  version INTEGER NOT NULL DEFAULT 1,  -- V-08: increases per (principal, fiduciary, purpose_code); a correction is a new version
  consent_ref TEXT                     -- the notice hash the submission was bound to, if given
);
CREATE INDEX vault_live ON vault (principal, fiduciary, purpose_code) WHERE erased_at IS NULL;
```

Rules: no column ever holds plaintext, a key or a decrypted field. A live row has `ciphertext` and no `erased_at`; an erased row has the reverse and keeps its metadata so a later call can be answered ("erased because consent was withdrawn") without keeping data. At most one live row exists per `(principal, fiduciary, purpose_code)`.

## 3b. Device-side data (the wallet; not Core's schema)

Written here so the whole data picture is in one place. Nothing in this section is ever sent to Core.

```text
flutter_secure_storage (the platform keystore)
  wallet_private_key   secp256k1 key, read only after the device check (trd.md §4.2)
  wallet_address       public
  profile_key          32 random bytes, hex; read only after the device check
  profile_blob         base64( nonce[12] ‖ ciphertext ‖ tag[16] ), AES-256-GCM, AAD "sammati-profile-v1"
shared_preferences (not secret)
  locale, core_url, account_setup_done, developer options
```

Decrypted `profile_blob`:

```json
{
  "v": 1,
  "fields": { "fullName": "…", "pan": "…" },
  "shares": [
    { "fiduciary": "0x…", "purposeCode": "credit_check", "fields": ["pan", "incomeBand", "employment"],
      "handle": "0x…", "sentAt": 1760000000, "stale": false }
  ]
}
```

`fields` is the profile of `trd.md` §4.6 (flat, string values, any subset). `shares` is a record of what was sent where, **names of fields and handles only, never values**: it lets the wallet say "your details changed, update what QuickLoan holds?" (W-17) when an edit touches a field in a share of a still-active consent. Each share also keeps `ciphertextHash` and `version` (a hash and a number, no values) so the Activity detail can show where the data was stored. `stale` turns true when such a field is edited and false when the share is re-sent; a share is dropped when its consent is withdrawn.

Rules. The profile is optional field by field; an empty profile is valid. It is dropped from memory when the app goes to the background and is re-opened only through the device check. **Account recovery is out of scope in this build**: if the app's data is cleared or the phone is lost, the key, the blob and the Sammati ID's controlling wallet are gone with it, and the customer starts again with a new account (a new principal). The profile cannot be rebuilt from Core, because Core never had it. The production path (an encrypted backup the customer holds, and recovery) is in `architecture.md` §5.9. The wallet's About screen says this in plain words.

## 4. Canonical formats

### 4.1 Access log entry (hashed form)
```json
{"at":1760000000,"decision":"BLOCKED","endpoint":"GET /customers/:id/credit-profile","fiduciary":"0x..","id":"uuid","latencyMs":12,"principal":"0x..","purposeCode":"credit_check","reason":"CONSENT_WITHDRAWN","seq":42}
```
Addresses in an entry are EIP-55 checksummed (`trd.md` §7). Processor evaluations are logged the same way, as `fiduciary` = the company, `purposeCode` = the purpose, `endpoint` = `POST /v1/processor/evaluate`, `reason` one of `OK` or the five reason codes. Nothing from the vault, not even a handle, is in an entry.

Sorted keys, no whitespace, UTF-8. `hash = keccak256(prevHash || bytes(canonical))`, where `prevHash` is the 32 raw bytes of the previous entry's hash (32 zero bytes for the first entry). `prevHash` and `hash` are stored on the row but are **not** part of the canonical bytes. Integers only (no floats); `reason` is `OK` for ALLOWED entries.

### 4.2 Notice hash
`noticeHash = keccak256(canonicalJSON({ fiduciary, purposes:[{id, desc_en, desc_hi, desc_kn, dataCategories, retentionDays, sharesThirdParty}], version }))`.
`dataCategories` is the list of data category ids of the registry (`trd.md` §4.6): unique and in **registry order**, not in the order a company typed them (Core normalises when it stores an application), so the hash is the same however a purpose was declared. Adding a category to the registry does not change an existing notice; changing the id of an existing one would, which is why ids are fixed.
The wallet recomputes this locally and compares with the server value before signing.

### 4.2a Description and metadata hashes
- `descHash = keccak256(canonicalJSON({ desc_en, desc_hi, desc_kn }))` of the purpose's plain-language text (the `descHash` passed to `registerPurpose`).
- `metaHash` for a fiduciary is `keccak256(canonicalJSON({ name, sector }))`, for a processor `keccak256(canonicalJSON({ name }))`. Helpers live in `shared/src/canonical.ts`.

### 4.3 Merkle tree
Leaves = `entry.hash`. Parent = `keccak256(min(a,b) || max(a,b))`. Odd node is promoted unchanged. Proof = list of sibling hashes.

### 4.4 Vault envelope
Format, key derivation, AAD, `handle` and `ciphertextHash` are defined in `trd.md` §4.4. The stored `ciphertext` blob is the canonical JSON bytes of the envelope, so `handle = keccak256(blob)` can be recomputed from a row at any time.

### 4.1a Usage record format and chain epochs (V-09)

The canonical entry of §4.1 gains two keys, sorted among the others like any key: `dataCategories` (array of registry ids, in registry order, `[]` when none) and `outcome` (string). Example: `{"at":1760000000,"dataCategories":["financial.income_band","financial.pan"],"decision":"ALLOWED","endpoint":"POST /v1/processor/evaluate",...,"outcome":"approved","reason":"OK","seq":43}`. The hash is computed as before (`keccak256(prevHash || canonical bytes)`). `shared/src/canonical.ts` (`entryCanonical`, `entryFormat`), the SDK, Core's append check, the verifier and the Auditor use the same function.

- **Format** is read from the entry: **1** has no `outcome` key, **2** has `outcome` (and `dataCategories`). Core stores both new columns NULL for format 1 (§3), so a database made before this change is still valid as it is.
- **Epochs.** A chain is a run of format-1 entries followed by a run of format-2 entries. The first format-2 entry carries `prevHash` = 32 zero bytes (a new epoch); every later entry links to its predecessor as usual. A format-1 entry after a format-2 entry is refused (`FORMAT_OUTDATED`) and reported by the verifier as `FORMAT_MIXED`. `seq` stays contiguous across the epoch, because the anchor contract requires it, and Merkle batches may span the boundary since their leaves are only entry hashes.
- **Migration.** There is none to run. Existing rows stay as they are (format 1); the first entry written after the upgrade starts epoch 2. Documented here so an auditor reading an old database knows why the chain restarts at one `seq`.
- A test (`shared`, `core`) builds a mixed chain both ways and requires a refusal, builds epoch 1 then epoch 2 and requires a clean verify, and tampers with `dataCategories` or `outcome` of a stored row and requires a mismatch pinpointed to that record.

### 4.5 Scoring rules (V-09), so a decision can be explained

Deterministic, integers only, in `processor/src/rules.ts`. Input: the opened fields (`pan`, `incomeBand`, `employment`, optionally `score`) and the application (`amount`, `tenureMonths`, optional). The rules read only those fields, and the usage record's `dataCategories` is exactly the registry ids of the fields they read (`financial.pan`, `financial.income_band`, `financial.employment`, nothing else, even if more was opened).

| Step | Rule | Outcome |
|---|---|---|
| 1 | `pan` matches `^[A-Z]{5}[0-9]{4}[A-Z]$` | else declined `PAN_INVALID` |
| 2 | `incomeBand` is one of `0-3 LPA`, `3-6 LPA`, `6-9 LPA`, `9+ LPA` | else declined `INCOME_UNKNOWN`. Base limit 100,000 / 250,000 / 500,000 / 1,000,000 INR |
| 3 | `employment`, when present, is `salaried`, `self-employed`, `student` or `unemployed` | else declined `EMPLOYMENT_UNKNOWN`; `student`, `unemployed` declined `EMPLOYMENT_INELIGIBLE` |
| 4 | score = `score` if given, else 700 (and the code `SCORE_ASSUMED` is added) | `< 650` declined `SCORE_LOW` |
| 5 | limit | score ≥ 750: base (`SCORE_GOOD`); 650 to 749: 60% of base (`SCORE_FAIR`) |
| 6 | rate in basis points | score ≥ 750: 1100; else 1400. `self-employed` +100. Tenure over 12 months: +25 per full 12 months beyond the first 12. Without an application, tenure 12 |
| 7 | `amount`, when given, is at most the limit | else declined `AMOUNT_ABOVE_LIMIT`, with the limit and no rate, so the customer sees what would be possible |

A decline at steps 1 to 4 has `limit: null`, `rateBps: null`. The decision still reveals coarse facts (a score band, a limit): that is data minimisation, said plainly in `demo.md`.

## 5. What a fresh deployment holds (X-01)

Nothing but infrastructure: the two contracts, the regulator's chain account (the admin), and the relayer, funded. No company, purpose, processor, customer, request or access log is pre-registered, in the database or on chain. Every company arrives through R-01 to R-03, and its purposes and processors are exactly those its application declared.

Required (core) purposes, if a company declares them `required`, are shown by the wallet as "needed for the service" but still recorded and withdrawable (withdrawing stops the service use, the UI explains the effect).

No customer data is shipped, and the wallet ships no sample profile. A tester creates an account in the wallet and types made-up values into the profile (W-15, W-17), or into W10 when a consent needs a field; they exist only on the phone (encrypted at rest) and, for the fields one purpose needs, for one evaluation in the Processor. Test fixtures (companies, customers, a throwaway PAN) live in `test/` directories and in `core/scripts/e2e.ts` and never ship with the app.

## 6. Retention and deletion
- The customer's profile lives as long as the app's data on the phone does. Deleting a field deletes it from the blob on the next save; there is no server copy to delete. A copy sealed for the Processor follows the vault rules below (erased on withdrawal, on expiry after the grace period, and when a newer submission replaces it, which is also how a corrected value reaches a company, W-17).
- Chain data is permanent by design and contains no personal data.
- Core DB rows are test data in this build. `pnpm dev:reset` wipes them (`trd.md` §6.4); no HTTP endpoint can.
- Erasure rights requests are tracked as status records; they do not touch the chain.
- Vault ciphertext is kept only while the consent behind it is Active and unexpired: it is erased on withdrawal, on expiry, when consent is found missing, and when a newer submission replaces it (`trd.md` §6.7). Erasure overwrites the `ciphertext` column with `NULL`; the metadata row stays (no personal data) so the audit trail of "stored, then erased because X" survives. The hash-chained access log is not erased: it holds no data from the vault, only that an evaluation happened.
- The Processor's key is never persisted. Restarting the Processor without `PROCESSOR_KEY` generates a new key, which makes every stored ciphertext unreadable: it answers `CIPHERTEXT_INVALID`, and the wallet must submit again. `pnpm demo:up` sets no key on purpose, and `pnpm dev:reset` clears the vault.

## 7. Integrity rules
- An access-log chain has at most one epoch change, from format 1 to format 2, and the first format-2 entry links to the zero hash (§4.1a). Any other mix is a tamper signal.
- `access_logs.seq` strictly increasing per fiduciary with no gaps. A gap is a tamper signal.
- `hash` must equal recomputation from `prev_hash` and canonical entry.
- Every `batch_index` set implies a row in `anchor_batches` whose root matches recomputation.
- `consents_cache` must equal `getConsent` on chain; a reconciliation job runs every 30 s, logs drift, and repairs the cache from the chain (the chain wins).
- If the chain is behind the indexer cursor, or the block at the cursor has a different hash (a reset node), the indexer discards everything it derived from the chain and re-reads from the start block.
