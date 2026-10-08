// `pnpm e2e` (trd.md §11): the whole story once, against a real stack, in under 30 s.
//
//   reset → company creates a request → user signs and grants → ALLOWED → unconsented purpose BLOCKED
//   → withdraw → BLOCKED → processor acknowledges → verify (clean) → tamper → verify (mismatch pinpointed)
//
// Uses a running `pnpm demo:up` if there is one (and resets it first); otherwise starts the stack
// itself and stops it afterwards. Exits non-zero, naming the step, if anything is not as expected.
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createWriteStream, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Wallet } from "ethers";
import { clockSkew, rpc } from "../../scripts/chain.mjs";
import { describeQrUrl } from "../../scripts/lan.mjs";
import { WebSocket } from "ws";
import {
  GRANT_CONSENT_TYPE,
  SEED_FIDUCIARIES,
  WITHDRAW_CONSENT_TYPE,
  noticeHash,
  purposeIdOf,
  type CascadeResponse,
  type CreateRequestResponse,
  type DemoAnchorResponse,
  type DemoFireResponse,
  type FiduciaryAccessResponse,
  type FiduciaryPurposesResponse,
  type GrantResponse,
  type HealthResponse,
  type PrincipalConsentsResponse,
  type RequestNotice,
  type RightsRequest,
  type RightsResponse,
  type StoredAccessLogEntry,
  type TamperResponse,
  type VerifyResponse,
  type WithdrawResponse,
  type WsEvent,
} from "@sammati/shared";

// The stack this script may start reads the repo-root .env (CORE_PUBLIC_URL, ...), so the checks below must too.
try {
  process.loadEnvFile(resolve(dirname(fileURLToPath(import.meta.url)), "../../.env"));
} catch {
  // no .env
}

const CORE = process.env.E2E_CORE_URL ?? "http://localhost:4000";
const BUDGET_MS = Number(process.env.E2E_BUDGET_MS ?? 30_000);
const STACK_START_TIMEOUT_MS = 120_000;
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const QUICKLOAN = SEED_FIDUCIARIES[0]!;
const FID = QUICKLOAN.address;
const GRANTED = "marketing"; // has a downstream processor, so the cascade has someone to tell
const UNCONSENTED = "bureau_share";
const MARKETING_ID = purposeIdOf(FID, GRANTED);

class E2eError extends Error {}
const fail = (message: string): never => {
  throw new E2eError(message);
};
const check = (condition: unknown, message: string): void => {
  if (!condition) fail(message);
};
function expectEqual(actual: unknown, expected: unknown, label: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) fail(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function api<T>(method: string, path: string, body?: unknown): Promise<{ status: number; json: T }> {
  const res = await fetch(CORE + path, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    fail(`${method} ${path} answered ${res.status} with something that is not JSON: ${text.slice(0, 120)}`);
  }
  return { status: res.status, json: json as T };
}

/** A request that must succeed. */
async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const { status, json } = await api<T>(method, path, body);
  if (status < 200 || status >= 300) fail(`${method} ${path} answered ${status}: ${JSON.stringify(json)}`);
  return json;
}

/** Polls until `read` returns something (not undefined), or fails naming what never happened. */
async function until<T>(what: string, read: () => Promise<T | undefined>, timeoutMs: number): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await read();
    if (value !== undefined) return value;
    if (Date.now() > deadline) fail(`timed out after ${timeoutMs / 1000}s waiting for ${what}`);
    await sleep(100);
  }
}

// --- the stack ---

const stack: { child: ChildProcess | null; logFile: string; dbFile: string } = {
  child: null,
  logFile: join(tmpdir(), "sammati-e2e-stack.log"),
  dbFile: join(tmpdir(), "sammati-e2e.sqlite"),
};

/** Deletes the throwaway database (and SQLite's side files); Windows can hold them briefly after the process exits. */
function removeDb(): void {
  for (const suffix of ["", "-wal", "-shm"]) rmSync(stack.dbFile + suffix, { force: true, maxRetries: 10, retryDelay: 100 });
}

