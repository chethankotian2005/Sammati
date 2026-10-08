// Routes for the notification centre, renewal requests and the console's Expiring table (trd.md §6.12).
import { Router, type Request, type RequestHandler, type Response } from "express";
import type { ExpiringResponse, NotificationPatchBody, RenewalOpenResponse, TargetedRequestResponse } from "@sammati/shared";
import { requireBody, requireString } from "../errors";
import { address } from "../validate";
import type { RealCore } from "./core";

const handle =
  (fn: (req: Request, res: Response) => unknown | Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    Promise.resolve()
      .then(() => fn(req, res))
      .catch(next);
  };

const param = (req: Request, name: string): string => String(req.params[name]);

export function notificationRoutes(core: RealCore): Router {
  const { repo, notifications, renewals } = core;
  const r = Router();

  // --- the customer's side (W13) ---

  r.get("/principals/:addr/notifications", handle((req, res) => {
    res.json(notifications.list(address(param(req, "addr"), "address"), req.query.limit));
  }));

  // Registered before the `:id` route, or "read" would be taken for an id.
  r.post("/principals/:addr/notifications/read", handle((req, res) => {
    res.json({ ok: true, unread: notifications.markAllRead(address(param(req, "addr"), "address")) });
  }));

  r.post("/principals/:addr/notifications/:id", handle((req, res) => {
    const body = requireBody(req.body) as NotificationPatchBody;
    res.json(notifications.patch(address(param(req, "addr"), "address"), param(req, "id"), body));
  }));

  r.post("/principals/:addr/renewals", handle((req, res) => {
    const body = requireBody(req.body);
    const { requestId } = renewals.forCustomer(address(param(req, "addr"), "address"), address(requireString(body, "fiduciary"), "fiduciary"), requireString(body, "purposeCode"));
    res.json({ requestId } satisfies RenewalOpenResponse);
  }));

  // --- the company's side (console) ---

  r.get("/fiduciaries/:fid/expiring", handle((req, res) => {
    res.json({ rows: renewals.expiring(repo.fiduciary(param(req, "fid"))) } satisfies ExpiringResponse);
  }));

  r.post("/fiduciaries/:fid/renewals", handle((req, res) => {
    const f = repo.fiduciary(param(req, "fid"));
    const body = requireBody(req.body);
    const answer = renewals.ask(f, address(requireString(body, "principal"), "principal"), requireString(body, "purposeCode"), body.message);
    res.status(201).json(answer satisfies TargetedRequestResponse);
  }));

  return r;
}
