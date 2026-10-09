// QuickLoan's own database. Nothing here can hold a name, PAN, income, phone or email: the customer is a username
// bound to a pseudonymous Sammati address, and the details live encrypted in the Sammati Processor (trd.md §6.14).
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";

export type Db = Database.Database;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  username TEXT PRIMARY KEY,
  password_hash TEXT,
  principal TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  username TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS signups (
  token TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  password_hash TEXT,
  request_id TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS vault (
  principal TEXT PRIMARY KEY,
  handle TEXT NOT NULL,
  ciphertext_hash TEXT NOT NULL,
  status TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS applications (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  amount INTEGER NOT NULL,
  tenure_months INTEGER NOT NULL,
  loan_purpose TEXT NOT NULL,
  decision TEXT NOT NULL,
  limit_amount INTEGER,
  rate_bp INTEGER,
  reasons TEXT NOT NULL,
  status TEXT NOT NULL,
  handle TEXT,
  created_at INTEGER NOT NULL
);
`;

export function openDb(path: string): Db {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.exec(SCHEMA);
  return db;
}
