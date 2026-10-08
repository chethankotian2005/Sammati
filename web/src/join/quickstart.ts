// The text of docs/integration.md §2, §3 and §5 with a company's own values filled in. One place, so the page and the
// guide cannot drift apart (a test compares the gateway snippet with the guide).

export interface QuickstartValues {
  coreUrl: string;
  processorUrl: string;
  fiduciary: string;
  /** The API key, or null when it can no longer be shown. */
  apiKey: string | null;
  purposeCode: string;
}

export const KEY_PLACEHOLDER = "<your API key>";

export function gatewaySnippet(v: Pick<QuickstartValues, "coreUrl" | "fiduciary" | "purposeCode">): string {
  return `import { sammati } from "@sammati/gateway";

const gate = sammati({ coreUrl: "${v.coreUrl}", fiduciary: "${v.fiduciary}", apiKey: process.env.SAMMATI_API_KEY });

app.get("/customers/:id/profile",
  gate.requireConsent({ purpose: "${v.purposeCode}", principalFrom: (req) => req.header("x-sammati-principal") }),
  (req, res) => res.json({ ok: true /* your data, released only when consent is valid */ }));`;
}

export const envLine = (apiKey: string | null): string => `export SAMMATI_API_KEY=${apiKey ?? KEY_PLACEHOLDER}`;

export function targetedCurl(v: QuickstartValues): string {
  return `curl -X POST "${v.coreUrl}/v1/fiduciaries/${v.fiduciary}/requests/targeted" \\
  -H "content-type: application/json" -H "x-sammati-api-key: $SAMMATI_API_KEY" \\
  -d '{ "handle": "asha@sammati", "purposes": ["${v.purposeCode}"], "message": "To check your eligibility" }'`;
}

export function processorCurl(v: QuickstartValues): string {
  return `curl -X POST "${v.processorUrl}/v1/processor/evaluate" \\
  -H "content-type: application/json" -H "x-sammati-api-key: $SAMMATI_API_KEY" \\
  -d '{ "handle": "<the handle you stored>", "fiduciary": "${v.fiduciary}", "purposeCode": "${v.purposeCode}", "action": "loan_decision" }'`;
}
