// `pnpm demo:up` (Core in stub mode) and `pnpm demo:up:real` (Core backed by the chain and SQLite).
// A failing process takes the rest down; the one-shot seed process exiting cleanly does not.
import concurrently from "concurrently";

const real = process.argv.includes("--real");
const coreEnv = { STUB_MODE: real ? "false" : "true" };

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
