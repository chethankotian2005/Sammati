import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// The commands people type are part of the interface (README, docs/demo.md): pin what they mean.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const scripts = (JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")) as { scripts: Record<string, string> }).scripts;
const demoUp = readFileSync(resolve(root, "scripts/demo-up.mjs"), "utf8");
const devReset = readFileSync(resolve(root, "scripts/dev-reset.mjs"), "utf8");

describe("pnpm demo:up", () => {
  it("is the one way to start the stack: no stub and no fast-expiry variants", () => {
    expect(scripts["demo:up"]).toBe("node scripts/demo-up.mjs");
    expect(Object.keys(scripts).filter((k) => k.startsWith("demo:"))).toEqual(["demo:up"]);
  });

  it("starts the Processor and tells Core where the wallet will find it (V-06), and no company backend", () => {
    expect(demoUp).toContain('name: "processor"');
    expect(demoUp).toContain("PROCESSOR_PUBLIC_URL: processorUrl");
    expect(demoUp.indexOf("processor.sqlite")).toBeGreaterThan(-1);
    for (const name of ["quickloan", "medicare", "foodrush"]) expect(demoUp).not.toContain(name);
  });

  it("gives Core the QR address it printed, and clears the previous run's database first", () => {
    expect(demoUp).toContain("CORE_PUBLIC_URL: qr.url");
    expect(demoUp).toContain("console.log(qr.banner)");
    expect(demoUp.indexOf("rmSync(")).toBeLessThan(demoUp.indexOf("concurrently("));
  });
});

describe("the dev tools (trd.md §6.4)", () => {
  it("are command-line scripts, behind DEV_TOOLS", () => {
    expect(scripts["dev:reset"]).toBe("node scripts/dev-reset.mjs");
    expect(scripts["dev:tamper"]).toBe("pnpm --filter @sammati/core dev:tamper");
    expect(scripts["demo:" + "reset"]).toBeUndefined();
  });

  it("dev:reset removes the files, resets the chain, then redeploys and funds, and registers nothing", () => {
    const at = (needle: string, from = 0) => {
      const i = devReset.indexOf(needle, from);
      expect(i, `${needle} missing from dev-reset.mjs`).toBeGreaterThan(-1);
      return i;
    };
    const files = at("rmSync(");
    const chain = at('rpc("hardhat_reset")', files);
    const clock = at("syncClock()", chain);
    const deploy = at("deployAndFund()", clock);
    expect(files).toBeLessThan(chain);
    expect(chain).toBeLessThan(clock);
    expect(clock).toBeLessThan(deploy);
    expect(devReset).toContain('requireDevTools("dev:reset")');
    expect(devReset).not.toMatch(/fetch\(|\/v1\//); // it talks to the chain's RPC and to files, never to a service
  });

  const run = (script: string, env: Record<string, string>) =>
    spawnSync(process.execPath, [resolve(root, script)], { env: { PATH: process.env.PATH ?? "", ...env }, encoding: "utf8", timeout: 20_000 });

  it("dev:reset does nothing without DEV_TOOLS=true, and never beside NODE_ENV=production", () => {
    const off = run("scripts/dev-reset.mjs", {});
    expect(off.status).toBe(1);
    expect(off.stderr).toContain("DEV_TOOLS=true");
    const prod = run("scripts/dev-reset.mjs", { DEV_TOOLS: "true", NODE_ENV: "production" });
    expect(prod.status).toBe(1);
    expect(prod.stderr).toContain("NODE_ENV=production");
  });

  it("dev:tamper does nothing without DEV_TOOLS=true", () => {
    const cli = ["--import", "tsx", resolve(root, "core/scripts/dev-tamper.ts"), "--", "quickloan", "1"];
    const off = spawnSync(process.execPath, cli, { cwd: resolve(root, "core"), env: { PATH: process.env.PATH ?? "" }, encoding: "utf8", timeout: 30_000 });
    expect(off.status).toBe(1);
    expect(off.stderr).toContain("DEV_TOOLS=true");
  });
});
