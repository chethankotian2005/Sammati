import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CATEGORY_GROUPS,
  DATA_CATEGORIES,
  fieldsFor,
  isCategoryId,
  isValidFieldValue,
  missingFields,
  normalizeCategories,
  profilePayload,
  validateApplication,
} from "../src";

const vectors = JSON.parse(readFileSync(resolve(__dirname, "../test-vectors/data-categories.json"), "utf8"));

describe("data category registry", () => {
  it("has unique ids, unique fields, three-language labels and a known group each", () => {
    const groups = new Set(CATEGORY_GROUPS.map((g) => g.id));
    expect(new Set(DATA_CATEGORIES.map((c) => c.id)).size).toBe(DATA_CATEGORIES.length);
    expect(new Set(DATA_CATEGORIES.map((c) => c.field)).size).toBe(DATA_CATEGORIES.length);
    for (const c of DATA_CATEGORIES) {
      expect(groups.has(c.group), c.id).toBe(true);
      expect(c.id.startsWith(`${c.group}.`), c.id).toBe(true);
      for (const lang of ["en", "hi", "kn"] as const) expect(c.label[lang].length, `${c.id} ${lang}`).toBeGreaterThan(0);
    }
  });

  it("matches the committed vectors, so the Dart copy has something stable to pass", () => {
    expect(JSON.parse(JSON.stringify(DATA_CATEGORIES))).toEqual(vectors.categories);
    expect(JSON.parse(JSON.stringify(CATEGORY_GROUPS))).toEqual(vectors.groups);
  });

  it.each(vectors.validation.cases)("validates $field = $value as $valid", (...args: any[]) => {
    const obj = args[0];
    expect(isValidFieldValue(obj.field, obj.value, vectors.validation.today)).toBe(obj.valid);
  });

  it("refuses a field the registry does not have", () => {
    expect(isValidFieldValue("nickname", "Ash")).toBe(false);
  });

  it.each(vectors.normalize)("normalises $input", (...args: any[]) => {
    const obj = args[0];
    expect(normalizeCategories(obj.input)).toEqual(obj.output);
  });

  it.each(vectors.payload)("builds the sealed payload: $name", (...args: any[]) => {
    const obj = args[0];
    expect(profilePayload(obj.profile, obj.categories)).toEqual(obj.payload);
    expect(missingFields(obj.profile, obj.categories)).toEqual(obj.missing);
  });

  it("puts nothing in a payload that a purpose did not name", () => {
    const profile = { pan: "ABCDE1234F", fullName: "Asha Rao", mobile: "9876501234" };
    expect(Object.keys(profilePayload(profile, ["financial.pan"]))).toEqual(["pan"]);
    expect(profilePayload(profile, [])).toEqual({});
    expect(fieldsFor(["contact.mobile", "identity.name"])).toEqual(["fullName", "mobile"]);
  });

  it("knows its own ids and nothing else", () => {
    expect(isCategoryId("financial.pan")).toBe(true);
    expect(isCategoryId("phone")).toBe(false);
    expect(isCategoryId("general")).toBe(false);
  });
});

describe("applications and the registry", () => {
  const text = (v: string) => ({ en: v, hi: v, kn: v });
  const purpose = (dataCategories: unknown) => ({
    code: "loan_offers", title: text("Offers"), description: text("Send you offers"), dataCategories,
    retentionDays: 90, sharesThirdParty: false, required: false,
  });
  const app = (dataCategories: unknown) => ({ name: "Acme Bank", sector: "Banking", contactEmail: "a@acme.test", purposes: [purpose(dataCategories)], processors: [] });

  it("refuses a free-text category and names the field", () => {
    const r = validateApplication(app(["phone"]));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.field).toBe("purposes[0].dataCategories");
      expect(r.message).toMatch(/not a known data category/);
    }
  });

  it("refuses a non-string category", () => {
    expect(validateApplication(app([42])).ok).toBe(false);
  });

  it("stores categories once, in registry order", () => {
    const r = validateApplication(app(["contact.mobile", "identity.name", "contact.mobile"]));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.purposes[0]!.dataCategories).toEqual(["identity.name", "contact.mobile"]);
  });
});
