import { Router, type Request, type RequestHandler, type Response } from "express";
import { Wallet, isAddress, isHexString } from "ethers";
import type {
  AccessProofResponse,
  AccessReason,
  ActivityResponse,
  AuditFiduciariesResponse,
  AuditLedgerResponse,
  AuditReportResponse,
  CascadeResponse,
  ConsentStateResponse,
  CreateRequestResponse,
  Decision,
  DemoAnchorBody,
  DemoAnchorResponse,
  DemoFireResponse,
  DemoResetResponse,
  ExportResponse,
  FiduciaryAccessResponse,
  FiduciaryProcessorsResponse,
  FiduciaryPurposesResponse,
  FiduciaryConsentsResponse,
  GatewayLogResponse,
  GrantResponse,
  Hex,
  LedgerEventType,
  PrincipalConsentsResponse,
  RightsResponse,
  TamperResponse,
  VerifyResponse,
  WithdrawResponse,
} from "@sammati/shared";
import { ENTRY_ID_HEADER, GUARDED_ENDPOINTS, LOAN_DECISION_ENDPOINT, REASON_CODES, SEED_FIDUCIARIES, SIMULATOR_CUSTOMER_ID, WITHDRAW_CONSENT_TYPE, buildDomain, noticeHash, withdrawTypedData } from "@sammati/shared";
import { HttpError, badRequest, requireBody, requireString } from "../errors";
import { buildNotice, noticeInput } from "../notice";
import { now } from "../store";
import { address, bytes32, parseGrant, parseLogEntry, parseRightsBody, parseWithdraw } from "../validate";
import { sanitiseResult } from "../routes/vault";
import { accessProof, report, scorecard, tamper, verifyFiduciary } from "./audit";
import { toHttpError } from "./chain";
import type { RealCore } from "./core";
import { companyKey, mustOwn } from "./onboarding-routes";
import { addr, NOTICE_VERSION } from "./repo";

const DEFAULT_ACTIVITY_LIMIT = 50;
const DEFAULT_ACCESS_LIMIT = 100;
const LEDGER_TYPES: readonly LedgerEventType[] = ["granted", "withdrawn", "ack", "anchor", "purpose"];
const COMPANY_TIMEOUT_MS = 5000;

/** Express 4 does not catch rejected promises; this does. */
const handle =
  (fn: (req: Request, res: Response) => unknown | Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    Promise.resolve()
      .then(() => fn(req, res))
      .catch(next);
  };

const param = (req: Request, name: string): string => String(req.params[name]);

/** Runs a chain read, turning a dead node into 503 LEDGER_UNAVAILABLE (fail closed). */
async function onChain<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    throw toHttpError(err);
  }
}