async function health(): Promise<HealthResponse | null> {
  try {
    const res = await fetch(`${CORE}/v1/health`, { signal: AbortSignal.timeout(1500) });
    return res.ok ? ((await res.json()) as HealthResponse) : null;
  } catch {
    return null;
  }
}

async function companyUp(): Promise<boolean> {
  try {
    return (await fetch(`http://localhost:${QUICKLOAN.port}/health`, { signal: AbortSignal.timeout(1500) })).ok;
  } catch {
    return false;
  }
}

function stopStack(): void {
  const child = stack.child;
  if (!child?.pid) return;
  if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  else process.kill(-child.pid, "SIGTERM"); // the whole process group: pnpm, node and their children
  stack.child = null;
  removeDb();
}

/** Returns how the stack was found: already running (needs a reset) or started here (already clean). */
async function ensureStack(): Promise<"reused" | "started"> {
  const found = await health();
  if (found) {
    if (found.mode !== "live") fail(`Core at ${CORE} is in ${found.mode} mode; the e2e needs the real one. Stop it and run \`pnpm demo:up\` (or let this script start the stack).`);
    check(await companyUp(), `Core is up but QuickLoan's backend (port ${QUICKLOAN.port}) is not: is the whole \`pnpm demo:up\` stack running?`);
    return "reused";
  }
  if (process.argv.includes("--no-start")) fail(`No Core at ${CORE}, and --no-start was given. Run \`pnpm demo:up\` first.`);

  console.log(`No stack running: starting \`pnpm demo:up\` (log: ${stack.logFile})`);
  const log = createWriteStream(stack.logFile);
  // A stack started here gets a database of its own. The default one persists between runs, and would
  // bring back the previous run's deliberately tampered log against this run's brand-new chain.
  removeDb();
  stack.child = spawn(process.execPath, [join(repoRoot, "scripts/demo-up.mjs")], {
    cwd: repoRoot,
    env: { ...process.env, DB_PATH: stack.dbFile },
    detached: process.platform !== "win32",
    stdio: ["ignore", "pipe", "pipe"],
  });
  stack.child.stdout?.pipe(log);
  stack.child.stderr?.pipe(log);
  const exited = new Promise<number | null>((r) => stack.child?.once("exit", r));
  const deadline = Date.now() + STACK_START_TIMEOUT_MS;
  for (;;) {
    if ((await health())?.mode === "live" && (await companyUp())) return "started";
    if (Date.now() > deadline) fail(`the stack did not come up in ${STACK_START_TIMEOUT_MS / 1000}s; see ${stack.logFile}`);
    if ((await Promise.race([exited, sleep(250).then(() => "running")])) !== "running") fail(`the stack exited while starting; see ${stack.logFile}`);
  }
}

function resetEverything(): void {
  const r = spawnSync(process.execPath, [join(repoRoot, "scripts/demo-reset.mjs")], { cwd: repoRoot, encoding: "utf8" });
  if (r.status !== 0) fail(`pnpm demo:reset failed (exit ${r.status}):\n${(r.stdout + r.stderr).trim().split("\n").slice(-6).join("\n")}`);
}

// --- the story ---

interface Timing {
  name: string;
  ms: number;
}
const timings: Timing[] = [];

async function step<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const started = Date.now();
  try {
    const value = await fn();
    const ms = Date.now() - started;
    timings.push({ name, ms });
    console.log(`  ✓ ${name.padEnd(62)} ${(ms / 1000).toFixed(2)} s`);
    return value;
  } catch (err) {
    console.log(`  ✗ ${name}`);
    throw err;
  }
}

