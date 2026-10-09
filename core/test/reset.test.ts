// `pnpm dev:reset` and a Core reset wipe Core through clearAll (trd.md §10): every table, including the ones added later, must be emptied,
// or a rehearsal's identities, alerts and requests would still be there for the next one.
import { describe, expect, it } from "vitest";
import { clearAll, openDb } from "../src/real/db";

describe("clearAll", () => {
  it("empties every table the schema has, so a reset leaves nothing from the last run", () => {
    const db = openDb(":memory:");
    const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all() as Array<{ name: string }>).map((t) => t.name);
    // identities, blocks, notifications and request_targets are the ones people forget
    for (const must of ["identities", "blocks", "notifications", "request_targets", "requests", "rights_requests", "consents_cache", "access_logs"]) expect(tables).toContain(must);

    db.prepare("INSERT INTO identities (handle, principal, registered_at) VALUES ('a@sammati', '0xa', 1)").run();
    db.prepare("INSERT INTO blocks (principal, fiduciary, blocked_at) VALUES ('0xa', '0xf', 1)").run();
    db.prepare("INSERT INTO notifications (id, dedupe_key, principal, type, fiduciary, payload, created_at) VALUES ('n', 'k', '0xa', 'consent.expired', '0xf', '{}', 1)").run();
    clearAll(db);

    // indexer_state keeps the chain fingerprint across clearChainDerived only; clearAll is the full wipe
    for (const t of tables) {
      const n = (db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number }).n;
      expect(n, `${t} should be empty after a reset`).toBe(0);
    }
  });
});
