// The loan rules (drd.md §4.5). Deterministic, no I/O, and the only code that ever looks at the decrypted profile.
// It returns a LoanDecision and the names of the fields it read, and nothing else derived from the plaintext: no
// field is echoed, and nothing here throws with a value in its message.
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
/** Yearly rate in basis points. */
const RATE_GOOD_BPS = 1100;
const RATE_FAIR_BPS = 1400;
const SELF_EMPLOYED_BPS = 100;
const PER_YEAR_BPS = 25;
const BASE_TENURE_MONTHS = 12;

/** What the customer asked for (trd.md §6.13). Omitted: no amount check, and the rate is for a 12 month loan. */
export interface Application {
  amount?: number;
  tenureMonths?: number;
}

/** The decision and the profile fields the rules actually read, in the order they were read. */
export interface Scored {
  decision: LoanDecision;
  used: string[];
}

export function decideLoan(profile: unknown, application: Application = {}): Scored {
  const p = typeof profile === "object" && profile !== null ? (profile as Record<string, unknown>) : {};
  const used = ["pan"];
  const declined = (code: string): Scored => ({ decision: { decision: "declined", limit: null, rateBps: null, reasonCodes: [code] }, used });

  if (typeof p.pan !== "string" || !PAN.test(p.pan)) return declined("PAN_INVALID");
  used.push("incomeBand");
  const base = typeof p.incomeBand === "string" && Object.hasOwn(BASE_LIMIT, p.incomeBand) ? BASE_LIMIT[p.incomeBand]! : undefined;
  if (base === undefined) return declined("INCOME_UNKNOWN");
  let selfEmployed = false;
  if (p.employment !== undefined) {
    used.push("employment");
    if (typeof p.employment !== "string" || !(EMPLOYMENT_STATUSES as readonly string[]).includes(p.employment)) return declined("EMPLOYMENT_UNKNOWN");
    if (INELIGIBLE.has(p.employment)) return declined("EMPLOYMENT_INELIGIBLE");
    selfEmployed = p.employment === "self-employed";
  }
  const assumed = p.score === undefined;
  const score = assumed ? ASSUMED_SCORE : typeof p.score === "number" && Number.isInteger(p.score) ? p.score : -1;
  if (score < 650) return declined("SCORE_LOW");

  const good = score >= 750;
  const limit = good ? base : Math.floor((base * 60) / 100);
  const tenure = application.tenureMonths ?? BASE_TENURE_MONTHS;
  const extraYears = Math.max(0, Math.floor((tenure - BASE_TENURE_MONTHS) / 12));
  const rateBps = (good ? RATE_GOOD_BPS : RATE_FAIR_BPS) + (selfEmployed ? SELF_EMPLOYED_BPS : 0) + extraYears * PER_YEAR_BPS;
  const reasonCodes = [good ? "SCORE_GOOD" : "SCORE_FAIR", ...(assumed ? ["SCORE_ASSUMED"] : [])];

  // Declined for size, not for the customer: the limit is still shown so they can ask for less.
  if (application.amount !== undefined && application.amount > limit) {
    return { decision: { decision: "declined", limit, rateBps: null, reasonCodes: [...reasonCodes, "AMOUNT_ABOVE_LIMIT"] }, used };
  }
  return { decision: { decision: "approved", limit, rateBps, reasonCodes }, used };
}
