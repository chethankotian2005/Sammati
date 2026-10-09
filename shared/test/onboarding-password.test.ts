// A console login chosen on /join must survive validation: it was silently dropped once, so approved companies had no operator.
import { describe, expect, it } from "vitest";
import { validateApplication } from "../src/onboarding";

const text = (v: string) => ({ en: v, hi: v, kn: v });
const app = (extra: Record<string, unknown>) => ({
  name: "Acme Bank", sector: "Banking", contactEmail: "ops@acme.test",
  purposes: [{ code: "offers", title: text("Offers"), description: text("Send offers"), dataCategories: ["contact.email"], retentionDays: 90, sharesThirdParty: false, required: false }],
  processors: [], ...extra,
});

describe("the console password on an application", () => {
  it("is kept when given", () => {
    const r = validateApplication(app({ password: "long enough pw" }));
    expect(r.ok && r.value.password).toBe("long enough pw");
  });
  it("is absent when not given, and refused when too short", () => {
    const r = validateApplication(app({}));
    expect(r.ok && "password" in r.value).toBe(false);
    expect(validateApplication(app({ password: "short" })).ok).toBe(false);
  });
});
