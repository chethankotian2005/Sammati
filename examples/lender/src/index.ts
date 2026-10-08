/**
 * Sample lender: the reference integration of the gateway SDK and the Sammati Processor (trd.md §6.8).
 *
 * It names no company and holds no customer data, no payload and no key of its own: everything comes from the
 * environment, from the company's registration (docs/integration.md). Run it with
 *   FIDUCIARY=<address> SAMMATI_API_KEY=<key> pnpm --filter @sammati/example-lender start
 */
import express, { type Request, type Response } from "express";
import { sammati } from "@sammati/gateway";
import { ENTRY_ID_HEADER, PROCESSOR_PORT, type VaultView } from "@sammati/shared";
import { VaultHandles } from "./vault-handles";

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
const loanPurpose = process.env.LOAN_PURPOSE ?? "credit_check";
const port = Number(process.env.PORT ?? 4310);
const publicUrl = process.env.LENDER_PUBLIC_URL ?? `http://localhost:${port}`;

const gate = sammati({ coreUrl, fiduciary, apiKey });
const handles = new VaultHandles();

const getPrincipal = (req: Request): string | undefined =>
  req.header("x-sammati-principal") ?? (req.query.principal as string | undefined) ?? (req.body as { principal?: string } | undefined)?.principal;

const app = express();
app.use(express.json());
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, x-sammati-principal, x-sammati-api-key");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") {
    res.sendStatus(200);
    return;
  }
  next();
});

app.get("/health", (_req, res) => {
  res.json({ ok: true, fiduciary, uptime: process.uptime() });
});

// Any purpose the company registered can be guarded the same way. The answer carries a reference and no customer data.
app.get("/guarded/:purpose", (req: Request, res: Response) => {
  gate.requireConsent({ purpose: String(req.params.purpose), principalFrom: getPrincipal })(req, res, () => {
    res.json({ ok: true, purpose: String(req.params.purpose) });
  });
});

// The admin view: a handle, its hash and a status, never the details (trd.md §6.8).
app.get("/customers/:id/credit-profile", (req: Request, res: Response) => {
  gate.requireConsent({ purpose: loanPurpose, principalFrom: getPrincipal })(req, res, () => {
    res.json(handles.view(getPrincipal(req) ?? "") satisfies VaultView);
  });
});

// The Processor's webhook: it stored (or erased) the ciphertext behind a handle.
app.post("/vault/events", (req: Request, res: Response) => {
  if (req.header("x-sammati-api-key") !== apiKey) {
    res.status(401).json({ error: { code: "UNAUTHORIZED", message: "A valid x-sammati-api-key is required" } });
    return;
  }
  res.status(handles.apply(req.body) ? 202 : 400).json({ ok: true });
});

// Apply: the decision is computed inside the Processor from data this company never sees. Not wrapped in
// requireConsent on purpose: the Processor checks consent on chain and writes the access-log entry, so the use is
// logged once, by the party that touched the data. A refusal is passed through unchanged (451 and its reason).
app.post("/customers/:id/apply", async (req: Request, res: Response) => {
  const principal = getPrincipal(req);
  if (!principal || !/^0x[0-9a-fA-F]{40}$/.test(principal)) {
    gate.logAccess({ purpose: loanPurpose, principal: principal ?? "", decision: "BLOCKED", reason: "NO_PRINCIPAL", endpoint: "POST /customers/:id/apply", latencyMs: 0 });
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
      body: JSON.stringify({ handle: held.handle, fiduciary, purposeCode: loanPurpose, action: "loan_decision" }),
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

/** Tells the Processor where to send "stored" and "erased" notices. Memory only on its side, so repeat it. */
async function registerCallback(): Promise<void> {
  try {
    await fetch(`${processorUrl}/v1/processor/callback`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-sammati-api-key": apiKey },
      body: JSON.stringify({ url: `${publicUrl}/vault/events` }),
      signal: AbortSignal.timeout(3000),
    });
  } catch {
    // the Processor is not up yet: the next round tries again
  }
}

app.listen(port, () => {
  console.log(`[lender] guarding ${fiduciary} on http://localhost:${port} (loan purpose ${loanPurpose})`);
  void registerCallback();
  setInterval(() => void registerCallback(), 30_000).unref();
});
