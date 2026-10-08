// The loan rules (trd.md §6.7). Deterministic, no I/O, and the only code that ever looks at the decrypted profile.
// It returns a LoanDecision and nothing derived from the plaintext beyond that: no field is echoed, and nothing
// here throws with a value in its message.
import { EMPLOYMENT_STATUSES, type LoanDecision } from "@sammati/shared";

const PAN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
/** Base limit in INR by income band. */
const BASE_LIMIT: Readonly<Record<string, number>> = {
  "0-3 LPA": 100_000,
  "3-6 LPA": 250_000,
  "6-9 LPA": 500_000,
  "9+ LPA": 1_000_000,
};

/** Employment statuses that are not lent to. */
const INELIGIBLE = new Set(["student", "unemployed"]);
/** Used when the wallet had no credit score to give (manual entry): said out loud in the answer, never silent. */
const ASSUMED_SCORE = 700;

export function decideLoan(profile: unknown): LoanDecision {
  const p = typeof profile === "object" && profile !== null ? (profile as Record<string, unknown>) : {};
  if (typeof p.pan !== "string" || !PAN.test(p.pan)) return declined("PAN_INVALID");
  const base = typeof p.incomeBand === "string" && Object.hasOwn(BASE_LIMIT, p.incomeBand) ? BASE_LIMIT[p.incomeBand]! : undefined;
  if (base === undefined) return declined("INCOME_UNKNOWN");
  if (p.employment !== undefined) {
    if (typeof p.employment !== "string" || !(EMPLOYMENT_STATUSES as readonly string[]).includes(p.employment)) return declined("EMPLOYMENT_UNKNOWN");
    if (INELIGIBLE.has(p.employment)) return declined("EMPLOYMENT_INELIGIBLE");
  }
  const assumed = p.score === undefined;
  const score = assumed ? ASSUMED_SCORE : typeof p.score === "number" && Number.isInteger(p.score) ? p.score : -1;
  if (score < 650) return declined("SCORE_LOW");
  const note = assumed ? ["SCORE_ASSUMED"] : [];
  return score >= 750
    ? { decision: "approved", limit: base, reasonCodes: ["SCORE_GOOD", ...note] }
    : { decision: "approved", limit: Math.floor((base * 60) / 100), reasonCodes: ["SCORE_FAIR", ...note] };
}

const declined = (code: string): LoanDecision => ({ decision: "declined", limit: null, reasonCodes: [code] });
