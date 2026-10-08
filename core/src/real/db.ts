import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";

export type Db = Database.Database;

// drd.md §3, plus the two additions noted there: ledger_events.log_index and indexer_state.
const SCHEMA = `
CREATE TABLE IF NOT EXISTS fiduciaries (
  address TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  sector TEXT NOT NULL,
  color TEXT,
  registered_tx TEXT
);

CREATE TABLE IF NOT EXISTS purposes (
  id TEXT PRIMARY KEY,
  fiduciary TEXT NOT NULL REFERENCES fiduciaries(address),
  code TEXT NOT NULL,
  title_en TEXT NOT NULL, title_hi TEXT, title_kn TEXT,
  desc_en TEXT NOT NULL, desc_hi TEXT, desc_kn TEXT,
  data_categories TEXT NOT NULL,
  retention_days INTEGER NOT NULL,
  shares_third_party INTEGER NOT NULL DEFAULT 0,
  desc_hash TEXT NOT NULL,
  required INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS processors (
  address TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  purpose_id TEXT NOT NULL REFERENCES purposes(id),
  webhook_url TEXT
);

CREATE TABLE IF NOT EXISTS requests (
  id TEXT PRIMARY KEY,
  fiduciary TEXT NOT NULL,
  purposes TEXT NOT NULL,
  customer_alias TEXT NOT NULL,
  notice_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  status TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS consents_cache (
  principal TEXT NOT NULL,
  fiduciary TEXT NOT NULL,
  purpose_id TEXT NOT NULL,
  status TEXT NOT NULL,
  granted_at INTEGER, expires_at INTEGER, updated_at INTEGER,
  notice_hash TEXT,
  last_tx TEXT,
  PRIMARY KEY (principal, fiduciary, purpose_id)
);

CREATE TABLE IF NOT EXISTS ledger_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  principal TEXT, fiduciary TEXT, purpose_id TEXT,
  tx_hash TEXT NOT NULL, block_number INTEGER NOT NULL,
  ledger_head TEXT, at INTEGER NOT NULL,
  payload TEXT,
  log_index INTEGER NOT NULL DEFAULT 0,
  UNIQUE (tx_hash, log_index)
);

CREATE TABLE IF NOT EXISTS indexer_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS access_logs (
  seq INTEGER NOT NULL,
  fiduciary TEXT NOT NULL,
  id TEXT NOT NULL,
  principal TEXT NOT NULL,
  purpose_code TEXT NOT NULL,
  decision TEXT NOT NULL,
  reason TEXT,
  endpoint TEXT NOT NULL,
  latency_ms INTEGER,
  at INTEGER NOT NULL,
  prev_hash TEXT NOT NULL,
  hash TEXT NOT NULL,
  batch_index INTEGER,
  PRIMARY KEY (fiduciary, seq)
);

CREATE TABLE IF NOT EXISTS anchor_batches (
  fiduciary TEXT NOT NULL,
  idx INTEGER NOT NULL,
  merkle_root TEXT NOT NULL,
  from_seq INTEGER NOT NULL, to_seq INTEGER NOT NULL, count INTEGER NOT NULL,
  tx_hash TEXT NOT NULL, at INTEGER NOT NULL,
  PRIMARY KEY (fiduciary, idx)
);

CREATE TABLE IF NOT EXISTS cascade_acks (
  principal TEXT NOT NULL, purpose_id TEXT NOT NULL, processor TEXT NOT NULL,
  notified_at INTEGER, acked_at INTEGER, tx_hash TEXT,
  PRIMARY KEY (principal, purpose_id, processor)
);

CREATE TABLE IF NOT EXISTS rights_requests (
  id TEXT PRIMARY KEY,
  principal TEXT NOT NULL, fiduciary TEXT NOT NULL,
  type TEXT NOT NULL,
  note TEXT, status TEXT NOT NULL,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_access_principal ON access_logs (principal, at);
CREATE INDEX IF NOT EXISTS idx_ledger_key ON ledger_events (principal, fiduciary, purpose_id, block_number);
`;

/** Tables that hold state derived from the chain; the indexer rebuilds them after a chain reset. */
const CHAIN_DERIVED = ["ledger_events", "consents_cache", "anchor_batches", "cascade_acks", "indexer_state"] as const;
const ALL_TABLES = [
  ...CHAIN_DERIVED,
  "access_logs",
  "requests",
  "rights_requests",
  "processors",
  "purposes",
  "fiduciaries",
] as const;

export function openDb(path: string): Db {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  return db;
}

export function clearChainDerived(db: Db): void {
  db.transaction(() => {
    for (const t of CHAIN_DERIVED) db.exec(`DELETE FROM ${t}`);
    // Batches vanish with the chain, so the log rows they covered are unanchored again.
    db.exec("UPDATE access_logs SET batch_index = NULL");
  })();
}

export function clearAll(db: Db): void {
  db.transaction(() => {
    for (const t of ALL_TABLES) db.exec(`DELETE FROM ${t}`);
  })();
}
