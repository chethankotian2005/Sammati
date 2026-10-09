// `pnpm demo:up`: the whole stack on one laptop: a fresh chain, Core (SQLite and the chain), the Processor and the web
// app. It starts empty: no company, purpose or customer exists until a company joins at /join (X-01).
// A failing process takes the rest down; the one-shot bootstrap process exiting cleanly does not.
import { rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { URL } from "node:url";
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

// The vault belongs to the chain that is about to be replaced, like Core's database.
for (const suffix of ["", "-wal", "-shm"]) rmSync(resolve(repoRoot, "processor", (process.env.VAULT_PATH ?? "./data/processor.sqlite") + suffix), { force: true });

// An explicit PUBLIC_CORE_URL (environment or .env) wins over detection: the real environment is read first.
try {
  process.loadEnvFile(resolve(repoRoot, ".env"));
} catch {
  // no .env
}

const qr = describeQrUrl({ port: process.env.PORT ?? "4000", env: process.env });
console.log(qr.banner);

// The wallet fetches the Processor's key from the laptop's address too, on its own port (trd.md §10).
const processorUrl = process.env.PROCESSOR_PUBLIC_URL?.trim() || `${new URL(qr.url).protocol}//${new URL(qr.url).hostname}:${process.env.PROCESSOR_PORT ?? "4200"}`;
console.log(`The wallet will find the Sammati Processor (simulated enclave) on ${processorUrl}
`);
console.log(`A new company joins at http://localhost:5173/join; the regulator approves it under Auditor > Registrations
(access code: ${process.env.REGULATOR_KEY?.trim() || "demo-regulator-key"}, a shared secret). Guide: docs/integration.md
`);
const coreEnv = { PUBLIC_CORE_URL: qr.url, PROCESSOR_PUBLIC_URL: processorUrl };

const filter = (pkg, script = "dev") => `pnpm --filter @sammati/${pkg} ${script}`;

const { result } = concurrently(
  [
    { name: "chain", prefixColor: "gray", command: filter("contracts", "node") },
    { name: "bootstrap", prefixColor: "yellow", command: "node scripts/bootstrap.mjs" },
    { name: "core", prefixColor: "blue", command: filter("core"), env: coreEnv },
    { name: "processor", prefixColor: "cyan", command: filter("processor") },
    { name: "web", prefixColor: "magenta", command: filter("web") },
  ],
  { killOthers: ["failure"] },
);

result.catch(() => process.exit(1));
