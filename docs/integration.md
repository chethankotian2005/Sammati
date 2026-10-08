# Integrating with Sammati

For a company that wants to ask people for consent and check it before it uses their data. Five minutes, one key. This guide is also what the onboarding result page shows (`ui.md` §3.3); the specification behind it is `trd.md` §6.2a and §6.12.

> **Demo build.** The steps below run against a local Sammati stack (`pnpm demo:up`). `@sammati/gateway` is a package of this repository, not yet published to npm: inside this repo use `pnpm add @sammati/gateway@workspace:*`. The regulator's review is a human decision in the demo, and Sammati's core service holds your company's signing key for you; both are named in `demo.md` §5 and `trd.md` §12.

## 1. Register

1. Open `/join` (for example `http://localhost:5173/join`) and fill in the company, the purposes you will ask for (a code such as `loan_offers`, a plain title and description in English, Hindi and Kannada, the data categories, how long you keep them, whether you share them, whether the service needs them) and any partners that receive data.
2. Press **Send for review**. Keep the status page open (or its address: it is your private link to the application).
3. The regulator reviews it. When it is **approved**, the same page shows:
   - your **fiduciary address** (your company's identity on the ledger),
   - your **API key**, **once**. Sammati stores only a fingerprint of it. If you lose it, ask the regulator to issue a new one (the old one stops working).

You start in the **sandbox**: you can ask, and receive consent from, only the regulator's *test customers*, until the regulator promotes you.

## 2. Integrate in 5 lines

Your server asks Sammati whether a customer consented to a purpose before it releases anything. Keep the key in the environment, never in code.

```ts
import { sammati } from "@sammati/gateway";

const gate = sammati({ coreUrl: "http://localhost:4000", fiduciary: "<your fiduciary address>", apiKey: process.env.SAMMATI_API_KEY });

app.get("/customers/:id/profile",
  gate.requireConsent({ purpose: "<your purpose code>", principalFrom: (req) => req.header("x-sammati-principal") }),
  (req, res) => res.json({ ok: true /* your data, released only when consent is valid */ }));
```

What you get:
- **Valid consent:** your handler runs.
- **Anything else:** the caller gets `HTTP 451` with a reason code (`NO_CONSENT`, `CONSENT_WITHDRAWN`, `CONSENT_EXPIRED`, `LEDGER_UNAVAILABLE` or `NO_PRINCIPAL`) and your handler never runs.
- **Every decision is logged** to your hash-chained access log, which Sammati anchors on the ledger. Logging never delays the response.
- **Fail closed:** if Sammati cannot be reached, or rejects your key, the answer is `451 LEDGER_UNAVAILABLE` and the SDK logs one warning telling you why (an unknown key, or a key used for another company's id).

## 3. Ask a customer for consent

By Sammati ID (the customer's wallet is told within a second or two; you learn only a request id and a status):

```bash
curl -X POST "$CORE/v1/fiduciaries/$FIDUCIARY/requests/targeted" \
  -H "content-type: application/json" -H "x-sammati-api-key: $SAMMATI_API_KEY" \
  -d '{ "handle": "asha@sammati", "purposes": ["<your purpose code>"], "message": "To check your eligibility" }'
```

The answer is always `201 { requestId, status: "sent" }` for a well-formed ID, whether or not the customer exists: this is on purpose (`trd.md` §6.11). Poll `GET /v1/fiduciaries/$FIDUCIARY/requests/targeted/$REQUEST_ID` for Sent, Seen, Granted, Declined or Expired. In person you can show a QR instead (`POST /v1/fiduciaries/$FIDUCIARY/requests`, then the wallet scans `qrPayload`).

In the **sandbox** the customer must be a test customer; a request to anyone else is accepted and quietly goes nowhere, like an unknown ID.

## 4. Try it locally

`pnpm --filter @sammati/core sample:company` runs a tiny sample app (`core/examples/quickstart.ts`) that is exactly section 2. It reads `CORE_URL`, `FIDUCIARY`, `SAMMATI_API_KEY` and `PURPOSE` from the environment and listens on port 4300. Then:

```bash
curl -i -H "x-sammati-principal: <customer address>" http://localhost:4300/customers/1/profile
```

before consent: `451 NO_CONSENT`. After the customer approves in the wallet: `200`. After they withdraw: `451 CONSENT_WITHDRAWN`, on the very next request.

## 5. Use the Processor (only if you need to compute on sensitive data)

If a purpose needs data you should not hold (a PAN, an income), the customer's wallet encrypts it for the Sammati Processor and you ask for a decision instead of the data. Use the same API key:

```bash
curl -X POST "$PROCESSOR/v1/processor/evaluate" \
  -H "content-type: application/json" -H "x-sammati-api-key: $SAMMATI_API_KEY" \
  -d '{ "handle": "<the handle you stored>", "fiduciary": "<your address>", "purposeCode": "<your purpose code>", "action": "loan_decision" }'
```

You receive `{ decision, limit, reasonCodes }`, never the data (`trd.md` §6.7). The decision rules in this build are the demo loan rules; a company with other needs would add its own rule set to the Processor. The Processor is a simulated enclave in the demo.

## 6. Security notes

- The API key is 32 random bytes. Sammati stores only its SHA-256, and shows the key once.
- A key works for one company. Using it with another company's id is refused (`403 FIDUCIARY_MISMATCH`).
- Each company is rate limited (`429 RATE_LIMITED`, `Retry-After`).
- Without a valid key every gateway call fails closed with `401 INVALID_API_KEY` (the SDK turns it into `451 LEDGER_UNAVAILABLE`).
- Rotate a key by asking the regulator to reissue it.
