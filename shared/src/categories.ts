// The fixed registry of data category ids (prd.md §6.1a, trd.md §4.6). A purpose's `dataCategories` use only these
// ids; the wallet maps each id to one profile field, so it can tell what a consent needs. The Dart copy
// (wallet/lib/core/data_categories.dart) must match, and both pass shared/test-vectors/data-categories.json.
// The ids are part of the notice hash input (drd.md §4.2), so an existing id is never renamed.
import type { LocalizedText } from "./types";

export type CategoryGroup = "identity" | "contact" | "financial" | "health" | "prefs";

/** How a profile field is entered and checked (trd.md §4.6). */
export type FieldKind = "text" | "multiline" | "date" | "choice" | "mobile" | "email" | "pan" | "policy";

export interface DataCategory {
  id: string;
  group: CategoryGroup;
  /** The profile field this category maps to. Also the key in a sealed payload. */
  field: string;
  kind: FieldKind;
  /** Allowed values for `choice`: the English codes, never the translated labels. */
  choices?: readonly string[];
  /** Length bounds for the free-text kinds. */
  min?: number;
  max?: number;
  label: LocalizedText;
}

const L = (en: string, hi: string, kn: string): LocalizedText => ({ en, hi, kn });

export const CATEGORY_GROUPS: readonly { id: CategoryGroup; label: LocalizedText }[] = [
  { id: "identity", label: L("Who you are", "आप कौन हैं", "ನೀವು ಯಾರು") },
  { id: "contact", label: L("How to reach you", "आप तक कैसे पहुँचें", "ನಿಮ್ಮನ್ನು ಸಂಪರ್ಕಿಸುವ ವಿಧಾನ") },
  { id: "financial", label: L("Money", "पैसा", "ಹಣಕಾಸು") },
  { id: "health", label: L("Health", "स्वास्थ्य", "ಆರೋಗ್ಯ") },
  { id: "prefs", label: L("Your preferences", "आपकी पसंद", "ನಿಮ್ಮ ಆದ್ಯತೆಗಳು") },
];

/** Registry order. Do not reorder: it is the canonical order of a notice's categories. */
export const DATA_CATEGORIES: readonly DataCategory[] = [
  { id: "identity.name", group: "identity", field: "fullName", kind: "text", min: 2, max: 80, label: L("Full name", "पूरा नाम", "ಪೂರ್ಣ ಹೆಸರು") },
  { id: "identity.dob", group: "identity", field: "dob", kind: "date", label: L("Date of birth", "जन्म तिथि", "ಹುಟ್ಟಿದ ದಿನಾಂಕ") },
  {
    id: "identity.gender",
    group: "identity",
    field: "gender",
    kind: "choice",
    choices: ["female", "male", "other", "prefer_not_to_say"],
    label: L("Gender", "लिंग", "ಲಿಂಗ"),
  },
  { id: "contact.mobile", group: "contact", field: "mobile", kind: "mobile", label: L("Mobile number", "मोबाइल नंबर", "ಮೊಬೈಲ್ ಸಂಖ್ಯೆ") },
  { id: "contact.email", group: "contact", field: "email", kind: "email", label: L("Email", "ईमेल", "ಇಮೇಲ್") },
  { id: "contact.address", group: "contact", field: "address", kind: "multiline", min: 5, max: 200, label: L("Home address", "घर का पता", "ಮನೆಯ ವಿಳಾಸ") },
  { id: "financial.pan", group: "financial", field: "pan", kind: "pan", label: L("PAN", "पैन (PAN)", "ಪ್ಯಾನ್ (PAN)") },
  {
    id: "financial.income_band",
    group: "financial",
    field: "incomeBand",
    kind: "choice",
    choices: ["0-3 LPA", "3-6 LPA", "6-9 LPA", "9+ LPA"],
    label: L("Yearly income", "वार्षिक आय", "ವಾರ್ಷಿಕ ಆದಾಯ"),
  },
  {
    id: "financial.employment",
    group: "financial",
    field: "employment",
    kind: "choice",
    choices: ["salaried", "self-employed", "student", "unemployed"],
    label: L("Type of work", "काम का प्रकार", "ಕೆಲಸದ ಬಗೆ"),
  },
  { id: "financial.employer", group: "financial", field: "employer", kind: "text", min: 2, max: 80, label: L("Employer", "नियोक्ता", "ಉದ್ಯೋಗದಾತ") },
  {
    id: "health.blood_group",
    group: "health",
    field: "bloodGroup",
    kind: "choice",
    choices: ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"],
    label: L("Blood group", "रक्त समूह", "ರಕ್ತದ ಗುಂಪು"),
  },
  { id: "health.allergies", group: "health", field: "allergies", kind: "multiline", min: 2, max: 200, label: L("Allergies", "एलर्जी", "ಅಲರ್ಜಿಗಳು") },
  {
    id: "health.insurance_policy",
    group: "health",
    field: "insurancePolicy",
    kind: "policy",
    label: L("Health insurance policy number", "स्वास्थ्य बीमा पॉलिसी नंबर", "ಆರೋಗ್ಯ ವಿಮೆ ಪಾಲಿಸಿ ಸಂಖ್ಯೆ"),
  },
  {
    id: "prefs.food",
    group: "prefs",
    field: "foodPreference",
    kind: "choice",
    choices: ["vegetarian", "non_vegetarian", "vegan"],
    label: L("Food preference", "भोजन की पसंद", "ಆಹಾರದ ಆದ್ಯತೆ"),
  },
  {
    id: "prefs.delivery_address",
    group: "prefs",
    field: "deliveryAddress",
    kind: "multiline",
    min: 5,
    max: 200,
    label: L("Delivery address", "डिलीवरी का पता", "ಡೆಲಿವರಿ ವಿಳಾಸ"),
  },
];

