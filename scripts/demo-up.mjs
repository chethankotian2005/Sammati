// `pnpm demo:up` (Core in stub mode) and `pnpm demo:up:real` (Core backed by the chain and SQLite).
// A failing process takes the rest down; the one-shot seed process exiting cleanly does not.
import { rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import concurrently from "concurrently";
import { describeQrUrl } from "./lan.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// This starts a brand-new chain, so a database left by an earlier run describes a chain that no longer
// exists. Core would notice and wipe it itself; removing it here as well keeps old rows from even loading.
const dbPath = process.env.DB_PATH ?? "./data/sammati.sqlite";
if (dbPath !== ":memory:") {
  try {
    for (const suffix of ["", "-wal", "-shm"]) rmSync(resolve(repoRoot, "core", dbPath + suffix), { force: true });
  } catch (err) {
    // Most likely another Core still has it open: Core's own startup check copes, but the stack will not start either.
    console.warn(`Could not remove the old database (${err instanceof Error ? err.message : err}). Is a previous \`pnpm demo:up\` still running?`);
  }
}

// An explicit CORE_PUBLIC_URL (environment or .env) wins over detection: the real environment is read first.
try {
  process.loadEnvFile(resolve(repoRoot, ".env"));
} catch {
  // no .env
}

const qr = describeQrUrl({ port: process.env.PORT ?? "4000", env: process.env });
console.log(qr.banner);

const real = process.argv.includes("--real");
const coreEnv = { STUB_MODE: real ? "false" : "true", CORE_PUBLIC_URL: qr.url };

const filter = (pkg, script = "dev") => `pnpm --filter @sammati/${pkg} ${script}`;

const { result } = concurrently(
  [
    { name: "chain", prefixColor: "gray", command: filter("contracts", "node") },
    { name: "seed", prefixColor: "yellow", command: "node scripts/bootstrap.mjs" },
    { name: "core", prefixColor: "blue", command: filter("core"), env: coreEnv },
    { name: "quickloan", prefixColor: "#2F5BEA", command: filter("company-quickloan") },
    { name: "medicare", prefixColor: "#0E9AA7", command: filter("company-medicare") },
    { name: "foodrush", prefixColor: "#E4572E", command: filter("company-foodrush") },
    { name: "web", prefixColor: "magenta", command: filter("web") },
  ],
  { killOthers: ["failure"] },
);

result.catch(() => process.exit(1));
