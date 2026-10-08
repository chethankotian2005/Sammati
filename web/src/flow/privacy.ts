/**
 * What the Data Flow Inspector will and will not show (ui.md §5.1, trd.md §6.9).
 *
 * Two independent guards, so that "the staff lane can only ever show ciphertext" and "no plaintext was visible" are
 * properties of code, not of the servers behaving:
 *  - `scanForPlaintext` / `PrivacyMonitor`: every frame of the session is searched for the known demo values and for
 *    field names only a profile has. The page's privacy line depends on it.
 *  - `filterStaffView`: an allow-list. Whatever the admin endpoint or the vault returns, only known fields of the
 *    right shape reach the screen, and a value that looks like the demo profile is replaced by a block marker.
 */

import { DEMO_PROFILE, REASON_CODES } from "@sammati/shared";

/** The demo values, as text. The Wallet lane shows them (it is the customer's own phone); nothing else may. */
export const PLAINTEXT_VALUES: readonly string[] = [DEMO_PROFILE.pan, DEMO_PROFILE.incomeBand];

/** Field names only a customer profile has: their mere presence in an event is a leak, whatever the value. */
export const PROFILE_FIELD_NAMES: readonly string[] = ["pan", "incomeBand", "score", "plaintext"];

export const BLOCKED_MARKER = "Blocked: looks like plaintext";

/** The path of the first plaintext value or profile field found anywhere in `value`, or null. */
export function scanForPlaintext(value: unknown, path = "$"): string | null {
  if (typeof value === "string") return PLAINTEXT_VALUES.some((v) => value.includes(v)) ? path : null;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const hit = scanForPlaintext(value[i], `${path}[${i}]`);
      if (hit) return hit;
    }
    return null;
  }
  if (typeof value === "object" && value !== null) {
    for (const [key, v] of Object.entries(value)) {
      if (PROFILE_FIELD_NAMES.includes(key)) return `${path}.${key}`;
      const hit = scanForPlaintext(v, `${path}.${key}`);
      if (hit) return hit;
    }
  }
  return null;
}

export interface PrivacyState {
  /** Frames checked so far this session. */
  checked: number;
  /** Where the first plaintext was found, or null while the session is clean. */
  violation: string | null;
}

export const cleanPrivacy: PrivacyState = { checked: 0, violation: null };

/** One more frame. A violation is sticky: it never clears itself. */
export function checkFrame(state: PrivacyState, frame: unknown): PrivacyState {
  return { checked: state.checked + 1, violation: state.violation ?? scanForPlaintext(frame) };
}

/** The privacy line may be shown only after a decision has been seen, so it is never an empty claim. */
export function privacyVerdict(state: PrivacyState, decisionsSeen: number): "unknown" | "clean" | "violated" {
  if (state.violation) return "violated";
  return decisionsSeen > 0 && state.checked > 0 ? "clean" : "unknown";
}

// --- the staff lane's filter ---

const HASH = /^0x[0-9a-f]{64}$/;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const HEX = /^0x(?:[0-9a-f]{2})*$/;
const CODE = /^[a-z][a-z0-9_]{0,63}$/;

const nullable = (ok: (v: unknown) => boolean) => (v: unknown) => v === null || ok(v);
const str = (re: RegExp) => (v: unknown) => typeof v === "string" && re.test(v);
const int = (v: unknown) => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;

const isEnvelope = (v: unknown): boolean => {
  if (typeof v !== "object" || v === null) return false;
  const e = v as Record<string, unknown>;
  return (
    Object.keys(e).sort().join(",") === "ciphertext,ephPub,nonce,tag,v" &&
    e.v === 1 &&
    str(/^0x[0-9a-f]{64}$/)(e.ephPub) &&
    str(/^0x[0-9a-f]{24}$/)(e.nonce) &&
    str(/^0x[0-9a-f]{32}$/)(e.tag) &&
    typeof e.ciphertext === "string" &&
    e.ciphertext.length <= 2 + 2 * 2048 &&
    HEX.test(e.ciphertext)
  );
};

/** The only fields the staff lane will display, and what a value of each must look like. */
const STAFF_FIELDS: Readonly<Record<string, (v: unknown) => boolean>> = {
  handle: nullable(str(HASH)),
  ciphertextHash: nullable(str(HASH)),
  status: str(/^(stored|erased|none)$/),
  principal: str(ADDRESS),
  fiduciary: str(ADDRESS),
  purposeCode: str(CODE),
  createdAt: int,
  erasedAt: nullable(int),
  envelope: nullable(isEnvelope),
  // a refusal (451) carries a reason code
  code: (v) => typeof v === "string" && (REASON_CODES as readonly string[]).includes(v),
};

export interface StaffView {
  /** The fields that passed, in the order they came. */
  fields: Array<{ name: string; value: unknown }>;
  /** How many fields were not on the list and were not shown. */
  hidden: number;
  /** Names of the fields whose value was blocked because it looked like plaintext or was malformed. */
  blocked: string[];
  /** Plaintext was found somewhere in the answer, even in a field that would have been hidden anyway. */
  leaked: boolean;
}

export function filterStaffView(answer: unknown): StaffView {
  const view: StaffView = { fields: [], hidden: 0, blocked: [], leaked: scanForPlaintext(answer) !== null };
  if (typeof answer !== "object" || answer === null || Array.isArray(answer)) return view;
  for (const [name, value] of Object.entries(answer)) {
    const valid = STAFF_FIELDS[name];
    if (!valid) {
      view.hidden++;
    } else if (scanForPlaintext(value, name) !== null || !valid(value)) {
      view.blocked.push(name);
    } else {
      view.fields.push({ name, value });
    }
  }
  return view;
}
