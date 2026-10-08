/**
 * The two public reads the Data Flow Inspector makes, and the check that tells a vault event from any other frame.
 * Both reads return what the server said, untouched; nothing is displayed before `filterStaffView` has seen it.
 */

import type { VaultEvent, VaultEventName } from "@sammati/shared";

export interface RawAnswer {
  status: number;
  body: unknown;
}

const VAULT_EVENTS: readonly VaultEventName[] = ["vault.encrypted", "vault.stored", "processor.requested", "processor.decrypting", "processor.decided", "vault.erased"];

export function isVaultEvent(frame: unknown): frame is VaultEvent {
  if (typeof frame !== "object" || frame === null) return false;
  const f = frame as { event?: unknown; principal?: unknown; handle?: unknown };
  return typeof f.event === "string" && (VAULT_EVENTS as readonly string[]).includes(f.event) && typeof f.principal === "string" && typeof f.handle === "string";
}

async function get(url: string, headers: Record<string, string> = {}): Promise<RawAnswer> {
  const res = await fetch(url, { headers });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text; // not JSON: the filter will refuse it
  }
  return { status: res.status, body };
}

/** QuickLoan's admin endpoint, as its staff would call it. */
export function readAdminView(companyPort: number, principal: string): Promise<RawAnswer> {
  return get(`http://localhost:${companyPort}/customers/1/credit-profile`, { "x-sammati-principal": principal });
}

/** The vault row a database administrator would see (the Processor's public, ciphertext-only read). */
export function readVaultRow(processorUrl: string, handle: string): Promise<RawAnswer> {
  return get(`${processorUrl}/v1/vault/${encodeURIComponent(handle)}`);
}
