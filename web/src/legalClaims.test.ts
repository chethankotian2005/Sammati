// L-02: the screens must not claim compliance, certification or a legal finding, and must not print a
// section number that nobody has checked. The rules are in docs/dpdp-mapping.md §6. This reads the web
// sources, so an overclaim that creeps back in fails here before anyone sees it on a screen.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(__dirname);

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

/** Comments may cite the spec ("trd.md §6.5"); only what a screen can show is checked. */
function withoutComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

const BANNED: Array<[string, RegExp]> = [
  ["a DPDP section number", /DPDP\s*§/],
  ["a section sign followed by a number in text", /["'`>]\s*(Section|Sec\.)?\s*§\s*\d/],
  ["'DPDP compliant'", /DPDP[- ]compliant/i],
  ["'compliant'", /\bcompliant\b/i],
  ["'certified'", /\bcertified\b/i],
  ["'Compliance Proof'", /Compliance Proof/i],
  ["'Integrity Certification'", /Integrity Certification/i],
  ["'Compliance Evidence'", /Compliance Evidence/i],
  ["'Compliance Scorecards'", /Compliance Scorecards/],
  ["the word VIOLATION as a label", /\bVIOLATION\b/],
  ["'Violations' as a label", /["'`>]\s*Violations?\s*[<"'`:]/],
  ["'regulatory package'", /regulatory package/i],
];

describe("legal claims on the web screens (L-02)", () => {
  const files = sources(SRC);

  it("finds the screens to check", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  for (const [label, pattern] of BANNED) {
    it(`no screen says ${label}`, () => {
      const hits = files
        .filter((f) => pattern.test(withoutComments(readFileSync(f, "utf8"))))
        .map((f) => relative(SRC, f));
      expect(hits, `${label} appears in: ${hits.join(", ")}`).toEqual([]);
    });
  }
});

describe("the Auditor report states its scope (L-02)", () => {
  const report = readFileSync(join(SRC, "pages", "auditor", "ReportModal.tsx"), "utf8");

  it("says it is evidence, not a legal finding", () => {
    expect(report).toContain("Scope and limits");
    expect(report).toContain("not a legal finding");
    expect(report).toContain("docs/dpdp-mapping.md");
  });

  it("is titled as evidence, with a log integrity check rather than a certification", () => {
    expect(report).toContain("Consent and access evidence report");
    expect(report).toContain("Log integrity check");
  });
});
