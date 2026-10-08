# DRD — Data Requirements (Sammati)

## 1. Data classification and the on-chain rule

| Class | Examples | On chain? | Where it lives |
|---|---|---|---|
| Pseudonymous identifier | Principal address, fiduciary address | Yes | Chain, Core DB |
| Consent metadata | Purpose id, status, expiry, notice hash | Yes | Chain, Core cache |
| Integrity artefacts | Ledger head, Merkle roots | Yes | Chain |
| Access log entries | Who requested what, decision, time | **Hash only** (via Merkle root) | Core DB (full entry) |
| Notice text | Plain-language purpose descriptions | **Hash only** | Core DB / console |
| Personal data | Name, phone, income, health record | **Never** | Company's own system (fake data in demo) |
| Sammati ID (handle) | `asha@sammati` mapped to a principal address | **Never** | Core DB (`identities`). Pseudonymous: it names no one, and no phone or email is stored |
| Request target | Which wallet a targeted request is addressed to | **Never** | Core DB (`request_targets`). Never returned to the company: it sees an opaque request id and a status |
| Company application | Name, sector, purposes, processors a company asks to register | **Never** | Core DB (`fiduciary_applications`). Company data, not customer data; the purposes later go on chain as hashes only |
| Contact email (demo) | The applicant's email address | **Never** | The application row only, until the regulator decides, then erased. Never in a log, event or response to anyone but the regulator |
| API key | The secret a company's server sends to Core | **Never** | Only `SHA-256(key)` in Core DB (`fiduciary_credentials`). The key itself is held in memory once, for the applicant's single read |
| Company and processor private keys (demo shortcut) | Keys Core generates for approved companies and their processors | **Never** | Core DB (`fiduciary_keys`, `processor_keys`), disclosed in `demo.md`. Production: the company holds its own key and Core stores only the address |
| Company-side alias | "Customer #4821" mapped to a principal address | **Never** | Company's system only |
| Vault ciphertext | An AES-GCM envelope of PAN, income band and score | **Never** | The Processor's own database only (§3, `vault`) |
| Vault handle and ciphertext hash | `keccak256(envelope)`, `keccak256(ciphertext ‖ tag)` | No (they could be anchored, but are not) | Processor DB, the company's system, WebSocket events |
| Processor key | The X25519 private key | **Never** | Processor memory (or `PROCESSOR_KEY` in its environment) only. Never in a database, a log, an event or Core |
| Loan decision | `approved`, limit, decision codes | **Never** | Returned to the company, which holds it as its own data; not stored by the Processor |

**Rule:** if a field could identify a real person on its own, it does not go on chain and does not go into Sammati's database.

**Ciphertext is not personal data in Sammati's databases, and only because the key is held solely by the Processor.** Core, the company, the web apps, the auditor and anyone with a copy of a database see random-looking bytes they cannot open: Core never receives an envelope and has no key. That claim holds only while the key stays in the Processor; a deployment that gave the key to any other party would make the vault personal data again and move it out of this classification. The demo profile is fictional in any case.

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
  slug TEXT UNIQUE,                    -- console route /company/<slug> (R-04). Always set; nullable only because a database created before R-01 gets the column by migration and the seed fills it
  sandbox INTEGER NOT NULL DEFAULT 0,  -- 1: only test customers may be asked (R-03). Seed companies are 0
  demo INTEGER NOT NULL DEFAULT 0      -- 1 for the seed companies, which have a simulator backend
);

CREATE TABLE purposes (
  id TEXT PRIMARY KEY,                 -- purposeId (bytes32 hex)
  fiduciary TEXT NOT NULL REFERENCES fiduciaries(address),
  code TEXT NOT NULL,                  -- e.g. credit_check
  title_en TEXT NOT NULL, title_hi TEXT, title_kn TEXT,
  desc_en TEXT NOT NULL, desc_hi TEXT, desc_kn TEXT,
  data_categories TEXT NOT NULL,       -- JSON array
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
  created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
  seen_at INTEGER, decided_at INTEGER
);