const BY_ID = new Map(DATA_CATEGORIES.map((c, i) => [c.id, { category: c, index: i }]));
const BY_FIELD = new Map(DATA_CATEGORIES.map((c) => [c.field, c]));

/** A profile is a flat map of field name to string; any subset is valid. */
export type Profile = Record<string, string>;

export function isCategoryId(id: string): boolean {
  return BY_ID.has(id);
}

export function categoryById(id: string): DataCategory | undefined {
  return BY_ID.get(id)?.category;
}

/**
 * Drops duplicates and puts known ids in registry order, so a notice hashes the same however a company typed its
 * categories (drd.md §4.2). An id the registry does not know keeps its place after the known ones: callers that
 * must refuse it (applications) check `isCategoryId` first.
 */
export function normalizeCategories(ids: readonly string[]): string[] {
  const unique = [...new Set(ids)];
  const known = unique.filter(isCategoryId).sort((a, b) => BY_ID.get(a)!.index - BY_ID.get(b)!.index);
  return [...known, ...unique.filter((id) => !isCategoryId(id))];
}

/** The profile fields a set of categories needs, in registry order. Unknown ids need nothing the wallet can supply. */
export function fieldsFor(categories: readonly string[]): string[] {
  return normalizeCategories(categories).flatMap((id) => {
    const c = categoryById(id);
    return c ? [c.field] : [];
  });
}

/** What goes into a purpose's sealed envelope (trd.md §4.4 step 4): only that purpose's fields, only those present. */
export function profilePayload(profile: Profile, categories: readonly string[]): Record<string, string> {
  const payload: Record<string, string> = {};
  for (const field of fieldsFor(categories)) {
    const value = profile[field];
    if (typeof value === "string" && value !== "") payload[field] = value;
  }
  return payload;
}

/** The fields a consent needs that the profile lacks: the only ones the wallet may ask for (W-13). */
export function missingFields(profile: Profile, categories: readonly string[]): string[] {
  return fieldsFor(categories).filter((field) => {
    const value = profile[field];
    return typeof value !== "string" || value === "";
  });
}

const PAN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const MOBILE = /^[6-9][0-9]{9}$/;
const EMAIL = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;
const POLICY = /^[A-Za-z0-9-]{4,30}$/;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function isRealDate(value: string, today: string): boolean {
  const m = ISO_DATE.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return false;
  return value >= "1900-01-01" && value <= today;
}

/** True when `value` is acceptable for the profile field. `today` is `YYYY-MM-DD` (UTC), injectable for tests. */
export function isValidFieldValue(field: string, value: string, today: string = new Date().toISOString().slice(0, 10)): boolean {
  const c = BY_FIELD.get(field);
  if (!c || typeof value !== "string") return false;
  const length = [...value].length;
  switch (c.kind) {
    case "text":
    case "multiline":
      return length >= (c.min ?? 1) && length <= (c.max ?? 200) && value === value.trim();
    case "date":
      return isRealDate(value, today);
    case "choice":
      return c.choices!.includes(value);
    case "mobile":
      return MOBILE.test(value);
    case "email":
      return value.length <= 120 && EMAIL.test(value);
    case "pan":
      return PAN.test(value);
    case "policy":
      return POLICY.test(value);
  }
}