async function main(): Promise<void> {
  console.log(`Sammati e2e against ${CORE}`);
  const how = await ensureStack();
  const suiteStarted = Date.now();

  if (how === "reused") await step("reset the chain, reseed it and wipe Core's database", async () => resetEverything());
  else console.log("  · stack started on a fresh chain: nothing to reset");

  // A new person every run: nothing cached or recorded about them anywhere.
  const user = Wallet.createRandom();
  const events: WsEvent[] = [];
  const socket = new WebSocket(CORE.replace(/^http/, "ws") + "/ws");
  socket.on("message", (raw) => events.push(JSON.parse(raw.toString()) as WsEvent));
  await new Promise<void>((resolveOpen, rejectOpen) => {
    socket.once("open", () => resolveOpen());
    socket.once("error", rejectOpen);
  });
  socket.send(JSON.stringify({ sub: [`principal:${user.address}`, `fiduciary:${FID}`, "auditor"] }));

  try {
    await step("the world starts clean: empty log, nothing consented, chain clock on the wall clock", async () => {
      expectEqual((await call<FiduciaryAccessResponse>("GET", `/v1/fiduciaries/${FID}/access?limit=500`)).items, [], "QuickLoan's access log");
      expectEqual((await call<{ rows: unknown[] }>("GET", `/v1/fiduciaries/${FID}/consents`)).rows, [], "QuickLoan's consent table");
      await rpc("evm_mine"); // a block stamped now, so the chain's clock can be read without waiting for the next one
      const skew = await clockSkew();
      check(Math.abs(skew) < 2, `the chain clock is ${skew.toFixed(1)} s from the wall clock (should be within 2 s after a reset)`);
    });
    const request = await step("company creates a consent request (the QR code)", async () => {
      const created = await call<CreateRequestResponse>("POST", `/v1/fiduciaries/${FID}/requests`, { purposes: [GRANTED], customerAlias: "E2E customer" });
      expectEqual(created.qrPayload.fiduciary, FID, "QR payload names the company");
      check(created.requestId.startsWith("req_"), "request id looks wrong");
      // The phone fetches the notice from this address, so it must be the one demo:up printed, not "localhost".
      if (how === "started" && !process.env.CORE_PUBLIC_URL) {
        const expected = describeQrUrl({ port: new URL(CORE).port || "4000", env: {} });
        expectEqual(created.qrPayload.core, expected.url, "the address in the QR code");
      }
      return created;
    });

    const notice = await step("wallet fetches the notice; its hash matches the text shown", async () => {
      const n = await call<RequestNotice>("GET", `/v1/requests/${request.requestId}?principal=${user.address}`);
      expectEqual(n.nonce, "0", "a new person starts at nonce 0");
      const recomputed = noticeHash({
        fiduciary: n.fiduciary.address,
        version: n.noticeVersion,
        purposes: n.purposes.map((p) => ({
          id: p.id,
          desc_en: p.description.en,
          desc_hi: p.description.hi,
          desc_kn: p.description.kn,
          dataCategories: p.dataCategories,
          retentionDays: p.retentionDays,
          sharesThirdParty: p.sharesThirdParty,
        })),
      });
      expectEqual(n.noticeHash, recomputed, "notice hash (drd.md §4.2)");
      return n;
    });

    let nonce = Number(notice.nonce);
    const inAnHour = () => Math.floor(Date.now() / 1000) + 3600;

    await step("user signs (EIP-712) and the relayer grants consent on chain", async () => {
      const message = {
        principal: user.address,
        fiduciary: FID,
        purposeId: MARKETING_ID,
        expiresAt: inAnHour() + 86_400,
        noticeHash: notice.noticeHash,
        nonce: String(nonce++),
        deadline: inAnHour(),
      };
      const signature = await user.signTypedData(notice.domain, { GrantConsent: [...GRANT_CONSENT_TYPE] }, message);
      const granted = await call<GrantResponse>("POST", "/v1/consents/grant", { request: message, signature });
      expectEqual(granted.status, "confirmed", "grant status");
      const consents = await call<PrincipalConsentsResponse>("GET", `/v1/principals/${user.address}/consents`);
      expectEqual(consents.fiduciaries[0]?.consents.map((c) => [c.code, c.status]), [[GRANTED, "Active"]], "the wallet's consent list");
    });

    await step("the console lists the company's purposes; the wallet files a data-rights request and sees it", async () => {
      const purposes = await call<FiduciaryPurposesResponse>("GET", `/v1/fiduciaries/${FID}/purposes`);
      expectEqual(purposes.purposes.map((p) => p.code), ["credit_check", "marketing", "bureau_share"], "QuickLoan's purposes");
      const filed = await api<RightsRequest>("POST", "/v1/rights", { principal: user.address, fiduciary: FID, type: "erasure", note: "e2e" });
      expectEqual([filed.status, filed.json.status], [201, "open"], "filing a rights request");
      const mine = await call<RightsResponse>("GET", `/v1/principals/${user.address}/rights`);
      expectEqual(mine.rights.map((r) => [r.id, r.fiduciaryName, r.type]), [[filed.json.id, "QuickLoan", "erasure"]], "the wallet's rights list");
    });
    const fire = (purposeCode: string) => call<DemoFireResponse>("POST", "/v1/demo/fire", { fiduciary: FID, purposeCode, principal: user.address });
    const entries: { label: string; id: string; expected: string }[] = [];
    const record = (label: string, fired: DemoFireResponse, expected: string) => {
      check(fired.entryId, `${label}: no log entry id came back`);
      entries.push({ label, id: fired.entryId, expected });
    };

    await step(`run a request for ${GRANTED}: ALLOWED`, async () => {
      const fired = await fire(GRANTED);
      expectEqual([fired.decision, fired.reason], ["ALLOWED", "OK"], "decision");
      record(GRANTED, fired, "ALLOWED");
    });

    await step(`run a request for ${UNCONSENTED}, never consented to: BLOCKED`, async () => {
      const fired = await fire(UNCONSENTED);
      expectEqual([fired.decision, fired.reason], ["BLOCKED", "NO_CONSENT"], "decision");
      record(UNCONSENTED, fired, "BLOCKED");
    });

    await step(`user withdraws ${GRANTED}`, async () => {
      const message = { principal: user.address, fiduciary: FID, purposeId: MARKETING_ID, nonce: String(nonce++), deadline: inAnHour() };
      const signature = await user.signTypedData(notice.domain, { WithdrawConsent: [...WITHDRAW_CONSENT_TYPE] }, message);
      expectEqual((await call<WithdrawResponse>("POST", "/v1/consents/withdraw", { request: message, signature })).status, "confirmed", "withdraw status");
    });

    await step(`run the same request again: BLOCKED at once`, async () => {
      const fired = await fire(GRANTED);
      expectEqual([fired.decision, fired.reason], ["BLOCKED", "CONSENT_WITHDRAWN"], "decision");
      record(`${GRANTED} after withdrawal`, fired, "BLOCKED");
    });

    await step("the downstream processor is told, then acknowledges on chain", async () => {
      const done = await until(
        "AdPartnerQ's acknowledgement",
        async () => {
          const c = (await call<CascadeResponse>("GET", `/v1/principals/${user.address}/cascade/${MARKETING_ID}`)).processors[0];
          return c?.ackedAt ? c : undefined;
        },
        8000,
      );
      check(done.name === "AdPartnerQ" && done.notifiedAt && done.txHash, `unexpected cascade entry ${JSON.stringify(done)}`);
    });

    const stored = await step("the gateway's log entries reached Core, in order", async () => {
      const wanted = new Set(entries.map((e) => e.id));
      const rows = await until(
        `${wanted.size} access-log entries`,
        async () => {
          const items = (await call<FiduciaryAccessResponse>("GET", `/v1/fiduciaries/${FID}/access?limit=500`)).items;
          const mine = items.filter((r) => wanted.has(r.id));
          return mine.length === wanted.size ? mine : undefined;
        },
        6000,
      );
      for (const e of entries) expectEqual(rows.find((r) => r.id === e.id)?.decision, e.expected, `log entry for ${e.label}`);
      return rows.sort((a, b) => a.seq - b.seq);
    });

    await step("anchor the log on chain now (instead of waiting for the 10 s timer)", async () => {
      // The timer may get there first and leave this call nothing to do, so check the outcome, not who did it.
      await call<DemoAnchorResponse>("POST", "/v1/demo/anchor", { fiduciary: FID });
      const wanted = new Set(stored.map((r) => r.id));
      await until(
        "every entry of this run to be covered by an anchored batch",
        async () => {
          const rows = (await call<FiduciaryAccessResponse>("GET", `/v1/fiduciaries/${FID}/access?limit=500`)).items.filter((r) => wanted.has(r.id));
          return rows.length === wanted.size && rows.every((r) => r.batchIndex !== null) ? true : undefined;
        },
        4000,
      );
    });

    await step("verify the log against the chain: clean", async () => {
      const v = await call<VerifyResponse>("POST", `/v1/audit/verify/${FID}`);
      expectEqual([v.ok, v.chainOk, v.gaps, v.firstMismatch], [true, true, [], null], "verification result");
      check(v.batches.length >= 1 && v.batches.every((b) => b.ok && b.recomputedRoot === b.anchoredRoot), "a batch does not match its on-chain root");
    });

    const tampered = await step("tamper with one stored log row (hide a refusal)", async () => {
      const t = await call<TamperResponse>("POST", `/v1/demo/tamper/${FID}`);
      check(stored.some((r) => r.seq === t.seq), `tampered row ${t.seq} is not one of this run's entries ${stored.map((r) => r.seq)}`);
      expectEqual([t.field, t.before, t.after], ["decision", "BLOCKED", "ALLOWED"], "what the tamper changed");
      return t;
    });

    await step("verify again: the mismatch is pinpointed to that exact record", async () => {
      const v = await call<VerifyResponse>("POST", `/v1/audit/verify/${FID}`);
      check(!v.ok, "verification still passes after the tamper");
      const row = stored.find((r) => r.seq === tampered.seq) as StoredAccessLogEntry;
      expectEqual(
        [v.firstMismatch?.kind, v.firstMismatch?.seq, v.firstMismatch?.entryId],
        ["HASH_MISMATCH", tampered.seq, row.id],
        "first mismatch",
      );
      const bad = v.batches.filter((b) => !b.ok);
      expectEqual(bad.map((b) => b.firstBadSeq), [tampered.seq], "the failing batch names the row");
      check(bad[0]!.recomputedRoot !== bad[0]!.anchoredRoot, "the failing batch's root should differ from the anchored one");
    });

    await step("the live feeds saw it all (WebSocket)", async () => {
      await until(
        "the tamper alert",
        async () => (events.some((e) => e.event === "tamper.alert") ? true : undefined),
        3000,
      );
      const count = (name: WsEvent["event"]) => events.filter((e) => e.event === name).length;
      expectEqual(
        events.filter((e): e is Extract<WsEvent, { event: "consent.updated" }> => e.event === "consent.updated").map((e) => e.status),
        ["Active", "Withdrawn"],
        "consent.updated for the wallet",
      );
      check(count("access.logged") >= entries.length, `expected ${entries.length} access.logged events, saw ${count("access.logged")}`);
      expectEqual(
        events.filter((e): e is Extract<WsEvent, { event: "cascade.updated" }> => e.event === "cascade.updated").map((e) => e.ackedAt !== null),
        [false, true],
        "cascade.updated: told, then acknowledged",
      );
      check(count("anchor.posted") >= 1, "no anchor.posted event");
      const alert = events.find((e): e is Extract<WsEvent, { event: "tamper.alert" }> => e.event === "tamper.alert");
      expectEqual(alert?.firstBadSeq, tampered.seq, "tamper.alert names the row");
    });
  } finally {
    socket.close();
  }

  const total = Date.now() - suiteStarted;
  console.log(`\nAll ${timings.length} steps passed in ${(total / 1000).toFixed(1)} s (budget ${BUDGET_MS / 1000} s).`);
  if (total > BUDGET_MS) fail(`the story took ${(total / 1000).toFixed(1)} s, over the ${BUDGET_MS / 1000} s budget (trd.md §11)`);
  if (how === "reused") console.log("The QuickLoan log is now deliberately tampered with: run `pnpm demo:reset` before the next rehearsal.");
}

try {
  await main();
} catch (err) {
  console.error(`\nE2E FAILED: ${err instanceof Error ? err.message : String(err)}`);
  if (stack.child) {
    try {
      console.error(`\n--- last lines of the stack log (${stack.logFile}) ---\n${readFileSync(stack.logFile, "utf8").trim().split("\n").slice(-12).join("\n")}`);
    } catch {
      // no log to show
    }
  }
  process.exitCode = 1;
} finally {
  stopStack();
}
// Nothing may keep the process alive after the verdict (sockets, the child's pipes).
setTimeout(() => process.exit(process.exitCode ?? 0), 200).unref();