CREATE TABLE blocks (                  -- "Block this company" (N-02)
  principal TEXT NOT NULL, fiduciary TEXT NOT NULL, blocked_at INTEGER NOT NULL,
  PRIMARY KEY (principal, fiduciary)
);

CREATE TABLE rights_requests (
  id TEXT PRIMARY KEY,
  principal TEXT NOT NULL, fiduciary TEXT NOT NULL,
  type TEXT NOT NULL,                  -- access | erasure | grievance
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
```

Rules: `fiduciary_credentials` of the seed companies is filled at seed time from `demoApiKey(slug)`. A reset (`clearAll`) empties every table above, because the chain they describe is gone. Private keys and API keys never appear in a response, event, log line or error message; the only place a key is ever returned is the applicant's one read of their own status.

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
  erase_cause TEXT                     -- withdrawn | expired | no_consent | superseded
);
CREATE INDEX vault_live ON vault (principal, fiduciary, purpose_code) WHERE erased_at IS NULL;
```

Rules: no column ever holds plaintext, a key or a decrypted field. A live row has `ciphertext` and no `erased_at`; an erased row has the reverse and keeps its metadata so a later call can be answered ("erased because consent was withdrawn") without keeping data. At most one live row exists per `(principal, fiduciary, purpose_code)`.

## 4. Canonical formats

### 4.1 Access log entry (hashed form)
```json
{"at":1760000000,"decision":"BLOCKED","endpoint":"GET /customers/:id/credit-profile","fiduciary":"0x..","id":"uuid","latencyMs":12,"principal":"0x..","purposeCode":"credit_check","reason":"CONSENT_WITHDRAWN","seq":42}
```
Addresses in an entry are EIP-55 checksummed (`trd.md` §7). Processor evaluations are logged the same way, as `fiduciary` = the company, `purposeCode` = the purpose, `endpoint` = `POST /v1/processor/evaluate`, `reason` one of `OK` or the five reason codes. Nothing from the vault, not even a handle, is in an entry.

Sorted keys, no whitespace, UTF-8. `hash = keccak256(prevHash || bytes(canonical))`, where `prevHash` is the 32 raw bytes of the previous entry's hash (32 zero bytes for the first entry). `prevHash` and `hash` are stored on the row but are **not** part of the canonical bytes. Integers only (no floats); `reason` is `OK` for ALLOWED entries.

### 4.2 Notice hash
`noticeHash = keccak256(canonicalJSON({ fiduciary, purposes:[{id, desc_en, desc_hi, desc_kn, dataCategories, retentionDays, sharesThirdParty}], version }))`.
The wallet recomputes this locally and compares with the server value before signing.

### 4.2a Description and metadata hashes
- `descHash = keccak256(canonicalJSON({ desc_en, desc_hi, desc_kn }))` of the purpose's plain-language text (the `descHash` passed to `registerPurpose`).
- `metaHash` for a fiduciary is `keccak256(canonicalJSON({ name, sector }))`, for a processor `keccak256(canonicalJSON({ name }))`. Helpers live in `shared/src/canonical.ts`.

### 4.3 Merkle tree
Leaves = `entry.hash`. Parent = `keccak256(min(a,b) || max(a,b))`. Odd node is promoted unchanged. Proof = list of sibling hashes.

### 4.4 Vault envelope
Format, key derivation, AAD, `handle` and `ciphertextHash` are defined in `trd.md` §4.4. The stored `ciphertext` blob is the canonical JSON bytes of the envelope, so `handle = keccak256(blob)` can be recomputed from a row at any time.

## 5. Seed data (demo)

| Fiduciary | Sector | Purposes (code → plain description) | Downstream processors |
|---|---|---|---|
| **QuickLoan** | Fintech lending | `credit_check` → Check your credit eligibility (PAN, income, 12 months). `marketing` → Send you loan offers (phone, email). `bureau_share` → Share repayment history with credit bureaus | CreditBureauX (for `bureau_share`), AdPartnerQ (for `marketing`) |
| **MediCare+** | Health | `treatment` → Use your records for your treatment. `insurance_claim` → Share records with your insurer for claims. `research` → Use anonymised data for medical research | InsureCo (for `insurance_claim`), ResearchLab (for `research`) |
| **FoodRush** | Food delivery | `delivery` → Use your location to deliver orders. `ad_targeting` → Personalise ads from your order history. `partner_share` → Share your orders with restaurant partners | AdNetworkZ (for `ad_targeting`) |

Required (core) purposes such as `delivery` and `treatment` are marked `required`; the wallet shows them as "needed for the service" but still records and allows withdrawal (withdrawing stops the service use, the UI explains the effect).

Demo principal: one seeded wallet address is not used; the real phone generates its own key. A dedicated demo relayer key pays gas; the seed funds it from the admin account.

Fake customer payloads (examples returned by guarded endpoints):
- QuickLoan demo profile: `{ pan: "ABCDE1234F", incomeBand: "6-9 LPA", employment: "salaried", score: 742 }` (fictional). The customer portal (`trd.md` §6.10) holds only the company-side alias, and the wallet's W10 screen can also take the three fields by hand; either way they exist only on the phone and, for one evaluation, in the Processor. **It no longer lives in QuickLoan's backend.** It exists in exactly two places (plus the e2e script, which plays the wallet and so holds a copy in `shared/src/seed.ts` as `DEMO_PROFILE`): the wallet's demo profile screen (`wallet/lib/core/demo_profile.dart`, on the phone) and the Processor's memory while it evaluates (`drd.md` §3 vault holds only its ciphertext). QuickLoan's `credit-profile` endpoint returns `{ handle, ciphertextHash, status }`; its apply endpoint returns `{ decision, limit, reasonCodes }` (`trd.md` §6.8). For the demo profile the decision is `approved`, `limit: 300000`, `["SCORE_FAIR"]`.
- MediCare+ `records`: `{ bloodGroup: "B+", lastVisit: "2026-08-14", note: "Routine checkup" }`
- FoodRush `profile`: `{ homeArea: "Indiranagar", lastOrders: 14 }`

## 6. Retention and deletion
- Chain data is permanent by design and contains no personal data.
- Core DB logs are demo data; `POST /v1/demo/reset` wipes everything.
- Erasure rights requests are tracked as status records; they do not touch the chain.
- Vault ciphertext is kept only while the consent behind it is Active and unexpired: it is erased on withdrawal, on expiry, when consent is found missing, and when a newer submission replaces it (`trd.md` §6.7). Erasure overwrites the `ciphertext` column with `NULL`; the metadata row stays (no personal data) so the audit trail of "stored, then erased because X" survives. The hash-chained access log is not erased: it holds no data from the vault, only that an evaluation happened.
- The Processor's key is never persisted. Restarting the Processor without `PROCESSOR_KEY` generates a new key, which makes every stored ciphertext unreadable: it answers `CIPHERTEXT_INVALID`, and the wallet must submit again. `pnpm demo:up` sets no key on purpose, and `pnpm demo:reset` clears the vault.

## 7. Integrity rules
- `access_logs.seq` strictly increasing per fiduciary with no gaps. A gap is a tamper signal.
- `hash` must equal recomputation from `prev_hash` and canonical entry.
- Every `batch_index` set implies a row in `anchor_batches` whose root matches recomputation.
- `consents_cache` must equal `getConsent` on chain; a reconciliation job runs every 30 s, logs drift, and repairs the cache from the chain (the chain wins).
- If the chain is behind the indexer cursor, or the block at the cursor has a different hash (a reset node), the indexer discards everything it derived from the chain and re-reads from the start block.
