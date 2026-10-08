/**
 * Typed API client for Sammati Core endpoints used by the Company Console.
 * Uses CORE_URL from ./core.
 */

import {
  REGULATOR_KEY_HEADER,
  type ApplicationInput,
  type ApplicationView,
  type ApproveBody,
  type ApproveResponse,
  type FiduciariesResponse,
  type FiduciaryInfo,
  type FiduciaryProcessorsResponse,
  type RegistrationCreated,
  type RegistrationStatusResponse,
  type SandboxResponse,
  type TestPrincipal,
} from "@sammati/shared";
import type {
  AuditFiduciariesResponse,
  AuditLedgerResponse,
  AuditReportResponse,
  ConsentRow,
  CreateRequestBody,
  CreateRequestResponse,
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
  TargetedRequestBody,
  TargetedRequestResponse,
  TargetedRequestRow,
  ExpiringResponse,
  ExpiringRow,
  TargetedRequestsResponse,
  VerifyResponse,
} from "@sammati/shared";
import { CORE_URL } from "./core";

/** A refusal from Core with its machine code, e.g. `BAD_REQUEST`. Still an Error with Core's message. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | null,
  ) {
    super(message);
  }
}

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
    let code: string | null = null;
    try {
      const data = await res.json();
      if (data?.error?.message) {
        errMessage = data.error.message;
      }
      if (typeof data?.error?.code === "string") code = data.error.code;
    } catch {
      // Non-JSON error body
    }
    throw new ApiError(errMessage, res.status, code);
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

/** Ask a specific customer by Sammati ID (trd.md §6.11). Whatever the ID, a well-formed request gets the same answer. */
export async function sendTargetedRequest(fiduciary: string, body: TargetedRequestBody): Promise<TargetedRequestResponse> {
  return request<TargetedRequestResponse>(`/v1/fiduciaries/${fiduciary}/requests/targeted`, { method: "POST", body: JSON.stringify(body) });
}

export async function fetchTargetedRequests(fiduciary: string): Promise<TargetedRequestRow[]> {
  return (await request<TargetedRequestsResponse>(`/v1/fiduciaries/${fiduciary}/requests/targeted`)).requests;
}

/** The company's consents that are about to expire, or just did, with the status of any renewal it asked for (trd.md §6.12). */
export async function fetchExpiring(fiduciary: string): Promise<ExpiringRow[]> {
  return (await request<ExpiringResponse>(`/v1/fiduciaries/${fiduciary}/expiring`)).rows;
}

/** Ask a customer the company already has consent from to renew it. Same answer whether or not it was delivered. */
export async function requestRenewal(fiduciary: string, principal: string, purposeCode: string): Promise<TargetedRequestResponse> {
  return request<TargetedRequestResponse>(`/v1/fiduciaries/${fiduciary}/renewals`, { method: "POST", body: JSON.stringify({ principal, purposeCode }) });
}

/** Where the Sammati Processor is (`GET /v1/processor`, trd.md §6.1). */
export async function fetchProcessorUrl(): Promise<string> {
  const data = await request<{ url: string }>("/v1/processor");
  return data.url.replace(/\/+$/, "");
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

// --- directory and onboarding (R-01 to R-04) ---

/** Every approved company (`GET /v1/fiduciaries`). */
export async function fetchFiduciaries(): Promise<FiduciaryInfo[]> {
  const data = await request<FiduciariesResponse>("/v1/fiduciaries");
  if (!Array.isArray(data?.fiduciaries)) throw new ApiError("Core did not return a list of companies", 200, null);
  return data.fiduciaries;
}

export async function fetchProcessors(fiduciary: string): Promise<FiduciaryProcessorsResponse["processors"]> {
  try {
    return (await request<FiduciaryProcessorsResponse>(`/v1/fiduciaries/${fiduciary}/processors`)).processors;
  } catch (err) {
    if (import.meta.env?.MODE !== "test") console.warn("fetchProcessors failed:", err);
    return [];
  }
}

export async function submitApplication(input: ApplicationInput): Promise<RegistrationCreated> {
  return request<RegistrationCreated>("/v1/registrations", { method: "POST", body: JSON.stringify(input) });
}

export async function fetchRegistration(applicationId: string): Promise<RegistrationStatusResponse> {
  return request<RegistrationStatusResponse>(`/v1/registrations/${applicationId}`);
}

const asRegulator = (code: string): RequestInit => ({ headers: { [REGULATOR_KEY_HEADER]: code } });

export async function fetchApplications(code: string): Promise<ApplicationView[]> {
  return (await request<{ applications: ApplicationView[] }>("/v1/regulator/registrations", asRegulator(code))).applications;
}

export async function approveApplication(code: string, id: string, body: ApproveBody): Promise<ApproveResponse> {
  return request<ApproveResponse>(`/v1/regulator/registrations/${id}/approve`, { method: "POST", body: JSON.stringify(body), ...asRegulator(code) });
}

export async function rejectApplication(code: string, id: string, note: string): Promise<{ application: ApplicationView }> {
  return request(`/v1/regulator/registrations/${id}/reject`, { method: "POST", body: JSON.stringify({ note }), ...asRegulator(code) });
}

export async function setSandbox(code: string, fiduciary: string, sandbox: boolean): Promise<SandboxResponse> {
  return request<SandboxResponse>(`/v1/regulator/fiduciaries/${fiduciary}/sandbox`, { method: "POST", body: JSON.stringify({ sandbox }), ...asRegulator(code) });
}

export async function reissueKey(code: string, fiduciary: string): Promise<void> {
  await request(`/v1/regulator/fiduciaries/${fiduciary}/reissue-key`, { method: "POST", body: "{}", ...asRegulator(code) });
}

export async function fetchTestPrincipals(code: string): Promise<TestPrincipal[]> {
  return (await request<{ principals: TestPrincipal[] }>("/v1/regulator/test-principals", asRegulator(code))).principals;
}

export async function addTestPrincipal(code: string, who: { handle: string } | { principal: string }): Promise<TestPrincipal[]> {
  return (await request<{ principals: TestPrincipal[] }>("/v1/regulator/test-principals", { method: "POST", body: JSON.stringify(who), ...asRegulator(code) })).principals;
}

export async function removeTestPrincipal(code: string, principal: string): Promise<TestPrincipal[]> {
  return (await request<{ principals: TestPrincipal[] }>(`/v1/regulator/test-principals/${principal}`, { method: "DELETE", ...asRegulator(code) })).principals;
}
