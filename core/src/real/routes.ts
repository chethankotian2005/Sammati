import { Router, type Request, type RequestHandler, type Response } from "express";
import { isAddress, isHexString } from "ethers";
import type {
  AccessProofResponse,
  ActivityResponse,
  AuditFiduciariesResponse,
  AuditLedgerResponse,
  AuditReportResponse,
  CascadeResponse,
  ConsentStateResponse,
  CreateRequestResponse,
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
  VerifyResponse,
  WithdrawResponse,
} from "@sammati/shared";
import { buildDomain, noticeHash } from "@sammati/shared";
import { HttpError, badRequest, requireBody, requireString } from "../errors";
import { buildNotice, noticeInput } from "../notice";
import { now } from "../clock";
import { address, bytes32, parseGrant, parseLogEntry, parseRightsBody, parseWithdraw } from "../validate";
import { accessProof, report, scorecard, verifyFiduciary } from "./audit";
import { toHttpError } from "./chain";
import type { RealCore } from "./core";
import { companyKey, mustOwn, regulatorOnly } from "./onboarding-routes";
import { addr, NOTICE_VERSION } from "./repo";

const DEFAULT_ACTIVITY_LIMIT = 50;
const DEFAULT_ACCESS_LIMIT = 100;
const LEDGER_TYPES: readonly LedgerEventType[] = ["granted", "withdrawn", "ack", "anchor", "purpose"];

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
    const notice = buildNotice({
      requestId: request.id,
      fiduciary: { address: f.address, name: f.name, color: f.color },
      purposes: request.purposeIds.map((id) => repo.purpose(f, id)),
      version: NOTICE_VERSION,
      domain: domain(),
      principal,
      nonce,
    });
    res.json(notice);
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
    core.notifications.markRenewed(grant.principal, grant.fiduciary, grant.purposeId); // its reminders are answered
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

  // A company moves a customer's rights request along; the customer is told in the wallet (W-10, N-05).
  r.post("/fiduciaries/:fid/rights/:id", companyKey(core, true), handle((req, res) => {
    const f = repo.fiduciary(param(req, "fid"));
    mustOwn(res, f.address);
    const body = requireBody(req.body);
    const status = body.status;
    if (status !== "in_progress" && status !== "resolved") throw badRequest('"status" must be "in_progress" or "resolved"');
    // eslint-disable-next-line no-control-regex
    const reply = typeof body.reply === "string" ? body.reply.replace(/[ -]/g, " ").trim().slice(0, 280) || null : null;
    const updated = repo.updateRightsRequest(f.address, param(req, "id"), status, reply);
    if (!updated) throw new HttpError(404, "RIGHTS_REQUEST_NOT_FOUND", "No such request for this company");
    core.notifications.onRightsUpdated({ ...updated, reply });
    res.json({ id: updated.id, status: updated.status, reply });
  }));

  // --- 6.2 company and gateway ---

  const consoleAuth = (req: Request, res: Response, next: import("express").NextFunction) => {
    try {
      const auth = req.header("Authorization");
      const api = req.header("x-sammati-api-key");
      const fid = req.params.fid ?? "";
      let allowed = false;
      if (auth && auth.startsWith("Bearer ")) {
        const op = repo.consoleMe(auth.substring(7));
        if (op && op.fiduciaries.some(f => f.address.toLowerCase() === fid.toLowerCase())) allowed = true;
      }
      if (api) {
        const company = repo.fiduciaryForKey(api as string);
        if (company && company.address.toLowerCase() === fid.toLowerCase()) allowed = true;
      }
      if (!allowed) throw new HttpError(403, "FIDUCIARY_MISMATCH", "Access denied to this company");
      next();
    } catch (e) { next(e); }
  };

  r.get("/fiduciaries/:fid/rights", consoleAuth, handle((req, res) => {
    res.json({ rights: repo.fiduciaryRights(param(req, "fid")) });
  }));

  r.get("/fiduciaries/:fid/purposes", handle((req, res) => {
    const f = repo.fiduciary(param(req, "fid"));
    res.json({ fiduciary: f.address, purposes: repo.purposesOf(f.address) } satisfies FiduciaryPurposesResponse);
  }));

  r.get("/fiduciaries/:fid/processors", handle((req, res) => {
    const f = repo.fiduciary(param(req, "fid"));
    res.json({ fiduciary: f.address, processors: repo.processorsOfFiduciary(f.address) } satisfies FiduciaryProcessorsResponse);
  }));

  // In production the list of a company's customers is for its own operators and servers, and the Auditor is the regulator's (trd.md §10.8).
  const ifLoginRequired = (guard: RequestHandler): RequestHandler => (config.requireOperatorAuth ? guard : (_req, _res, next) => next());
  const operatorsOnly = ifLoginRequired(consoleAuth);
  const auditorOnly = ifLoginRequired(regulatorOnly(core));

  r.get("/fiduciaries/:fid/consents", operatorsOnly, handle((req, res) => {
    const f = repo.fiduciary(param(req, "fid"));
    res.json({ fiduciary: f.address, rows: repo.consentRows(f) } satisfies FiduciaryConsentsResponse);
  }));

  const accessLimit = (q: unknown, fallback: number): number => Math.max(1, Math.min(500, Number(q ?? fallback) || fallback));

  r.get("/fiduciaries/:fid/access", operatorsOnly, handle((req, res) => {
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
      ...(row.outcome === undefined ? {} : { dataCategories: row.dataCategories, outcome: row.outcome }),
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

  r.post("/fiduciaries/:fid/export", consoleAuth, handle((req, res) => {
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

  // --- 6.3 auditor ---

  r.get("/audit/ledger", auditorOnly, handle((req, res) => {
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

  r.get("/audit/fiduciaries", auditorOnly, handle((_req, res) => {
    res.json({ fiduciaries: repo.fiduciaries().map((f) => scorecard(core, f.address)) } satisfies AuditFiduciariesResponse);
  }));

  r.post("/audit/verify/:fid", auditorOnly, handle(async (req, res) => {
    res.json((await verifyFiduciary(core, repo.fiduciary(param(req, "fid")).address)) satisfies VerifyResponse);
  }));

  r.get("/audit/report/:fid", auditorOnly, handle(async (req, res) => {
    res.json((await report(core, repo.fiduciary(param(req, "fid")).address)) satisfies AuditReportResponse);
  }));
  // --- not built yet in real mode (trd.md §6.6) ---

  const later = (what: string): RequestHandler => (_req, _res, next) =>
    next(new HttpError(501, "NOT_IMPLEMENTED", `${what} is not available in real mode yet`));
  r.post("/fiduciaries/:fid/purposes", later("Registering purposes from the console"));
  r.post("/fiduciaries/:fid/processors", later("Registering processors from the console"));

  return r;
}
