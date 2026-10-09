/**
 * VaultPanel — confidential processing (prd.md V-06, ui.md §3 "Live requests, QuickLoan only").
 *
 * "What QuickLoan holds": a handle, a ciphertext hash and a status, nothing else, and the timeline of the
 * vault.* / processor.* events (handles, hashes and codes: they never carry data, trd.md §6.5).
 * Nothing on this panel can show a PAN or an income, because nothing it receives contains one.
 */

import { useState, type ReactNode } from "react";
import type { VaultEvent, VaultEventName } from "@sammati/shared";
import { HashLabel } from "./HashLabel";
import { StatusChip } from "./StatusChip";
import { useVaultEvents } from "../ws";

/** The steps of one trip through the Processor, in the order ui.md shows them. */
export const VAULT_STEPS: ReadonlyArray<{ event: VaultEventName; label: string }> = [
  { event: "vault.encrypted", label: "Encrypted" },
  { event: "vault.stored", label: "Stored" },
  { event: "processor.requested", label: "Requested" },
  { event: "processor.decrypting", label: "Decrypting" },
  { event: "processor.decided", label: "Decided" },
  { event: "vault.erased", label: "Erased" },
];

export interface HeldView {
  handle: string | null;
  ciphertextHash: string | null;
  status: "stored" | "erased" | "none";
}

/** What the company's backend holds, as its webhook would have told it: the newest stored handle, erased or not. */
export function heldFromEvents(events: readonly VaultEvent[]): HeldView {
  let held: HeldView = { handle: null, ciphertextHash: null, status: "none" };
  for (const e of events) {
    if (e.event === "vault.stored") held = { handle: e.handle, ciphertextHash: e.ciphertextHash, status: "stored" };
    else if (e.event === "vault.erased" && e.cause !== "superseded" && e.handle === held.handle) held = { ...held, status: "erased" };
  }
  return held;
}

/** The one-line outcome shown on the "Decided" chip. */
export function decidedText(e: Extract<VaultEvent, { event: "processor.decided" }>): string {
  if (e.decision === "approved") return `Approved · limit ${formatInr(e.limit)} · ${e.reasonCodes.join(", ")}`;
  if (e.decision === "declined") return `Declined · ${e.reasonCodes.join(", ")}`;
  if (e.decision === "blocked") return `451 · ${e.reasonCodes[0] ?? "blocked"}`;
  return `Error · ${e.reasonCodes[0] ?? "error"}`;
}

export function formatInr(amount: number | null): string {
  return amount === null ? "none" : amount.toLocaleString("en-IN");
}

const time = (seconds: number): string => new Date(seconds * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

/** Collects the vault and processor events of one company, newest last, capped. */
export function useVaultTimeline(fiduciary: string): VaultEvent[] {
  const [events, setEvents] = useState<VaultEvent[]>([]);
  useVaultEvents((e) => {
    if (e.fiduciary.toLowerCase() !== fiduciary.toLowerCase()) return;
    setEvents((prev) => [...prev, e].slice(-60));
  });
  return events;
}

interface VaultTimelineProps {
  events: readonly VaultEvent[];
  compact?: boolean;
}

/**
 * The newest event of each step. A new submission starts the timeline over; a new request clears the steps that
 * belong to the previous one, so an old "Decrypting" is never shown next to a new refusal.
 */
export function foldTimeline(events: readonly VaultEvent[]): Map<VaultEventName, VaultEvent> {
  const seen = new Map<VaultEventName, VaultEvent>();
  for (const e of events) {
    if (e.event === "vault.encrypted") seen.clear();
    if (e.event === "processor.requested") for (const step of ["processor.requested", "processor.decrypting", "processor.decided"] as const) seen.delete(step);
    seen.set(e.event, e);
  }
  return seen;
}

export function VaultTimeline({ events, compact = false }: VaultTimelineProps): ReactNode {
  const seen = foldTimeline(events);
  const text = compact ? "text-[11px]" : "text-xs";

  return (
    <ol aria-label="Confidential processing timeline" className="space-y-1.5">
      {VAULT_STEPS.map((step) => {
        const e = seen.get(step.event);
        const bad = e?.event === "processor.decided" && (e.decision === "blocked" || e.decision === "error" || e.decision === "declined");
        return (
          <li key={step.event} className={`flex items-center justify-between gap-2 ${text}`}>
            <span className="flex items-center gap-2">
              {e ? (
                <StatusChip variant={step.event === "vault.erased" || bad ? "blocked" : "allowed"} label={step.label} size="sm" />
              ) : (
                <StatusChip variant="pending" label={step.label} size="sm" />
              )}
              {e?.event === "processor.decided" ? <span className="font-mono text-mute">{decidedText(e)}</span> : null}
              {e?.event === "vault.erased" ? <span className="text-mute">({e.cause})</span> : null}
            </span>
            <span className="font-mono text-mute">{e ? time(e.at) : "—"}</span>
          </li>
        );
      })}
    </ol>
  );
}

interface VaultPanelProps {
  company: string;
  events: readonly VaultEvent[];
}

export function VaultPanel({ company, events }: VaultPanelProps): ReactNode {
  const held = heldFromEvents(events);
  return (
    <div className="rounded-pass border border-line bg-surface p-6 shadow-sm space-y-4" data-testid="vault-panel">
      <div className="flex items-center justify-between border-b border-line pb-3">
        <h3 className="font-extrabold text-ink">What {company} holds</h3>
        <span className="rounded-pill bg-marigold/15 px-2.5 py-1 text-xs font-extrabold text-ink" title="The Processor is a separate service with an in-memory key: not real hardware protection.">
          Simulated enclave
        </span>
      </div>

      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        <dt className="text-mute">Handle</dt>
        <dd>{held.handle ? <HashLabel value={held.handle} /> : <span className="text-mute">none yet</span>}</dd>
        <dt className="text-mute">Ciphertext hash</dt>
        <dd>{held.ciphertextHash ? <HashLabel value={held.ciphertextHash} /> : <span className="text-mute">none yet</span>}</dd>
        <dt className="text-mute">Status</dt>
        <dd className="font-bold text-ink">{held.status}</dd>
      </dl>
      <p className="text-xs text-mute">{company} staff cannot read this. Only the Sammati Processor can open it.</p>

      <div className="border-t border-line pt-3">
        <VaultTimeline events={events} />
      </div>
    </div>
  );
}
