/**
 * QuickLoan: a loan product that uses Sammati for consent and for private processing (prd.md Q-01 to Q-04).
 * It is configured by the company's registration and talks to Sammati only through its public APIs.
 *   FIDUCIARY=<address> SAMMATI_API_KEY=<key> STAFF_USER=... STAFF_PASSWORD=... pnpm --filter @sammati/company-quickloan start
 */
import { PROCESSOR_PORT } from "@sammati/shared";
import { createApp } from "./app";
import { openDb } from "./db";
import { Sammati } from "./sammati";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`${name} is required (see docs/integration.md).`);
    process.exit(1);
  }
  return value;
}

const fiduciary = required("FIDUCIARY");
const apiKey = required("SAMMATI_API_KEY");
const coreUrl = (process.env.CORE_URL ?? "http://localhost:4000").replace(/\/+$/, "");
const processorUrl = (process.env.PROCESSOR_URL ?? `http://localhost:${PROCESSOR_PORT}`).replace(/\/+$/, "");
const port = Number(process.env.PORT ?? 4101);
const publicUrl = (process.env.QUICKLOAN_PUBLIC_URL ?? `http://localhost:${port}`).replace(/\/+$/, "");
const staff = process.env.STAFF_USER && process.env.STAFF_PASSWORD ? { user: process.env.STAFF_USER, password: process.env.STAFF_PASSWORD } : null;
if (!staff) console.warn("[quickloan] STAFF_USER and STAFF_PASSWORD are not set: the back-office is off.");

const sammati = new Sammati({ coreUrl, processorUrl, fiduciary, apiKey });
const app = createApp({
  db: openDb(process.env.QUICKLOAN_DB ?? "./data/quickloan.sqlite"),
  sammati,
  loanPurpose: process.env.LOAN_PURPOSE ?? "credit_check",
  coreWs: process.env.PUBLIC_CORE_WS ?? `${coreUrl.replace(/^http/, "ws")}/ws`,
  staff,
  fiduciary,
  apiKey,
});

app.listen(port, () => {
  console.log(`[quickloan] http://localhost:${port}  (company ${fiduciary})`);
  void sammati.registerCallback(`${publicUrl}/vault/events`);
  setInterval(() => void sammati.registerCallback(`${publicUrl}/vault/events`), 30_000).unref();
});
