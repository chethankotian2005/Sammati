import express from "express";
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

app.get("/health", (_req, res) => {
  res.json({ ok: true, company: company.name });
});

// Fictional data (drd.md §5), served only when the principal has consented.
app.get(
  "/customers/:id/credit-profile",
  gate.requireConsent({ purpose: "credit_check", principalFrom: (req) => req.header("x-sammati-principal") }),
  (_req, res) => {
    res.json({ pan: "ABCDE1234F", incomeBand: "6-9 LPA", score: 742 });
  },
);

app.listen(port, () => {
  console.log(`${company.name} demo backend on http://localhost:${port}`);
});
