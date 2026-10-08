// `pnpm demo:up`: the whole stack, with Core in real mode (backed by the chain and SQLite). `pnpm demo:up:stub`
// serves fixtures instead, with no chain, for building clients without one. `demo:up:real` is an alias of `demo:up`.
// A failing process takes the rest down; the one-shot seed process exiting cleanly does not.
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
for (const suffix of ["", "-wal", "-shm"]) rmSync(resolve(repoRoot, "processor", (process.env.PROCESSOR_DB_PATH ?? "./data/processor.sqlite") + suffix), { force: true });

// An explicit CORE_PUBLIC_URL (environment or .env) wins over detection: the real environment is read first.
try {
  process.loadEnvFile(resolve(repoRoot, ".env"));
} catch {
  // no .env
}

const qr = describeQrUrl({ port: process.env.PORT ?? "4000", env: process.env });
console.log(qr.banner);

const real = !process.argv.includes("--stub");
// `pnpm demo:up:fast`: consent expiry in seconds, so the demo can show reminders, expiry and erasure live (trd.md §6.12).
if (process.argv.includes("--fast-expiry")) {
  process.env.DEMO_FAST_EXPIRY = "1";
  console.log("DEMO_FAST_EXPIRY is on: the wallet offers a 2-minute expiry; reminders at 60 s and 30 s; erasure 60 s after expiry.");
}
// The wallet fetches the Processor's key from the laptop's address too, on its own port (trd.md §10).
const processorUrl = process.env.PROCESSOR_PUBLIC_URL?.trim() || `${new URL(qr.url).protocol}//${new URL(qr.url).hostname}:${process.env.PROCESSOR_PORT ?? "4200"}`;
console.log(`The wallet will find the Sammati Processor (simulated enclave) on ${processorUrl}
`);
if (real) {
  console.log(`A new company joins at http://localhost:5173/join; the regulator approves it under Auditor > Registrations
(access code: ${process.env.REGULATOR_KEY?.trim() || "demo-regulator-key"}, a demo secret). Guide: docs/integration.md
`);
}
const coreEnv = { STUB_MODE: real ? "false" : "true", CORE_PUBLIC_URL: qr.url, PROCESSOR_PUBLIC_URL: processorUrl };

const filter = (pkg, script = "dev") => `pnpm --filter @sammati/${pkg} ${script}`;

const { result } = concurrently(
  [
    { name: "chain", prefixColor: "gray", command: filter("contracts", "node") },
    { name: "seed", prefixColor: "yellow", command: "node scripts/bootstrap.mjs" },
    { name: "core", prefixColor: "blue", command: filter("core"), env: coreEnv },
    { name: "processor", prefixColor: "cyan", command: filter("processor") },
    { name: "quickloan", prefixColor: "#2F5BEA", command: filter("company-quickloan") },
    { name: "medicare", prefixColor: "#0E9AA7", command: filter("company-medicare") },
    { name: "foodrush", prefixColor: "#E4572E", command: filter("company-foodrush") },
    { name: "web", prefixColor: "magenta", command: filter("web") },
  ],
  { killOthers: ["failure"] },
);

result.catch(() => process.exit(1));
