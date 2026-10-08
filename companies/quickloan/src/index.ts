/**
 * QuickLoan demo backend — Fintech lending fiduciary.
 * Guarded by @sammati/gateway SDK per docs/drd.md §5 & docs/trd.md §7.
 * Port: 4101
 */

import express, { type Request, type Response } from "express";
import { sammati } from "@sammati/gateway";
import { ENTRY_ID_HEADER, PROCESSOR_PORT, SEED_FIDUCIARIES, demoApiKey, type VaultView } from "@sammati/shared";
import { VaultHandles } from "./vault-handles";

const company = SEED_FIDUCIARIES.find((f) => f.slug === "quickloan")!;
const port = Number(process.env.PORT ?? company.port);

const gate = sammati({
  coreUrl: process.env.CORE_URL ?? "http://localhost:4000",
  fiduciary: company.address,
  apiKey: process.env.SAMMATI_API_KEY ?? demoApiKey(company.slug),
  signer: process.env.FIDUCIARY_KEY,
});

const processorUrl = (process.env.PROCESSOR_URL ?? `http://localhost:${PROCESSOR_PORT}`).replace(/\/+$/, "");
const apiKey = process.env.QUICKLOAN_API_KEY ?? demoApiKey(company.slug);
const handles = new VaultHandles();

const app = express();
app.use(express.json());

// CORS headers so browser console at localhost:5173 can call directly
app.use((_req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, x-sammati-principal, x-sammati-api-key");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (_req.method === "OPTIONS") {
    res.sendStatus(200);
    return;
  }
  next();
});

// Helper for extracting principal address
const getPrincipal = (req: Request) =>
  req.header("x-sammati-principal") ??
  (req.query.principal as string) ??
  req.body?.principal;

// Short simulated delay (drd.md §5)
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// --- 1. Health route ---
app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    company: company.name,
    fiduciary: company.address,
    port,
    sector: company.sector,
    uptime: process.uptime(),
  });
});

// --- 2. Purpose: credit_check (Credit eligibility) ---
// QuickLoan never holds the customer's PAN or income (trd.md §6.8). The wallet encrypts them for the Sammati
// Processor, which tells this backend only a handle (POST /vault/events). What staff and the admin API can see
// is that handle, its hash and a status.
app.get(
  "/customers/:id/credit-profile",
  gate.requireConsent({ purpose: "credit_check", principalFrom: getPrincipal }),
  async (req: Request, res: Response) => {
    await delay(70);
    res.json(handles.view(getPrincipal(req) ?? "") satisfies VaultView);
  },
);

// The Processor's webhook: it stored (or erased) the ciphertext behind a handle.
app.post("/vault/events", (req: Request, res: Response) => {
  if (req.header("x-sammati-api-key") !== apiKey) {
    res.status(401).json({ error: { code: "UNAUTHORIZED", message: "A valid x-sammati-api-key is required" } });
    return;
  }
  res.status(handles.apply(req.body) ? 202 : 400).json({ ok: true });
});

// Apply for a loan: the decision is computed inside the Processor from data QuickLoan never sees. Not wrapped in
// requireConsent on purpose: the Processor checks consent on chain and writes the access-log entry (so the use is
// logged once, by the party that touched the data); a refusal is passed through unchanged (451 + reason code).
app.post("/customers/:id/apply", async (req: Request, res: Response) => {
  const principal = getPrincipal(req);
  if (!principal || !/^0x[0-9a-fA-F]{40}$/.test(principal)) {
    gate.logAccess({ purpose: "credit_check", principal: principal ?? "", decision: "BLOCKED", reason: "NO_PRINCIPAL", endpoint: "POST /customers/:id/apply", latencyMs: 0 });
    res.status(451).json({ code: "NO_PRINCIPAL", message: "The request did not identify a data principal." });
    return;
  }
  const held = handles.get(principal);
  if (!held) {
    res.status(409).json({ error: { code: "NO_SUBMISSION", message: "This customer has not sent their details yet" } });
    return;
  }
  let answer: globalThis.Response;
  try {
    answer = await fetch(`${processorUrl}/v1/processor/evaluate`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-sammati-api-key": apiKey },
      body: JSON.stringify({ handle: held.handle, fiduciary: company.address, purposeCode: "credit_check", action: "loan_decision" }),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    res.status(502).json({ error: { code: "PROCESSOR_UNREACHABLE", message: "The Sammati Processor did not answer" } });
    return;
  }
  const entryId = answer.headers.get(ENTRY_ID_HEADER);
  if (entryId) res.setHeader(ENTRY_ID_HEADER, entryId);
  res.status(answer.status).json(await answer.json().catch(() => ({})));
});

// --- 3. Purpose: marketing (Loan offers & promotions) ---
app.all(
  "/marketing/campaign/sms",
  gate.requireConsent({ purpose: "marketing", principalFrom: getPrincipal }),
  async (_req: Request, res: Response) => {
    await delay(85);
    res.json({
      campaignId: "LOAN-FEST-2026",
      channel: "sms",
      recipient: "+91 98765 43210",
      offer: {
        type: "Pre-approved personal loan",
        amount: 500000,
        interestRate: "10.5% p.a.",
        tenureMonths: 36,
        monthlyEmi: 16250,
      },
      dispatchedAt: Math.floor(Date.now() / 1000),
      status: "dispatched",
    });
  },
);

// --- 4. Purpose: bureau_share (Sharing with CreditBureauX) ---
app.all(
  "/bureau/sync",
  gate.requireConsent({ purpose: "bureau_share", principalFrom: getPrincipal }),
  async (_req: Request, res: Response) => {
    await delay(95);
    res.json({
      bureau: "CreditBureauX",
      batchId: "CBX-2026-8921",
      recordsSynced: 1,
      accountStatus: "standard",
      daysPastDue: 0,
      repaymentHistoryMonths: 36,
      syncedAt: Math.floor(Date.now() / 1000),
      processorNotice: "Synced with AdPartnerQ and CreditBureauX",
    });
  },
);

app.listen(port, () => {
  console.log(`[QuickLoan] demo backend listening on http://localhost:${port}`);
});