/** Where a demo company's backend listens: an explicit override, else its seeded port on the company host. */
function companyBaseUrl(config: RealCore["config"], fiduciary: Hex): string | null {
  const override = config.companyUrls[fiduciary.toLowerCase()];
  if (override) return override;
  const seeded = SEED_FIDUCIARIES.find((f) => f.address.toLowerCase() === fiduciary.toLowerCase());
  return seeded ? `http://${config.companyHost}:${seeded.port}` : null;
}
export function realRoutes(core: RealCore): Router {
  const { repo, chain, relayer, indexer, config } = core;
  const r = Router();
  const domain = () => buildDomain(chain.deployment.chainId, chain.deployment.consentRegistry);

  async function consentState(principal: Hex, fiduciary: Hex, purposeId: Hex): Promise<ConsentStateResponse> {
    const [c, valid] = await onChain(() =>
      Promise.all([chain.registry.getConsent(principal, fiduciary, purposeId), chain.registry.hasValidConsent(principal, fiduciary, purposeId)]),
    );
    const status = (["None", "Active", "Withdrawn"] as const)[Number(c.status)] ?? "None";
    const base = { principal, fiduciary, purposeId, checkedAt: now() };
    if (valid) return { ...base, status, expiresAt: Number(c.expiresAt), valid: true };
    const reason = status === "None" ? "NO_CONSENT" : status === "Withdrawn" ? "CONSENT_WITHDRAWN" : "CONSENT_EXPIRED";
    return { ...base, status, expiresAt: status === "None" ? null : Number(c.expiresAt), valid: false, reason };
  }

  /** A mined relayer transaction is final; if the indexer trips here the next poll picks the events up. */
  async function settle(receipt: Parameters<typeof indexer.ingestReceipt>[0]): Promise<void> {
    try {
      await indexer.ingestReceipt(receipt);
    } catch (err) {
      console.warn("[indexer] could not ingest receipt now, the poller will:", err instanceof Error ? err.message : err);
    }
  }

  // --- 6.1 consent flow ---

  r.post("/fiduciaries/:fid/requests", companyKey(core, false), handle((req, res) => {
    const f = repo.fiduciary(param(req, "fid"));
    mustOwn(res, f.address);
    const body = requireBody(req.body);
    const codes = body.purposes;
    if (!Array.isArray(codes) || codes.length === 0 || !codes.every((c) => typeof c === "string")) {
      throw badRequest('"purposes" must be a non-empty array of purpose codes');
    }
    const purposes = (codes as string[]).map((c) => repo.purpose(f, c));
    const hash = noticeHash(noticeInput(f.address, purposes, NOTICE_VERSION));
    const created = repo.createRequest(f, purposes.map((p) => p.id), requireString(body, "customerAlias"), hash);
    res.status(201).json({
      requestId: created.id,
      qrPayload: { v: 1, core: config.publicUrl, requestId: created.id, fiduciary: f.address, name: f.name },
    } satisfies CreateRequestResponse);
  }));

  r.get("/requests/:requestId", handle(async (req, res) => {
    const principal = typeof req.query.principal === "string" ? address(req.query.principal, "principal") : null;
    // A request addressed to one customer answers to that customer only, and does not use the QR code's 30 minutes.
    const { targeted } = core.targeted.openNotice(param(req, "requestId"), principal);
    const request = repo.request(param(req, "requestId"), targeted ? Number.MAX_SAFE_INTEGER : config.requestTtlSeconds);
    const f = repo.fiduciary(request.fiduciary);
    sandboxGate(f, principal);
    const nonce = principal ? String(await onChain(() => chain.registry.nonces(principal))) : "0";
    res.json(
      buildNotice({
        requestId: request.id,
        fiduciary: { address: f.address, name: f.name, color: f.color },
        purposes: request.purposeIds.map((id) => repo.purpose(f, id)),
        version: NOTICE_VERSION,
        domain: domain(),
        principal,
        nonce,
      }),
    );
  }));

  /** A sandbox company deals only with test customers (trd.md §6.12). Withdrawals are never refused. */
  const sandboxGate = (f: ReturnType<typeof repo.fiduciary>, principal: Hex | null): void => {
    if (!core.onboarding.mayDealWith(f, principal)) {
      throw new HttpError(403, "SANDBOX_COMPANY", "This company is in the Sammati test sandbox and can only ask test customers");
    }
  };

  const signatureOf = (body: Record<string, unknown>): string => {
    const sig = requireString(body, "signature");
    if (!isHexString(sig)) throw new HttpError(400, "BAD_SIGNATURE", "Signature must be a hex string");
    return sig;
  };

  r.post("/consents/grant", handle(async (req, res) => {
    const body = requireBody(req.body);
    const grant = parseGrant(body.request);
    sandboxGate(repo.fiduciary(grant.fiduciary), grant.principal);
    const receipt = await relayer.send("grantConsent", [grant, signatureOf(body)]);
    await settle(receipt);
    core.targeted.onGrant(grant.principal, grant.fiduciary, grant.noticeHash); // a request addressed to this customer is now Granted
    res.json({ txHash: receipt.hash, status: "confirmed" } satisfies GrantResponse);
  }));

  r.post("/consents/withdraw", handle(async (req, res) => {
    const body = requireBody(req.body);
    const withdrawal = parseWithdraw(body.request);
    const receipt = await relayer.send("withdrawConsent", [withdrawal, signatureOf(body)]);
    await settle(receipt);
    res.json({ txHash: receipt.hash, status: "confirmed" } satisfies WithdrawResponse);
  }));

  r.get("/principals/:addr/consents", handle(async (req, res) => {
    const principal = addr(param(req, "addr"));
    const nonce = String(await onChain(() => chain.registry.nonces(principal)));
    res.json({ ...repo.principalConsents(principal), nonce, domain: domain() } satisfies PrincipalConsentsResponse);
  }));

  r.get("/principals/:addr/activity", handle((req, res) => {
    const principal = addr(param(req, "addr"));
    const limit = Math.max(1, Math.min(200, Number(req.query.limit ?? DEFAULT_ACTIVITY_LIMIT) || DEFAULT_ACTIVITY_LIMIT));
    res.json({ principal, items: repo.activity(principal, limit) } satisfies ActivityResponse);
  }));

  r.get("/principals/:addr/cascade/:purposeId", handle((req, res) => {
    const principal = addr(param(req, "addr"));
    const purposeId = bytes32(param(req, "purposeId"), "purposeId");
    if (!repo.purposeById(purposeId)) throw new HttpError(404, "PURPOSE_NOT_FOUND", `Unknown purpose ${purposeId}`);
    res.json({ principal, purposeId, processors: repo.cascadeFor(principal, purposeId) } satisfies CascadeResponse);
  }));

  r.get("/proof/consent/:txHash", handle((req, res) => {
    const proof = repo.consentProof(bytes32(param(req, "txHash"), "txHash"));
    if (!proof) throw new HttpError(404, "PROOF_NOT_FOUND", `No consent transaction ${param(req, "txHash")}`);
    res.json(proof);
  }));

  r.get("/proof/access/:entryId", handle((req, res) => {
    res.json(accessProof(core, param(req, "entryId")) satisfies AccessProofResponse);
  }));

  // --- data rights (W-10): status records, never on chain ---

  r.post("/rights", handle((req, res) => {
    const { principal, fiduciary, type, note } = parseRightsBody(req.body);
    const company = repo.fiduciary(fiduciary); // 404 FIDUCIARY_NOT_FOUND for a company that does not exist
    res.status(201).json(repo.createRightsRequest(principal, company.address, type, note));
  }));

  r.get("/principals/:addr/rights", handle((req, res) => {
    const principal = addr(param(req, "addr"));
    res.json({ principal, rights: repo.rightsFor(principal) } satisfies RightsResponse);
  }));

  // --- 6.2 company and gateway ---

  r.get("/fiduciaries/:fid/purposes", handle((req, res) => {
    const f = repo.fiduciary(param(req, "fid"));
    res.json({ fiduciary: f.address, purposes: repo.purposesOf(f.address) } satisfies FiduciaryPurposesResponse);
  }));

  r.get("/fiduciaries/:fid/processors", handle((req, res) => {
    const f = repo.fiduciary(param(req, "fid"));
    res.json({ fiduciary: f.address, processors: repo.processorsOfFiduciary(f.address) } satisfies FiduciaryProcessorsResponse);
  }));

  r.get("/fiduciaries/:fid/consents", handle((req, res) => {
    const f = repo.fiduciary(param(req, "fid"));
    res.json({ fiduciary: f.address, rows: repo.consentRows(f) } satisfies FiduciaryConsentsResponse);
  }));

  const accessLimit = (q: unknown, fallback: number): number => Math.max(1, Math.min(500, Number(q ?? fallback) || fallback));

  r.get("/fiduciaries/:fid/access", handle((req, res) => {
    const f = repo.fiduciary(param(req, "fid"));
    res.json({ fiduciary: f.address, items: repo.accessFor(f.address, accessLimit(req.query.limit, DEFAULT_ACCESS_LIMIT)) } satisfies FiduciaryAccessResponse);
  }));

  r.post("/gateway/log", companyKey(core, true), handle((req, res) => {
    const row = parseLogEntry(req.body);
    mustOwn(res, row.fiduciary);
    repo.appendLog(row);
    core.publish({
      event: "access.logged",
      principal: row.principal,
      fiduciary: row.fiduciary,
      fiduciaryName: repo.fiduciary(row.fiduciary).name,
      entryId: row.id,
      seq: row.seq,
      purposeCode: row.purposeCode,
      decision: row.decision,
      reason: row.reason,
      endpoint: row.endpoint,
      at: row.at,
    });
    res.status(201).json({ accepted: true, seq: row.seq } satisfies GatewayLogResponse);
    core.anchors.notify(repo.fiduciary(row.fiduciary).address);
  }));

  r.get("/gateway/consent-state", companyKey(core, true), handle(async (req, res) => {
    const { principal, fid, purpose } = req.query;
    if (typeof principal !== "string" || typeof fid !== "string" || typeof purpose !== "string") {
      throw badRequest("principal, fid and purpose query parameters are required");
    }
    const f = repo.fiduciary(fid);
    mustOwn(res, f.address);
    res.json(await consentState(address(principal, "principal"), f.address, repo.purpose(f, purpose).id));
  }));

  r.post("/fiduciaries/:fid/export", handle((req, res) => {
    const f = repo.fiduciary(param(req, "fid"));
    res.json({
      fiduciary: f.address,
      generatedAt: now(),
      consents: repo.consentRows(f),
      access: repo.accessFor(f.address, 500),
      batches: repo.anchorsFor(f.address),
      ledgerHead: repo.latestLedgerHead(),
    } satisfies ExportResponse);
  }));

  // --- 6.3 auditor (the ledger explorer only; scorecards and verify need the anchoring job) ---

  r.get("/audit/ledger", handle((req, res) => {
    const { fid, principal, type } = req.query;
    for (const [name, v] of [["fid", fid], ["principal", principal]] as const) {
      if (v !== undefined && (typeof v !== "string" || !isAddress(v))) throw badRequest(`"${name}" must be an address`);
    }
    if (type !== undefined && !LEDGER_TYPES.includes(type as LedgerEventType)) {
      throw badRequest(`"type" must be one of ${LEDGER_TYPES.join(", ")}`);
    }
    res.json({
      events: repo.ledgerEvents({
        fiduciary: fid ? addr(fid as string) : undefined,
        principal: principal ? addr(principal as string) : undefined,
        type: type as LedgerEventType | undefined,
      }),
    } satisfies AuditLedgerResponse);
  }));

  r.get("/audit/fiduciaries", handle((_req, res) => {
    res.json({ fiduciaries: repo.fiduciaries().map((f) => scorecard(core, f.address)) } satisfies AuditFiduciariesResponse);
  }));

  r.post("/audit/verify/:fid", handle(async (req, res) => {
    res.json((await verifyFiduciary(core, repo.fiduciary(param(req, "fid")).address)) satisfies VerifyResponse);
  }));

  r.get("/audit/report/:fid", handle(async (req, res) => {
    res.json((await report(core, repo.fiduciary(param(req, "fid")).address)) satisfies AuditReportResponse);
  }));
  // --- 6.4 demo controls ---

  r.use("/demo", (_req, _res, next) => {
    if (!config.demoMode) return next(new HttpError(403, "DEMO_DISABLED", "Demo controls need DEMO_MODE=true"));
    next();
  });

  r.post("/demo/tamper/:fid", handle((req, res) => {
    res.json(tamper(core, repo.fiduciary(param(req, "fid")).address) satisfies TamperResponse);
  }));

  // Anchors pending log entries now instead of at the next timer tick: for rehearsals and the e2e script.
  // The presenter's "Withdraw and re-run": withdraws for a customer whose key Core holds (the demo principal). A real
  // wallet's key never leaves its phone, so for anyone else this refuses and the page waits for the phone instead.
  r.post("/demo/withdraw", handle(async (req, res) => {
    const o = requireBody(req.body);
    const f = repo.fiduciary(requireString(o, "fiduciary"));
    const purpose = repo.purpose(f, requireString(o, "purposeCode"));
    const principal = address(requireString(o, "principal"), "principal");
    const key = config.demoPrincipalKeys[principal.toLowerCase()];
    if (!key) throw new HttpError(403, "NOT_A_DEMO_PRINCIPAL", "Core holds no key for this customer: withdraw on their phone");

    const nonce = await onChain(() => chain.registry.nonces(principal));
    const message = { principal, fiduciary: f.address, purposeId: purpose.id, nonce: String(nonce), deadline: now() + 300 };
    const typed = withdrawTypedData(domain(), message);
    const signature = await new Wallet(key).signTypedData(typed.domain, { WithdrawConsent: [...WITHDRAW_CONSENT_TYPE] }, typed.message);
    const receipt = await relayer.send("withdrawConsent", [message, signature]);
    await settle(receipt);
    res.json({ txHash: receipt.hash, status: "confirmed" } satisfies WithdrawResponse);
  }));

  r.post("/demo/anchor", handle(async (req, res) => {
    const body = (req.body ?? {}) as Partial<DemoAnchorBody>;
    const fiduciary = typeof body.fiduciary === "string" ? repo.fiduciary(body.fiduciary).address : undefined;
    res.json({ batches: await core.anchors.runOnce(fiduciary) } satisfies DemoAnchorResponse);
  }));

  r.post("/demo/reset", handle(async (_req, res) => {
    await core.reset();
    res.json({ ok: true } satisfies DemoResetResponse);
  }));

  r.post("/demo/fire", handle(async (req, res) => {
    const o = requireBody(req.body);
    const f = repo.fiduciary(requireString(o, "fiduciary"));
    const purpose = repo.purpose(f, requireString(o, "purposeCode"));
    const principal = address(requireString(o, "principal"), "principal");

    // The company's own guarded endpoint decides and logs (through the gateway SDK); Core only reports the outcome.
    const loan = o.action === "loan_decision";
    if (o.action !== undefined && !loan) throw badRequest('"action" must be "loan_decision" when given');
    if (loan && purpose.code !== "credit_check") throw badRequest('"loan_decision" is a credit_check action');
    const target = loan ? LOAN_DECISION_ENDPOINT : { ...GUARDED_ENDPOINTS[purpose.code], method: "GET" as const };
    const base = companyBaseUrl(config, f.address);
    if (!target.path || !base) throw new HttpError(404, "NO_ENDPOINT", `${f.name} has no guarded endpoint for ${purpose.code}`);
    const url = base + target.path.replace(":id", SIMULATOR_CUSTOMER_ID);

    let response: globalThis.Response;
    try {
      response = await fetch(url, { method: target.method, headers: { "x-sammati-principal": principal }, signal: AbortSignal.timeout(COMPANY_TIMEOUT_MS) });
    } catch {
      throw new HttpError(502, "COMPANY_UNREACHABLE", `${f.name}'s backend did not answer at ${base}; is it running?`);
    }

    let decision: Decision;
    let reason: AccessReason;
    let result: DemoFireResponse["result"];
    if (response.status === 200) {
      [decision, reason] = ["ALLOWED", "OK"];
      // Only the two QuickLoan endpoints that return no personal data by construction are relayed (trd.md §6.4).
      if (purpose.code === "credit_check") result = sanitiseResult(await response.json().catch(() => undefined));
    } else if (response.status === 451) {
      const body = (await response.json().catch(() => ({}))) as { code?: string };
      if (!(REASON_CODES as readonly string[]).includes(body.code ?? "")) {
        throw new HttpError(502, "COMPANY_ERROR", `${f.name} answered 451 without a reason code`);
      }
      [decision, reason] = ["BLOCKED", body.code as AccessReason];
    } else {
      throw new HttpError(502, "COMPANY_ERROR", `${f.name} answered ${response.status}`);
    }
    res.json({ decision, reason, entryId: response.headers.get(ENTRY_ID_HEADER) ?? "", ...(result ? { result } : {}) } satisfies DemoFireResponse);
  }));
  // --- not built yet in real mode (trd.md §6.6) ---

  const later = (what: string): RequestHandler => (_req, _res, next) =>
    next(new HttpError(501, "NOT_IMPLEMENTED", `${what} is not available in real mode yet; run with STUB_MODE=true to use the stub`));
  r.post("/fiduciaries/:fid/purposes", later("Registering purposes from the console"));
  r.post("/fiduciaries/:fid/processors", later("Registering processors from the console"));

  return r;
}
