import type { ApiError } from "@sammati/shared";
import type { ErrorRequestHandler, RequestHandler } from "express";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new HttpError(404, "NOT_FOUND", `No route for ${req.method} ${req.path}`));
};

// Express identifies error middleware by its four-argument signature.
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    const retryAfter = (err as HttpError & { retryAfter?: number }).retryAfter;
    if (retryAfter !== undefined) res.setHeader("Retry-After", String(retryAfter));
    res.status(err.status).json({ error: { code: err.code, message: err.message } } satisfies ApiError);
    return;
  }
  if (err instanceof SyntaxError && "body" in err) {
    res.status(400).json({ error: { code: "BAD_JSON", message: "Request body is not valid JSON" } } satisfies ApiError);
    return;
  }
  console.error(err);
  res.status(500).json({ error: { code: "INTERNAL", message: "Unexpected error" } } satisfies ApiError);
};

export function badRequest(message: string, code = "BAD_REQUEST"): HttpError {
  return new HttpError(400, code, message);
}

// --- small body validators; the stub trusts nothing it parses ---

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function requireString(obj: Record<string, unknown>, key: string): string {
  const v = obj[key];
  if (typeof v !== "string" || v === "") throw badRequest(`"${key}" must be a non-empty string`);
  return v;
}

export function requireNumber(obj: Record<string, unknown>, key: string): number {
  const v = obj[key];
  if (typeof v !== "number" || !Number.isSafeInteger(v)) throw badRequest(`"${key}" must be an integer`);
  return v;
}

export function requireBody(body: unknown): Record<string, unknown> {
  if (!isRecord(body)) throw badRequest("JSON object body required");
  return body;
}
