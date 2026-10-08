import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { GUARDED_ENDPOINTS, SEED_FIDUCIARIES } from "@sammati/shared";

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
