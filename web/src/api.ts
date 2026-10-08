/**
 * Typed API client for Sammati Core endpoints used by the Company Console.
 * Uses CORE_URL from ./core.
 */

import type {
  AuditFiduciariesResponse,
  AuditLedgerResponse,
  AuditReportResponse,
  ConsentRow,
  CreateRequestBody,
  CreateRequestResponse,
  DemoFireBody,
  DemoFireResponse,
  DemoResetResponse,
  ExportResponse,
  FiduciaryAccessResponse,
  FiduciaryConsentsResponse,
  FiduciaryPurposesResponse,
  GrantRequestBody,
  GrantResponse,
  LedgerEventView,
  NoticePurpose,
  RegisterPurposeBody,
  RegisterPurposeResponse,
  Scorecard,
  StoredAccessLogEntry,
  TamperResponse,
  VerifyResponse,
} from "@sammati/shared";
import { CORE_URL } from "./core";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${CORE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers ?? {}),
    },
  });

  if (!res.ok) {
    let errMessage = `HTTP ${res.status} ${res.statusText}`;
    try {
      const data = await res.json();
      if (data?.error?.message) {
        errMessage = data.error.message;
      }
    } catch {
      // Non-JSON error body
    }
    throw new Error(errMessage);
  }

  return (await res.json()) as T;
}

export async function fetchPurposes(fiduciary: string): Promise<NoticePurpose[]> {
  try {
    const data = await request<FiduciaryPurposesResponse>(`/v1/fiduciaries/${fiduciary}/purposes`);
    return data.purposes;
  } catch (err) {
    if (import.meta.env?.MODE !== "test") {
      console.warn("fetchPurposes failed, falling back to empty:", err);
    }
    return [];
  }
}

export async function registerPurpose(
  fiduciary: string,
  body: RegisterPurposeBody,
): Promise<RegisterPurposeResponse> {
  return request<RegisterPurposeResponse>(`/v1/fiduciaries/${fiduciary}/purposes`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function fetchConsents(fiduciary: string): Promise<ConsentRow[]> {
  try {
    const data = await request<FiduciaryConsentsResponse>(`/v1/fiduciaries/${fiduciary}/consents`);
    return data.rows;
  } catch (err) {
    if (import.meta.env?.MODE !== "test") {
      console.warn("fetchConsents failed:", err);
    }
    return [];
  }
}

export async function fetchAccessLogs(
  fiduciary: string,
  limit = 50,
): Promise<StoredAccessLogEntry[]> {
  try {
    const data = await request<FiduciaryAccessResponse>(
      `/v1/fiduciaries/${fiduciary}/access?limit=${limit}`,
    );
    return data.items;
  } catch (err) {
    if (import.meta.env?.MODE !== "test") {
      console.warn("fetchAccessLogs failed:", err);
    }
    return [];
  }
}

export async function createConsentRequest(
  fiduciary: string,
  body: CreateRequestBody,
): Promise<CreateRequestResponse> {
  return request<CreateRequestResponse>(`/v1/fiduciaries/${fiduciary}/requests`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function demoFire(body: DemoFireBody): Promise<DemoFireResponse> {
  return request<DemoFireResponse>("/v1/demo/fire", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function fetchExport(fiduciary: string): Promise<ExportResponse> {
  return request<ExportResponse>(`/v1/fiduciaries/${fiduciary}/export`, {
    method: "POST",
  });
}

export async function submitGrant(body: GrantRequestBody): Promise<GrantResponse> {
  return request<GrantResponse>("/v1/consents/grant", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// --- Auditor APIs (A-01..A-04) ---

export async function fetchAuditScorecards(): Promise<Scorecard[]> {
  const data = await request<AuditFiduciariesResponse>("/v1/audit/fiduciaries");
  return data.fiduciaries;
}

export async function fetchLedgerEvents(params?: {
  fid?: string;
  principal?: string;
  type?: string;
}): Promise<LedgerEventView[]> {
  const q = new URLSearchParams();
  if (params?.fid) q.set("fid", params.fid);
  if (params?.principal) q.set("principal", params.principal);
  if (params?.type && params.type !== "all") q.set("type", params.type);
  const qs = q.toString() ? `?${q.toString()}` : "";
  const data = await request<AuditLedgerResponse>(`/v1/audit/ledger${qs}`);
  return data.events;
}

export async function verifyFiduciaryIntegrity(fiduciary: string): Promise<VerifyResponse> {
  return request<VerifyResponse>(`/v1/audit/verify/${fiduciary}`, {
    method: "POST",
  });
}

export async function fetchAuditReport(fiduciary: string): Promise<AuditReportResponse> {
  return request<AuditReportResponse>(`/v1/audit/report/${fiduciary}`);
}

export async function triggerTamper(fiduciary: string): Promise<TamperResponse> {
  return request<TamperResponse>(`/v1/demo/tamper/${fiduciary}`, {
    method: "POST",
  });
}

export async function triggerDemoReset(): Promise<DemoResetResponse> {
  return request<DemoResetResponse>("/v1/demo/reset", {
    method: "POST",
  });
}
