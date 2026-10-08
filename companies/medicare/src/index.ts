/**
 * MediCare+ demo backend — Health sector fiduciary.
 * Guarded by @sammati/gateway SDK per docs/drd.md §5 & docs/trd.md §7.
 * Port: 4102
 */

import express, { type Request, type Response } from "express";
import { sammati } from "@sammati/gateway";
import { SEED_FIDUCIARIES } from "@sammati/shared";

const company = SEED_FIDUCIARIES.find((f) => f.slug === "medicare")!;
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

// --- 2. Purpose: treatment (Patient health records & diagnosis) ---
const treatmentHandler = async (req: Request, res: Response) => {
  await delay(65);
  res.json({
    patientId: req.params.id || "PAT-4821",
    bloodGroup: "B+",
    lastVisit: "2026-08-14",
    note: "Routine checkup",
    vitals: { bp: "120/80", pulse: 72, temperature: "98.4 F" },
    diagnosis: "Hypertension (managed)",
    prescriptions: [{ medication: "Amlodipine 5mg", dosage: "Once daily with food" }],
    attendingDoctor: "Dr. V. Rao, MD",
    facility: "MediCare+ Central Bengaluru",
    timestamp: Math.floor(Date.now() / 1000),
  });
};

app.get(
  "/patients/:id/records",
  gate.requireConsent({ purpose: "treatment", principalFrom: getPrincipal }),
  treatmentHandler,
);
app.get(
  "/patients/:id/treatment-record",
  gate.requireConsent({ purpose: "treatment", principalFrom: getPrincipal }),
  treatmentHandler,
);

// --- 3. Purpose: insurance_claim (Claims sharing with InsureCo) ---
app.all(
  "/claims/file",
  gate.requireConsent({ purpose: "insurance_claim", principalFrom: getPrincipal }),
  async (_req: Request, res: Response) => {
    await delay(90);
    res.json({
      claimId: "CLM-MC-90214",
      insurer: "InsureCo",
      policyNumber: "POL-7721-MC",
      admissionDate: "2026-08-10",
      dischargeDate: "2026-08-14",
      claimedAmount: 45000,
      coveredExpenses: ["Room rent", "Consultation", "Diagnostic labs"],
      hospital: "MediCare+ Bengaluru",
      status: "submitted_for_adjudication",
      estimatedAdjudicationHours: 24,
    });
  },
);

// --- 4. Purpose: research (Anonymised records to ResearchLab) ---
app.all(
  "/research/export",
  gate.requireConsent({ purpose: "research", principalFrom: getPrincipal }),
  async (_req: Request, res: Response) => {
    await delay(110);
    res.json({
      studyId: "CARDIO-IN-2026",
      cohort: "cardio_south_tier1",
      anonymisedRecordId: "ANON-99120-X",
      lab: "ResearchLab",
      biometricVectorHash: "0x3a8f19de42b891ce517f8b919a32cba9",
      piiStripped: ["name", "phone", "aadhaar", "address"],
      exportedAt: Math.floor(Date.now() / 1000),
      status: "anonymised_and_transferred",
    });
  },
);

app.listen(port, () => {
  console.log(`[MediCare+] demo backend listening on http://localhost:${port}`);
});
