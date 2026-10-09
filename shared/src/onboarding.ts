// Company onboarding (prd.md R-01 to R-04, trd.md §6.2a and §6.12). The validation lives here so the /join page
// and Core refuse exactly the same inputs.
import { isCategoryId, normalizeCategories } from "./categories";
import type { Hex, LocalizedText, UnixSeconds } from "./types";

export const API_KEY_HEADER = "x-sammati-api-key";
export const REGULATOR_KEY_HEADER = "x-sammati-regulator-key";
/** `ink` (ui.md §1.1): the identity colour of every company that joined through R-01, so no new colour exists. */
export const DEFAULT_COMPANY_COLOR = "#16173F";

export type ApplicationStatus = "pending" | "approved" | "rejected";

export interface ApplicationPurposeInput {
  code: string;
  title: LocalizedText;
  description: LocalizedText;
  dataCategories: string[];
  retentionDays: number;
  sharesThirdParty: boolean;
  required: boolean;
}

export interface ApplicationProcessorInput {
  name: string;
  purposeCode: string;
}

export interface ApplicationInput {
  name: string;
  sector: string;
  contactEmail: string;
  password?: string;
  purposes: ApplicationPurposeInput[];
  processors: ApplicationProcessorInput[];
}

/** A company in the directory (`GET /v1/fiduciaries`). */
export interface FiduciaryInfo {
  address: Hex;
  slug: string;
  name: string;
  sector: string;
  color: string;
  sandbox: boolean;
}
export interface FiduciariesResponse {
  fiduciaries: FiduciaryInfo[];
}

/** The downstream processors a company declared, with the purpose each is used for (`GET /v1/fiduciaries/:fid/processors`). */
export interface FiduciaryProcessorsResponse {
  fiduciary: Hex;
  processors: Array<{ name: string; address: Hex; purposeCode: string }>;
}

export interface RegistrationCreated {
  applicationId: string;
  status: "pending";
}

export interface RegistrationResult {
  fiduciary: Hex;
  slug: string;
  sandbox: boolean;
  /** The API key, the first time it is read; null afterwards. */
  apiKey: string | null;
  apiKeyShown: boolean;
}

export interface RegistrationStatusResponse {
  applicationId: string;
  name: string;
  sector: string;
  status: ApplicationStatus;
  note: string | null;
  createdAt: UnixSeconds;
  decidedAt: UnixSeconds | null;
  result: RegistrationResult | null;
}

/** What the regulator sees; the contact email is null once a decision has been made. */
export interface ApplicationView {
  id: string;
  name: string;
  slug: string;
  sector: string;
  contactEmail: string | null;
  purposes: ApplicationPurposeInput[];
  processors: ApplicationProcessorInput[];
  status: ApplicationStatus;
  note: string | null;
  fiduciary: Hex | null;
  sandbox: boolean | null;
  createdAt: UnixSeconds;
  decidedAt: UnixSeconds | null;
}
export interface RegistrationsListResponse {
  applications: ApplicationView[];
}
export interface ApproveBody {
  note?: string;
  sandbox?: boolean;
}
export interface ApproveResponse {
  application: ApplicationView;
  fiduciary: { address: Hex; slug: string };
  txHashes: Hex[];
}
export interface RejectBody {
  note: string;
}
export interface RejectResponse {
  application: ApplicationView;
}
export interface SandboxBody {
  sandbox: boolean;
}
export interface SandboxResponse {
  fiduciary: Hex;
  sandbox: boolean;
}
export interface TestPrincipal {
  principal: Hex;
  handle: string | null;
  addedAt: UnixSeconds;
}
export interface TestPrincipalsResponse {
  principals: TestPrincipal[];
}
export interface WhoAmIResponse {
  fiduciary: Hex;
  slug: string;
  name: string;
  sandbox: boolean;
}

// --- events (trd.md §6.12) ---

export interface FiduciaryRegisteredEvent {
  event: "fiduciary.registered";
  fiduciary: Hex;
  slug: string;
  name: string;
  sandbox: boolean;
  at: UnixSeconds;
}
export interface FiduciaryUpdatedEvent {
  event: "fiduciary.updated";
  fiduciary: Hex;
  slug: string;
  sandbox: boolean;
  at: UnixSeconds;
}

// --- validation ---

/** `DemoBank` -> `demobank`, `Quick Loan & Co.` -> `quick-loan-co`. */
export function slugOf(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30)
    .replace(/-+$/g, "");
}

const CODE = /^[a-z][a-z0-9_]{2,31}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/;
const LANGS = ["en", "hi", "kn"] as const;
export const APPLICATION_LIMITS = { purposes: 8, processors: 6, categories: 8 } as const;

export type ApplicationCheck = { ok: true; value: ApplicationInput } | { ok: false; field: string; message: string };

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function text(v: unknown, field: string, min: number, max: number): string | { error: string } {
  if (typeof v !== "string") return { error: `${field} must be text` };
  const t = v.trim();
  if (CONTROL.test(t)) return { error: `${field} must be plain text` };
  if (t.length < min || t.length > max) return { error: min === 1 ? `${field} is required (at most ${max} characters)` : `${field} must be ${min} to ${max} characters` };
  return t;
}

