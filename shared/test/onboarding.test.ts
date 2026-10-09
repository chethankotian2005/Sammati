import { describe, expect, it } from "vitest";
import { slugOf, validateApplication, type ApplicationInput } from "../src/onboarding";

const text = (en: string) => ({ en, hi: `${en} (hi)`, kn: `${en} (kn)` });
const valid = (): ApplicationInput => ({
  name: "DemoBank",
  sector: "Banking",
  contactEmail: "ops@demobank.example",
  purposes: [{ code: "loan_offers", title: text("Loan offers"), description: text("Send you loan offers"), dataCategories: ["contact.mobile"], retentionDays: 90, sharesThirdParty: false, required: false }],
  processors: [{ name: "BureauOne", purposeCode: "loan_offers" }],
});

describe("slugOf", () => {
  it.each([
    ["DemoBank", "demobank"],
    ["MediCare+", "medicare"],
    ["Quick Loan & Co.", "quick-loan-co"],
    ["  --Odd--  ", "odd"],
    ["A".repeat(60), "a".repeat(30)],
  ])("%j -> %j", (name, slug) => expect(slugOf(name)).toBe(slug));
});

describe("validateApplication", () => {
  it("accepts a good application and trims it", () => {
    const r = validateApplication({ ...valid(), name: "  DemoBank  " });
    expect(r.ok && r.value.name).toBe("DemoBank");
  });

  it("treats a missing processors list as none", () => {
    const { processors: _unused, ...rest } = valid();
    const r = validateApplication(rest);
    expect(r.ok && r.value.processors).toEqual([]);
  });

  it.each<[string, (a: ApplicationInput) => unknown, string]>([
    ["not an object", () => "x", "body"],
    ["a name that is only punctuation", (a) => ({ ...a, name: "+++" }), "name"],
    ["a name with a control character", (a) => ({ ...a, name: "Demo\u0007Bank" }), "name"],
    ["an email without a domain", (a) => ({ ...a, contactEmail: "ops@demobank" }), "contactEmail"],
    ["more than 8 purposes", (a) => ({ ...a, purposes: Array.from({ length: 9 }, (_, i) => ({ ...a.purposes[0]!, code: `purpose_${i}` })) }), "purposes"],
    ["a code with a capital", (a) => ({ ...a, purposes: [{ ...a.purposes[0]!, code: "Loan" }] }), "purposes[0].code"],
    ["a code that is too short", (a) => ({ ...a, purposes: [{ ...a.purposes[0]!, code: "ab" }] }), "purposes[0].code"],
    ["no Hindi description", (a) => ({ ...a, purposes: [{ ...a.purposes[0]!, description: { ...a.purposes[0]!.description, hi: "" } }] }), "purposes[0].description.hi"],
    ["a title that is not an object", (a) => ({ ...a, purposes: [{ ...a.purposes[0]!, title: "Loan offers" }] }), "purposes[0].title.en"],
    ["no data categories", (a) => ({ ...a, purposes: [{ ...a.purposes[0]!, dataCategories: [] }] }), "purposes[0].dataCategories"],
    ["fractional retention", (a) => ({ ...a, purposes: [{ ...a.purposes[0]!, retentionDays: 1.5 }] }), "purposes[0].retentionDays"],
    ["NaN retention (an empty field)", (a) => ({ ...a, purposes: [{ ...a.purposes[0]!, retentionDays: Number.NaN }] }), "purposes[0].retentionDays"],
    ["a sharing flag that is text", (a) => ({ ...a, purposes: [{ ...a.purposes[0]!, sharesThirdParty: "no" }] }), "purposes[0].sharesThirdParty"],
    ["a processor for an undeclared purpose", (a) => ({ ...a, processors: [{ name: "Ghost", purposeCode: "nope" }] }), "processors[0].purposeCode"],
    ["seven processors", (a) => ({ ...a, processors: Array.from({ length: 7 }, (_, i) => ({ name: `Proc${i}`, purposeCode: "loan_offers" })) }), "processors"],
  ])("refuses %s and names %s", (_label, make, field) => {
    const r = validateApplication(make(valid()));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.field).toBe(field);
  });
});
