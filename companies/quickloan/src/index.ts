/**
 * QuickLoan demo backend — Fintech lending fiduciary.
 * Guarded by @sammati/gateway SDK per docs/drd.md §5 & docs/trd.md §7.
 * Port: 4101
 */

import express, { type Request, type Response } from "express";
import { sammati } from "@sammati/gateway";
import { SEED_FIDUCIARIES } from "@sammati/shared";

const company = SEED_FIDUCIARIES.find((f) => f.slug === "quickloan")!;
const port = Number(process.env.PORT ?? company.port);

const gate = sammati({
  coreUrl: process.env.CORE_URL ?? "http://localhost:4000",
  fiduciary: company.address,
  signer: process.env.FIDUCIARY_KEY,
});

const app = express();
app.use(express.json());

// CORS headers so browser console at localhost:5173 can call directly
app.use((_req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, x-sammati-principal");
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
app.get(
  "/customers/:id/credit-profile",
  gate.requireConsent({ purpose: "credit_check", principalFrom: getPrincipal }),
  async (req: Request, res: Response) => {
    await delay(70);
    res.json({
      customerId: req.params.id || "CUST-4821",
      pan: "ABCDE1234F",
      incomeBand: "6-9 LPA",
      score: 742,
      eligibleLimit: 500000,
      riskCategory: "low",
      statementsAnalyzed: 12,
      decisionTimeMs: 70,
      timestamp: Math.floor(Date.now() / 1000),
    });
  },
);

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