/** Checks an application and returns it trimmed, or names the first field that is wrong. */
export function validateApplication(raw: unknown): ApplicationCheck {
  const bad = (field: string, message: string): ApplicationCheck => ({ ok: false, field, message });
  if (!isObject(raw)) return bad("body", "The application must be a JSON object");

  const name = text(raw.name, "Company name", 2, 60);
  if (typeof name !== "string") return bad("name", name.error);
  if (slugOf(name).length < 2) return bad("name", "Company name needs at least two letters or digits");
  const sector = text(raw.sector, "Sector", 2, 40);
  if (typeof sector !== "string") return bad("sector", sector.error);
  const contactEmail = text(raw.contactEmail, "Contact email", 3, 120);
  if (typeof contactEmail !== "string") return bad("contactEmail", contactEmail.error);
  if (!EMAIL.test(contactEmail)) return bad("contactEmail", "Contact email does not look like an email address");
  const password = typeof raw.password === "string" ? raw.password : undefined;
  if (password !== undefined && password.length < 8) return bad("password", "Password must be at least 8 characters");

  if (!Array.isArray(raw.purposes) || raw.purposes.length < 1 || raw.purposes.length > APPLICATION_LIMITS.purposes) {
    return bad("purposes", `Add 1 to ${APPLICATION_LIMITS.purposes} purposes`);
  }
  const purposes: ApplicationPurposeInput[] = [];
  for (const [i, p] of raw.purposes.entries()) {
    const at = `purposes[${i}]`;
    if (!isObject(p)) return bad(at, "Each purpose must be an object");
    if (typeof p.code !== "string" || !CODE.test(p.code.trim())) {
      return bad(`${at}.code`, "Code is lower case letters, digits and underscores, 3 to 32 characters, starting with a letter");
    }
    const code = p.code.trim();
    if (purposes.some((x) => x.code === code)) return bad(`${at}.code`, `Code "${code}" is used twice`);
    const title = {} as LocalizedText;
    const description = {} as LocalizedText;
    for (const lang of LANGS) {
      const t = isObject(p.title) ? text(p.title[lang], `Title (${lang})`, 1, 60) : { error: "Title is required in English, Hindi and Kannada" };
      if (typeof t !== "string") return bad(`${at}.title.${lang}`, t.error);
      title[lang] = t;
      const d = isObject(p.description)
        ? text(p.description[lang], `Description (${lang})`, 1, 200)
        : { error: "Description is required in English, Hindi and Kannada" };
      if (typeof d !== "string") return bad(`${at}.description.${lang}`, d.error);
      description[lang] = d;
    }
    if (!Array.isArray(p.dataCategories) || p.dataCategories.length < 1 || p.dataCategories.length > APPLICATION_LIMITS.categories) {
      return bad(`${at}.dataCategories`, `List 1 to ${APPLICATION_LIMITS.categories} data categories`);
    }
    const dataCategories: string[] = [];
    for (const c of p.dataCategories) {
      if (typeof c !== "string" || !isCategoryId(c)) {
        return bad(`${at}.dataCategories`, `"${String(c).slice(0, 30)}" is not a known data category. Pick from the list`);
      }
      dataCategories.push(c);
    }
    if (typeof p.retentionDays !== "number" || !Number.isInteger(p.retentionDays) || p.retentionDays < 1 || p.retentionDays > 3650) {
      return bad(`${at}.retentionDays`, "Retention is a whole number of days from 1 to 3650");
    }
    if (typeof p.sharesThirdParty !== "boolean") return bad(`${at}.sharesThirdParty`, "Say whether the data is shared with third parties");
    if (typeof p.required !== "boolean") return bad(`${at}.required`, "Say whether the purpose is needed for the service");
    purposes.push({ code, title, description, dataCategories: normalizeCategories(dataCategories), retentionDays: p.retentionDays, sharesThirdParty: p.sharesThirdParty, required: p.required });
  }

  const rawProcessors = raw.processors ?? [];
  if (!Array.isArray(rawProcessors) || rawProcessors.length > APPLICATION_LIMITS.processors) {
    return bad("processors", `At most ${APPLICATION_LIMITS.processors} processors`);
  }
  const processors: ApplicationProcessorInput[] = [];
  for (const [i, p] of rawProcessors.entries()) {
    const at = `processors[${i}]`;
    if (!isObject(p)) return bad(at, "Each processor must be an object");
    const pname = text(p.name, "Processor name", 2, 40);
    if (typeof pname !== "string") return bad(`${at}.name`, pname.error);
    if (typeof p.purposeCode !== "string" || !purposes.some((x) => x.code === p.purposeCode)) {
      return bad(`${at}.purposeCode`, "A processor must be used for one of your purposes");
    }
    processors.push({ name: pname, purposeCode: p.purposeCode });
  }
  return { ok: true, value: { name, sector, contactEmail, ...(password === undefined ? {} : { password }), purposes, processors } };
}
