// Registers a company through the real onboarding flow (R-01 to R-03): it applies, then the regulator approves.
//   node scripts/register-company.mjs companies/template/sites/carefirst.json [--sandbox]
// Prints the address and API key (Core shows the key once) and the command that starts the company's site.
// It needs the regulator access code (REGULATOR_KEY, default the local one). Nothing is written to any database directly.
import { readFileSync } from "node:fs";

const [file, ...flags] = process.argv.slice(2);
if (!file) {
  console.error("Usage: node scripts/register-company.mjs <site.json> [--sandbox]");
  process.exit(1);
}
const core = (process.env.CORE_URL ?? "http://localhost:4000").replace(/\/+$/, "");
const regulator = { "x-sammati-regulator-key": process.env.REGULATOR_KEY ?? "demo-regulator-key" };
const site = JSON.parse(readFileSync(file, "utf8"));

async function call(method, path, body, headers = {}) {
  const res = await fetch(core + path, { method, headers: { "content-type": "application/json", ...headers }, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path}: ${json?.error?.message ?? res.status}`);
  return json;
}

try {
  const sent = await call("POST", "/v1/registrations", {
    name: site.name,
    sector: site.sector,
    contactEmail: process.env.CONTACT_EMAIL ?? "ops@example.test",
    purposes: site.purposes,
    processors: site.processors ?? [],
  });
  const sandbox = flags.includes("--sandbox");
  const approved = await call("POST", `/v1/regulator/registrations/${sent.applicationId}/approve`, { note: "Registered with scripts/register-company.mjs", sandbox }, regulator);
  const status = await call("GET", `/v1/registrations/${sent.applicationId}`);
  const key = status.result?.apiKey;
  console.log(`${site.name} is registered${sandbox ? " in the sandbox" : " and live"}.`);
  console.log(`  address: ${approved.fiduciary.address}`);
  console.log(`  api key: ${key ?? "(already read)"}  (shown once)\n`);
  console.log(`Start its site:\n  SITE=${file} FIDUCIARY=${approved.fiduciary.address} SAMMATI_API_KEY=${key} pnpm --filter @sammati/company-template start`);
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
