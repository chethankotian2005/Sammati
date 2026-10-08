// The stub has no identities, no inbox, no blocks and no notifications: they need real state to mean anything (trd.md §6.11, §6.12).
import { Router } from "express";
import { HttpError } from "../errors";

export function targetedStubRoutes(): Router {
  const r = Router();
  const later = () => {
    throw new HttpError(501, "NOT_IMPLEMENTED", "Sammati IDs and targeted requests need real mode (STUB_MODE=false)");
  };
  r.post("/identities", later);
  r.get("/principals/:addr/identity", later);
  r.get("/principals/:addr/requests", later);
  r.get("/principals/:addr/blocks", later);
  r.post("/principals/:addr/blocks", later);
  r.post("/requests/:requestId/decline", later);
  r.all("/fiduciaries/:fid/requests/targeted", later);
  r.all("/fiduciaries/:fid/requests/targeted/:requestId", later);
  r.all("/principals/:addr/notifications", later);
  r.all("/principals/:addr/notifications/:id", later);
  r.post("/principals/:addr/renewals", later);
  r.get("/fiduciaries/:fid/expiring", later);
  r.post("/fiduciaries/:fid/renewals", later);
  return r;
}
