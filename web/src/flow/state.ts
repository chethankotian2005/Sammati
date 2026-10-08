/**
 * The Data Flow Inspector's lane state (trd.md §6.9), as a pure reducer over the vault and processor events.
 * Nothing here reads a profile: the Processor lane takes only processor.decrypting and processor.decided, the transit
 * lane takes hashes and sizes, and the timeline takes the events' own timestamps.
 */

import type { ProcessorOutcome, VaultEvent } from "@sammati/shared";

export type ProcessorPhase = "waiting" | "decrypting" | "scoring" | "decision";

export type StepKey = "encrypted" | "stored" | "requested" | "decrypting" | "decided" | "erased";

export const STEPS: ReadonlyArray<{ key: StepKey; label: string }> = [
  { key: "encrypted", label: "Encrypted" },
  { key: "stored", label: "Stored" },
  { key: "requested", label: "Requested" },
  { key: "decrypting", label: "Decrypting" },
  { key: "decided", label: "Decided" },
  { key: "erased", label: "Erased" },
];

export interface DecisionView {
  outcome: ProcessorOutcome;
  limit: number | null;
  reasonCodes: string[];
  entryId: string;
}

export interface FlowState {
  /** The customer being followed: the one of the first vault event seen, replaced by each new submission. */
  principal: string | null;
  handle: string | null;
  wallet: "idle" | "encrypting" | "sent";
  transit: {
    ciphertextHash: string | null;
    sizeBytes: number | null;
    /** True once the Processor has erased the ciphertext. */
    erased: boolean;
    eraseCause: string | null;
  };
  processor: { phase: ProcessorPhase; decision: DecisionView | null };
  /** When each step happened, in milliseconds, from the events' own fields. */
  steps: Partial<Record<StepKey, number>>;
  /** Decisions seen this session, for the privacy line. */
  decisionsSeen: number;
  /** Start of the current request, to place the decision (requestedAt + durationMs). */
  requestedAtMs: number | null;
}

export const initialFlow: FlowState = {
  principal: null,
  handle: null,
  wallet: "idle",
  transit: { ciphertextHash: null, sizeBytes: null, erased: false, eraseCause: null },
  processor: { phase: "waiting", decision: null },
  steps: {},
  decisionsSeen: 0,
  requestedAtMs: null,
};

/** The presentation layer's own step: the gap between decrypting and the decision. Not an event. */
export interface ScoringTick {
  type: "scoring";
}

export type FlowAction = VaultEvent | ScoringTick;

const isTick = (a: FlowAction): a is ScoringTick => "type" in a && a.type === "scoring";

export function reduceFlow(state: FlowState, action: FlowAction): FlowState {
  if (isTick(action)) {
    return state.processor.phase === "decrypting" ? { ...state, processor: { ...state.processor, phase: "scoring" } } : state;
  }
  const e = action;
  // One customer at a time: a new submission switches to its owner, anyone else's later events are not ours.
  if (e.event === "vault.encrypted") {
    return {
      ...initialFlow,
      decisionsSeen: state.decisionsSeen,
      principal: e.principal,
      handle: e.handle,
      wallet: "encrypting",
      transit: { ciphertextHash: e.ciphertextHash, sizeBytes: e.sizeBytes, erased: false, eraseCause: null },
      steps: { encrypted: e.atMs },
    };
  }
  if (state.principal !== null && state.principal.toLowerCase() !== e.principal.toLowerCase()) return state;
  const base = state.principal === null ? { ...state, principal: e.principal, handle: e.handle } : state;

  switch (e.event) {
    case "vault.stored":
      return {
        ...base,
        handle: e.handle,
        wallet: "sent",
        transit: { ...base.transit, ciphertextHash: e.ciphertextHash, sizeBytes: e.sizeBytes },
        steps: { ...base.steps, stored: e.atMs },
      };
    case "processor.requested":
      return { ...base, requestedAtMs: e.requestedAt, steps: { ...stripRound(base.steps), requested: e.requestedAt } };
    case "processor.decrypting":
      return {
        ...base,
        processor: { phase: "decrypting", decision: null },
        steps: { ...base.steps, decrypting: e.decryptingAt },
      };
    case "processor.decided":
      return {
        ...base,
        processor: { phase: "decision", decision: { outcome: e.decision, limit: e.limit, reasonCodes: e.reasonCodes, entryId: e.entryId } },
        decisionsSeen: base.decisionsSeen + 1,
        steps: { ...base.steps, decided: (base.requestedAtMs ?? e.atMs) + e.durationMs },
      };
    case "vault.erased":
      // A copy replaced by a newer one is not an erasure the audience should see.
      if (e.cause === "superseded") return base;
      return {
        ...base,
        transit: { ...base.transit, erased: true, eraseCause: e.cause },
        steps: { ...base.steps, erased: e.atMs },
      };
  }
}

/** A new request starts a new round: the previous round's Processor steps are not this one's. */
function stripRound(steps: FlowState["steps"]): FlowState["steps"] {
  const { requested: _r, decrypting: _d, decided: _x, ...rest } = steps;
  return rest;
}

export interface TimelineRow {
  key: StepKey;
  label: string;
  /** Milliseconds since the epoch, or null if the step has not happened. */
  atMs: number | null;
  /** Milliseconds since the previous step that happened, or null for the first. */
  gapMs: number | null;
}

export function timeline(state: FlowState): TimelineRow[] {
  let previous: number | null = null;
  return STEPS.map(({ key, label }) => {
    const atMs = state.steps[key] ?? null;
    const gapMs = atMs !== null && previous !== null ? Math.max(0, atMs - previous) : null;
    if (atMs !== null) previous = atMs;
    return { key, label, atMs, gapMs };
  });
}

/** Masks by shape only: the page never knows the values, so it cannot leak them. */
export const MASKED_FIELDS: ReadonlyArray<{ label: string; mask: string }> = [
  { label: "PAN", mask: "••••• •••• •" },
  { label: "Income", mask: "•••••" },
  { label: "Score", mask: "•••" },
];
