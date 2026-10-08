import { Router } from "express";
import { recoverAddress } from "ethers";
import {
  buildDomain,
  eip712Digest,
  explorerTxUrl,
  grantTypedData,
  withdrawTypedData,
  type AccessProofResponse,
  type ActivityResponse,
  type CascadeResponse,
  type ConsentProofResponse,
  type CreateRequestResponse,
  type GrantResponse,
  type PrincipalConsentsResponse,
  type Hex,
  type WithdrawResponse,
} from "@sammati/shared";
import { accessProof } from "../audit";
import { stubExplorerUrl } from "../config";
import type { Ctx } from "../context";
import { HttpError, badRequest, requireBody, requireString } from "../errors";
import { buildNotice } from "../notice";
import { now } from "../store";
import { address, bytes32, parseGrant, parseWithdraw } from "../validate";

const DEFAULT_ACTIVITY_LIMIT = 50;

function assertSigner(digest: string, signature: string, principal: Hex): void {
  let signer: string;
  try {
    signer = recoverAddress(digest, signature);
  } catch {
    throw new HttpError(400, "BAD_SIGNATURE", "Signature could not be parsed");
  }
  if (signer.toLowerCase() !== principal.toLowerCase()) {
    throw new HttpError(400, "BAD_SIGNATURE", "Signature does not match principal");
  }
}

