import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// The commands people type are part of the interface (README, docs/demo.md): pin what they mean.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const scripts = (JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")) as { scripts: Record<string, string> }).scripts;
const demoUp = readFileSync(resolve(root, "scripts/demo-up.mjs"), "utf8");

describe("pnpm demo:up", () => {
  it("is real mode by default; only demo:up:stub asks for the stub", () => {
    expect(scripts["demo:up"]).toBe("node scripts/demo-up.mjs");
    expect(scripts["demo:up:real"]).toBe(scripts["demo:up"]); // kept as an alias
    expect(scripts["demo:up:stub"]).toBe("node scripts/demo-up.mjs --stub");
    // ...and the launcher turns that into Core's STUB_MODE the right way round
    expect(demoUp).toContain('const real = !process.argv.includes("--stub");');
    expect(demoUp).toContain('STUB_MODE: real ? "false" : "true"');
  });

  it("starts the Processor and tells Core where the wallet will find it (V-06)", () => {
    expect(demoUp).toContain('name: "processor"');
    expect(demoUp).toContain("PROCESSOR_PUBLIC_URL: processorUrl");
    expect(demoUp.indexOf("processor.sqlite")).toBeGreaterThan(-1);
  });

  it("gives Core the QR address it printed, and clears the previous run's database first", () => {
    expect(demoUp).toContain("CORE_PUBLIC_URL: qr.url");
    expect(demoUp).toContain("console.log(qr.banner)");
    expect(demoUp.indexOf("rmSync(")).toBeLessThan(demoUp.indexOf("concurrently("));
  });
});

describe("pnpm demo:reset", () => {
  it("empties the Processor's vault too", () => {
    const reset = readFileSync(resolve(root, "scripts/demo-reset.mjs"), "utf8");
    expect(reset).toContain("await resetProcessor()");
    expect(reset.indexOf("await resetProcessor()")).toBeLessThan(reset.indexOf('rpc("hardhat_reset")'));
  });

  it("resets Core's database, then the chain, then redeploys and seeds, then resets Core again", () => {
    const reset = readFileSync(resolve(root, "scripts/demo-reset.mjs"), "utf8");
    const at = (needle: string, from = 0) => {
      const i = reset.indexOf(needle, from);
      expect(i, `${needle} missing from demo-reset.mjs`).toBeGreaterThan(-1);
      return i;
    };
    const coreFirst = at("await resetCore()");
    const chain = at('rpc("hardhat_reset")', coreFirst);
    const clock = at("syncClock()", chain);
    const deploy = at("deployAndSeed()", clock);
    const coreAgain = at("await resetCore()", deploy);
    expect(coreFirst).toBeLessThan(chain);
    expect(chain).toBeLessThan(clock);
    expect(clock).toBeLessThan(deploy);
    expect(deploy).toBeLessThan(coreAgain);
  });
});
