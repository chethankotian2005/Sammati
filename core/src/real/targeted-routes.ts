// Routes for Sammati IDs, targeted requests, the inbox, decline and block (trd.md §6.1, §6.2, §6.11).
import { Router, type Request, type RequestHandler, type Response } from "express";
import type {
  BlocksResponse,
  IdentityResponse,
  InboxResponse,
  TargetedRequestResponse,
  TargetedRequestsResponse,
} from "@sammati/shared";
import { noticeHash } from "@sammati/shared";
import { badRequest, requireBody, requireString } from "../errors";
import { noticeInput } from "../notice";
import { address } from "../validate";
import type { RealCore } from "./core";
import { NOTICE_VERSION } from "./repo";
import { cleanMessage, normaliseHandle } from "./targeted";
import { HttpError } from "../errors";

const handle =
  (fn: (req: Request, res: Response) => unknown | Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    Promise.resolve()
      .then(() => fn(req, res))
      .catch(next);
  };

const param = (req: Request, name: string): string => String(req.params[name]);

export function targetedRoutes(core: RealCore): Router {
  const { repo, targeted } = core;
  const r = Router();

  // --- Sammati IDs (N-01) ---

  r.post("/identities", handle((req, res) => {
    const body = requireBody(req.body);
    const principal = address(requireString(body, "principal"), "principal");
    const result = targeted.register(body.handle, principal, body.issuedAt, body.signature);
    res.status(result.created ? 201 : 200).json({ handle: result.handle, principal: principal.toLowerCase() });
  }));

  r.get("/principals/:addr/identity", handle((req, res) => {
    res.json({ handle: targeted.identityOf(address(param(req, "addr"), "address")) } satisfies IdentityResponse);
  }));

  // --- a company asks a customer (N-02) ---

  r.post("/fiduciaries/:fid/requests/targeted", handle((req, res) => {
    const f = repo.fiduciary(param(req, "fid"));
    const body = requireBody(req.body);
    const to = normaliseHandle(body.handle);
    if (!to) throw new HttpError(400, "BAD_HANDLE", "A Sammati ID looks like asha@sammati");
    const codes = body.purposes;
    if (!Array.isArray(codes) || codes.length === 0 || !codes.every((c) => typeof c === "string")) {
      throw badRequest('"purposes" must be a non-empty array of purpose codes');
    }
    const purposes = (codes as string[]).map((c) => repo.purpose(f, c));
    const message = cleanMessage(body.message);
    const expiresAt = targeted.expiryFrom(body.expiresInHours);

    // Nothing about any customer has been looked at yet: the company's own limit comes first, and says nothing about them.
    targeted.checkRate(f);
    const hash = noticeHash(noticeInput(f.address, purposes, NOTICE_VERSION));
    const created = repo.createRequest(f, purposes.map((p) => p.id), to, hash);
    targeted.send(f, created.id, to, purposes.map((p) => p.code), message, expiresAt);
    res.status(201).json({ requestId: created.id, status: "sent", expiresAt } satisfies TargetedRequestResponse);
  }));

  r.get("/fiduciaries/:fid/requests/targeted", handle((req, res) => {
    res.json({ requests: targeted.listFor(repo.fiduciary(param(req, "fid"))) } satisfies TargetedRequestsResponse);
  }));

  r.get("/fiduciaries/:fid/requests/targeted/:requestId", handle((req, res) => {
    res.json(targeted.statusFor(repo.fiduciary(param(req, "fid")), param(req, "requestId")));
  }));

  // --- the customer's side: inbox, decline, block (W-14) ---

  r.get("/principals/:addr/requests", handle((req, res) => {
    res.json({ requests: targeted.inbox(address(param(req, "addr"), "address")) } satisfies InboxResponse);
  }));

  r.post("/requests/:requestId/decline", handle((req, res) => {
    const body = requireBody(req.body);
    const principal = address(requireString(body, "principal"), "principal");
    res.json({ status: targeted.decline(param(req, "requestId"), principal, body.issuedAt, body.signature) });
  }));

  r.get("/principals/:addr/blocks", handle((req, res) => {
    res.json({ blocked: targeted.blocks(address(param(req, "addr"), "address")) } satisfies BlocksResponse);
  }));

  r.post("/principals/:addr/blocks", handle((req, res) => {
    const body = requireBody(req.body);
    const fiduciary = address(requireString(body, "fiduciary"), "fiduciary");
    res.json({ blocked: targeted.setBlocked(address(param(req, "addr"), "address"), fiduciary, body.action, body.issuedAt, body.signature) });
  }));

  return r;
}
