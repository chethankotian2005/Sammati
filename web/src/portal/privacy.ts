/**
 * The portal's guard (trd.md §6.10): every frame it receives is searched for field names only a customer profile has
 * and for values that look like one. A hit stops the journey instead of reaching the screen. It is a second line:
 * the Processor and Core are built never to send such a thing, and `pnpm e2e` searches the whole run for it.
 */

/** Field names only a customer profile has: their mere presence in an event is a leak, whatever the value. */
export const PROFILE_FIELD_NAMES: readonly string[] = ["pan", "incomeBand", "employment", "score", "plaintext"];

/** A PAN-shaped or income-band-shaped string anywhere in a value. */
const PROFILE_VALUE = /\b[A-Z]{5}[0-9]{4}[A-Z]\b|\b\d{1,2}[-+]\d{0,2} ?LPA\b/;

/** The path of the first profile field or value found anywhere in `value`, or null. */
export function scanForPlaintext(value: unknown, path = "$"): string | null {
  if (typeof value === "string") return PROFILE_VALUE.test(value) ? path : null;
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
