// pnpm dev:tamper -- <fiduciary> <seq>   (needs DEV_TOOLS=true; trd.md §6.4)
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import Database from "better-sqlite3";
import { devToolsOn, loadDotEnv, readConfig } from "../src/config";
import { tamperRow } from "../src/dev/tamper";

// Read before the .env file is loaded: DEV_TOOLS must be set on this one command, and a value left in .env does not count
// (a deployment that copied its .env must not have an edit-the-log tool switched on by it, trd.md §10.8).
const inline = process.env.DEV_TOOLS;
loadDotEnv();
const args = process.argv.slice(2).filter((a) => a !== "--");

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

try {
  if (inline !== "true") fail("dev:tamper changes a stored log on purpose, so it needs DEV_TOOLS=true set on this command itself (DEV_TOOLS=true pnpm dev:tamper -- <fiduciary> <seq>); a value in .env does not count.");
  devToolsOn({ ...process.env, DEV_TOOLS: inline }); // throws beside NODE_ENV=production
} catch (err) {
  fail(err instanceof Error ? err.message : String(err));
}
const [who, seqText] = args;
if (!who || !seqText || args.length > 2) fail("Usage: pnpm dev:tamper -- <fiduciary address or slug> <seq>");

const { dbPath } = readConfig();
const file = resolve(dbPath);
if (!existsSync(file)) fail(`No database at ${file}. Is Core running here, with the same DB_PATH?`);

const db = new Database(file, { fileMustExist: true });
db.pragma("busy_timeout = 5000");
try {
  const row = tamperRow(db, who, Number(seqText));
  console.log(`Edited ${row.slug ?? row.fiduciary} log entry seq ${row.seq} (${row.id}): decision ${row.before} -> ${row.after}. Its hash was left alone.`);
  console.log("Press Verify for that company in the Auditor: it should now report a mismatch at this record.");
} catch (err) {
  fail(err instanceof Error ? err.message : String(err));
} finally {
  db.close();
}
