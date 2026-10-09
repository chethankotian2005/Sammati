// The vault: ciphertext only (drd.md §3). No column holds plaintext, a key or a decrypted field.
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import type { Hex, VaultEraseCause } from "@sammati/shared";

export interface VaultRow {
  handle: Hex;
  principal: Hex;
  fiduciary: Hex;
  purposeCode: string;
  ciphertextHash: Hex;
  /** The canonical envelope bytes; null once erased. */
  ciphertext: Buffer | null;
  requestId: string;
  createdAt: number;
  erasedAt: number | null;
  eraseCause: VaultEraseCause | null;
  /** V-08: increases per (principal, fiduciary, purpose); a correction is a new version. */
  version: number;
  /** The notice hash the submission was bound to, if the wallet gave one. */
  consentRef: string | null;
}

interface Raw {
  handle: string;
  principal: string;
  fiduciary: string;
  purpose_code: string;
  ciphertext_hash: string;
  ciphertext: Buffer | null;
  request_id: string;
  created_at: number;
  erased_at: number | null;
  erase_cause: string | null;
  version: number;
  consent_ref: string | null;
}

const toRow = (r: Raw): VaultRow => ({
  handle: r.handle as Hex,
  principal: r.principal as Hex,
  fiduciary: r.fiduciary as Hex,
  purposeCode: r.purpose_code,
  ciphertextHash: r.ciphertext_hash as Hex,
  ciphertext: r.ciphertext,
  requestId: r.request_id,
  createdAt: r.created_at,
  erasedAt: r.erased_at,
  eraseCause: r.erase_cause as VaultEraseCause | null,
  version: r.version,
  consentRef: r.consent_ref,
});

export class Vault {
  private readonly db: Database.Database;

  constructor(path: string) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new Database(path);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS vault (
        handle TEXT PRIMARY KEY,
        principal TEXT NOT NULL,
        fiduciary TEXT NOT NULL,
        purpose_code TEXT NOT NULL,
        ciphertext_hash TEXT NOT NULL,
        ciphertext BLOB,
        request_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        erased_at INTEGER,
        erase_cause TEXT
      );
      CREATE INDEX IF NOT EXISTS vault_live ON vault (principal, fiduciary, purpose_code) WHERE erased_at IS NULL;
    `);
    // A vault made before versions existed keeps its rows as version 1.
    const have = new Set((this.db.prepare("PRAGMA table_info(vault)").all() as Array<{ name: string }>).map((c) => c.name));
    if (!have.has("version")) this.db.exec("ALTER TABLE vault ADD COLUMN version INTEGER NOT NULL DEFAULT 1");
    if (!have.has("consent_ref")) this.db.exec("ALTER TABLE vault ADD COLUMN consent_ref TEXT");
  }

  get(handle: string): VaultRow | undefined {
    const r = this.db.prepare("SELECT * FROM vault WHERE handle = ?").get(handle) as Raw | undefined;
    return r && toRow(r);
  }

  live(principal: string, fiduciary: string, purposeCode: string): VaultRow[] {
    return (
      this.db
        .prepare("SELECT * FROM vault WHERE principal = ? AND fiduciary = ? AND purpose_code = ? AND erased_at IS NULL")
        .all(principal.toLowerCase(), fiduciary.toLowerCase(), purposeCode) as Raw[]
    ).map(toRow);
  }

  allLive(): VaultRow[] {
    return (this.db.prepare("SELECT * FROM vault WHERE erased_at IS NULL").all() as Raw[]).map(toRow);
  }

  /** The highest version ever stored for this triple, live or erased; 0 when none. */
  maxVersion(principal: string, fiduciary: string, purposeCode: string): number {
    const r = this.db
      .prepare("SELECT MAX(version) AS v FROM vault WHERE principal = ? AND fiduciary = ? AND purpose_code = ?")
      .get(principal.toLowerCase(), fiduciary.toLowerCase(), purposeCode) as { v: number | null };
    return r.v ?? 0;
  }

  insert(row: Omit<VaultRow, "erasedAt" | "eraseCause" | "ciphertext"> & { ciphertext: Buffer }): void {
    this.db
      .prepare(
        "INSERT INTO vault (handle, principal, fiduciary, purpose_code, ciphertext_hash, ciphertext, request_id, created_at, version, consent_ref) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(row.handle, row.principal.toLowerCase(), row.fiduciary.toLowerCase(), row.purposeCode, row.ciphertextHash, row.ciphertext, row.requestId, row.createdAt, row.version, row.consentRef);
  }

  /** Overwrites the ciphertext with NULL and keeps the metadata. Returns false if it was already erased. */
  erase(handle: string, cause: VaultEraseCause, at: number): boolean {
    return this.db.prepare("UPDATE vault SET ciphertext = NULL, erased_at = ?, erase_cause = ? WHERE handle = ? AND erased_at IS NULL").run(at, cause, handle).changes > 0;
  }

  /** The database answers (GET /readyz). */
  ping(): void {
    this.db.prepare("SELECT 1").get();
  }

  close(): void {
    this.db.close();
  }
}