export function consentRoutes(ctx: Ctx): Router {
  const { store, config } = ctx;
  const r = Router();
  const domain = () => buildDomain(store.fx.directory.chainId, store.fx.directory.verifyingContract);
  const explorer = (tx: Hex) => explorerTxUrl(stubExplorerUrl(config), tx);

  r.post("/fiduciaries/:fid/requests", (req, res) => {
    const f = store.fiduciary(req.params.fid!);
    const body = requireBody(req.body);
    const codes = body.purposes;
    if (!Array.isArray(codes) || codes.length === 0 || !codes.every((c) => typeof c === "string")) {
      throw badRequest('"purposes" must be a non-empty array of purpose codes');
    }
    const purposeIds = (codes as string[]).map((c) => store.purpose(f, c).id);
    const created = store.createRequest(f, purposeIds, requireString(body, "customerAlias"));
    const out: CreateRequestResponse = {
      requestId: created.id,
      qrPayload: { v: 1, core: config.publicUrl, requestId: created.id, fiduciary: f.address, name: f.name },
    };
    res.status(201).json(out);
  });

  r.get("/requests/:requestId", (req, res) => {
    const request = store.request(req.params.requestId!);
    const f = store.fiduciary(request.fiduciary);
    const principalQ = typeof req.query.principal === "string" ? address(req.query.principal, "principal") : null;
    const purposes = request.purposeIds.map((id) => store.purpose(f, id));
    const version = store.fx.directory.noticeVersion;

    const nonce = principalQ ? String(store.nonce(principalQ)) : "0";
    const out = buildNotice({
      requestId: request.id,
      fiduciary: { address: f.address, name: f.name, color: f.color },
      purposes,
      version,
      domain: domain(),
      principal: principalQ,
      nonce,
    });
    res.json(out);
  });

  r.post("/consents/grant", (req, res) => {
    const body = requireBody(req.body);
    const grant = parseGrant(body.request);
    const f = store.fiduciary(grant.fiduciary);
    store.purpose(f, grant.purposeId);
    if (grant.deadline < now()) throw new HttpError(400, "DEADLINE_PASSED", "Signature deadline has passed");
    if (grant.expiresAt <= now()) throw new HttpError(400, "BAD_EXPIRY", "expiresAt must be in the future");
    assertSigner(eip712Digest(grantTypedData(domain(), grant)), requireString(body, "signature"), grant.principal);

    const { txHash, record } = store.grant(grant);
    const purpose = store.purpose(f, grant.purposeId);
    ctx.publish({
      event: "consent.updated",
      principal: grant.principal,
      fiduciary: f.address,
      purposeId: grant.purposeId,
      purposeCode: purpose.code,
      status: "Active",
      expiresAt: record.expiresAt,
      txHash,
      at: record.updatedAt,
    });
    res.json({ txHash, status: "confirmed" } satisfies GrantResponse);
  });

  r.post("/consents/withdraw", (req, res) => {
    const body = requireBody(req.body);
    const w = parseWithdraw(body.request);
    const f = store.fiduciary(w.fiduciary);
    const purpose = store.purpose(f, w.purposeId);
    if (w.deadline < now()) throw new HttpError(400, "DEADLINE_PASSED", "Signature deadline has passed");
    assertSigner(eip712Digest(withdrawTypedData(domain(), w)), requireString(body, "signature"), w.principal);

    const { txHash, record } = store.withdraw(w);
    ctx.publish({
      event: "consent.updated",
      principal: w.principal,
      fiduciary: f.address,
      purposeId: w.purposeId,
      purposeCode: purpose.code,
      status: "Withdrawn",
      expiresAt: record.expiresAt,
      txHash,
      at: record.updatedAt,
    });
    store.startCascade(w.principal, f, w.purposeId, (item) =>
      ctx.publish({
        event: "cascade.updated",
        principal: w.principal,
        purposeId: w.purposeId,
        processor: item.processor,
        processorName: item.name,
        notifiedAt: item.notifiedAt,
        ackedAt: item.ackedAt,
        txHash: item.txHash,
      }),
    );
    res.json({ txHash, status: "confirmed" } satisfies WithdrawResponse);
  });

  r.get("/principals/:addr/consents", (req, res) => {
    res.json({ ...store.principalConsents(address(req.params.addr!, "addr")), domain: domain() } satisfies PrincipalConsentsResponse);
  });

  r.get("/principals/:addr/activity", (req, res) => {
    const principal = address(req.params.addr!, "addr");
    const limit = Math.max(1, Math.min(200, Number(req.query.limit ?? DEFAULT_ACTIVITY_LIMIT) || DEFAULT_ACTIVITY_LIMIT));
    const items = store.activity(principal).slice(0, limit).map((e) => ({
      id: e.id,
      seq: e.seq,
      fiduciary: e.fiduciary,
      fiduciaryName: store.fiduciary(e.fiduciary).name,
      purposeCode: e.purposeCode,
      decision: e.decision,
      reason: e.reason,
      endpoint: e.endpoint,
      at: e.at,
      anchored: e.batchIndex !== null,
    }));
    res.json({ principal, items } satisfies ActivityResponse);
  });

  r.get("/principals/:addr/cascade/:purposeId", (req, res) => {
    const principal = address(req.params.addr!, "addr");
    const purposeId = bytes32(req.params.purposeId!, "purposeId");
    const owner = store.fiduciaries.find((f) => f.purposes.some((p) => p.id.toLowerCase() === purposeId));
    if (!owner) throw new HttpError(404, "PURPOSE_NOT_FOUND", `Unknown purpose ${purposeId}`);
    res.json({
      principal,
      purposeId,
      processors: store.cascadeFor(principal, owner, purposeId),
    } satisfies CascadeResponse);
  });

  r.get("/proof/consent/:txHash", (req, res) => {
    const txHash = bytes32(req.params.txHash!, "txHash");
    const e = store.ledgerEvents.find(
      (x) => x.txHash.toLowerCase() === txHash && (x.type === "granted" || x.type === "withdrawn"),
    );
    if (!e || !e.principal || !e.fiduciary || !e.purposeId || !e.ledgerHead) {
      throw new HttpError(404, "PROOF_NOT_FOUND", `No consent transaction ${txHash}`);
    }
    const payload = e.payload ?? {};
    res.json({
      txHash: e.txHash,
      type: e.type as "granted" | "withdrawn",
      principal: e.principal,
      fiduciary: e.fiduciary,
      purposeId: e.purposeId,
      expiresAt: typeof payload.expiresAt === "number" ? payload.expiresAt : null,
      noticeHash: typeof payload.noticeHash === "string" ? payload.noticeHash : null,
      ledgerHead: e.ledgerHead,
      blockNumber: e.blockNumber,
      at: e.at,
      explorerUrl: explorer(e.txHash),
    } satisfies ConsentProofResponse);
  });

  r.get("/proof/access/:entryId", (req, res) => {
    res.json(accessProof(store, req.params.entryId!, stubExplorerUrl(config)) satisfies AccessProofResponse);
  });

  return r;
}
