import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { GUARDED_ENDPOINTS, LOAN_DECISION_ENDPOINT, SEED_FIDUCIARIES } from "@sammati/shared";
import { VaultHandles } from "../../companies/quickloan/src/vault-handles";

// Core's /v1/demo/fire finds each company's endpoint in GUARDED_ENDPOINTS. The company apps are written
// separately (lane C), so this test is the contract between them: it reads each app's source and
// insists that the path in the map is registered, guarded by the purpose the map says.
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

describe("the company backends serve what Core's simulator calls", () => {
  for (const company of SEED_FIDUCIARIES) {
    const source = readFileSync(resolve(repoRoot, `companies/${company.slug}/src/index.ts`), "utf8");

    for (const purpose of company.purposes) {
      it(`${company.name} guards ${purpose.code} at ${GUARDED_ENDPOINTS[purpose.code]?.path}`, () => {
        const endpoint = GUARDED_ENDPOINTS[purpose.code];
        expect(endpoint, `no entry for ${purpose.code} in GUARDED_ENDPOINTS`).toBeDefined();

        // the route registration: app.get("<path>", gate.requireConsent({ purpose: "<code>" ... }), ...)
        const registration = new RegExp(`app\\.(get|all)\\(\\s*"${escape(endpoint!.path)}"[^]*?requireConsent\\(\\{\\s*purpose:\\s*"${purpose.code}"`);
        expect(source, `${company.slug}/src/index.ts does not register ${endpoint!.path} behind requireConsent for ${purpose.code}`).toMatch(registration);
      });
    }
  }

  it("every purpose of every company has an endpoint, and none is listed twice", () => {
    const codes = SEED_FIDUCIARIES.flatMap((c) => c.purposes.map((p) => p.code));
    expect(Object.keys(GUARDED_ENDPOINTS).sort()).toEqual([...codes].sort());
    const paths = Object.values(GUARDED_ENDPOINTS).map((e) => e.path);
    // the same path may exist in two companies (/customers/:id/profile is FoodRush only today); within one company it must not repeat
    for (const company of SEED_FIDUCIARIES) {
      const own = company.purposes.map((p) => GUARDED_ENDPOINTS[p.code]!.path);
      expect(new Set(own).size, `${company.name} maps two purposes to one path`).toBe(own.length);
    }
    expect(paths.length).toBe(codes.length);
  });
});

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
}

describe("QuickLoan holds no customer data (V-05)", () => {
  const source = readFileSync(resolve(repoRoot, "companies/quickloan/src/index.ts"), "utf8");
  const HANDLE = "0x" + "ab".repeat(32);
  const HASH = "0x" + "cd".repeat(32);
  const ASHA = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

  it("serves the apply endpoint Core's simulator calls, and does not wrap it in requireConsent (the Processor decides and logs)", () => {
    expect(LOAN_DECISION_ENDPOINT).toEqual({ path: "/customers/:id/apply", method: "POST" });
    expect(source).toMatch(/app\.post\(\s*"\/customers\/:id\/apply",\s*async/);
  });

  it("has no PAN, income or score anywhere in its source", () => {
    expect(source).not.toMatch(/ABCDE1234F|incomeBand\s*:|\bpan\s*:|score\s*:\s*\d/);
  });

  it("keeps a handle per customer, replaces it on a new one and marks it erased", () => {
    const held = new VaultHandles();
    expect(held.view(ASHA)).toEqual({ handle: null, ciphertextHash: null, status: "none" });
    expect(held.apply({ event: "stored", handle: HANDLE, principal: ASHA, purposeCode: "credit_check", ciphertextHash: HASH })).toBe(true);
    expect(held.view(ASHA.toLowerCase())).toEqual({ handle: HANDLE, ciphertextHash: HASH, status: "stored" });

    const newer = "0x" + "ef".repeat(32);
    held.apply({ event: "stored", handle: newer, principal: ASHA, purposeCode: "credit_check", ciphertextHash: HASH });
    held.apply({ event: "erased", handle: HANDLE, principal: ASHA, purposeCode: "credit_check", ciphertextHash: HASH }); // the old copy: ignored
    expect(held.view(ASHA).status).toBe("stored");
    held.apply({ event: "erased", handle: newer, principal: ASHA, purposeCode: "credit_check", ciphertextHash: HASH });
    expect(held.view(ASHA)).toEqual({ handle: newer, ciphertextHash: HASH, status: "erased" }); // the handle stays: a later apply is refused by the Processor with the reason
  });

  it.each([
    ["an unknown event", { event: "leaked", handle: HANDLE, principal: ASHA, purposeCode: "credit_check", ciphertextHash: HASH }],
    ["another purpose", { event: "stored", handle: HANDLE, principal: ASHA, purposeCode: "marketing", ciphertextHash: HASH }],
    ["free text as a handle", { event: "stored", handle: "ABCDE1234F", principal: ASHA, purposeCode: "credit_check", ciphertextHash: HASH }],
    ["no principal", { event: "stored", handle: HANDLE, purposeCode: "credit_check", ciphertextHash: HASH }],
    ["not an object", "stored"],
  ])("ignores %s", (_name, body) => {
    const held = new VaultHandles();
    expect(held.apply(body)).toBe(false);
    expect(held.view(ASHA).status).toBe("none");
  });
});
