// `pnpm e2e` (trd.md §11): the whole story once, against a real stack, in under 30 s.
//
//   reset → company creates a request → user signs and grants → ALLOWED → unconsented purpose BLOCKED
//   → withdraw → BLOCKED → processor acknowledges → verify (clean) → tamper → verify (mismatch pinpointed)
//
// Uses a running `pnpm demo:up` if there is one (and resets it first); otherwise starts the stack
// itself and stops it afterwards. Exits non-zero, naming the step, if anything is not as expected.
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Wallet } from "ethers";
import { ciphertextHashOf, handleOf, seal, submitMessage } from "@sammati/shared/src/envelope";
import { clockSkew, rpc } from "../../scripts/chain.mjs";
import { Journey, type JourneyDeps, type Stage } from "../../web/src/portal/journey";
import { startSampleApp } from "../examples/quickstart";
import { describeQrUrl } from "../../scripts/lan.mjs";
import { WebSocket } from "ws";
import {
  API_KEY_HEADER,
  DEMO_PROFILE,
  REGULATOR_KEY_HEADER,
  GRANT_CONSENT_TYPE,
  LOAN_DECISION_ENDPOINT,
  SEED_FIDUCIARIES,
  WITHDRAW_CONSENT_TYPE,
  noticeHash,
  purposeIdOf,
  type ApplicationInput,
  type CascadeResponse,
  type FiduciariesResponse,
  type CreateRequestResponse,
  type DemoAnchorResponse,
  type DemoFireResponse,
  type FiduciaryAccessResponse,
  type FiduciaryConsentsResponse,
  type FiduciaryPurposesResponse,
  type GrantResponse,
  type HealthResponse,
  type InboxResponse,
  type PrincipalConsentsResponse,
  type RequestNotice,
  type RightsRequest,
  type RightsResponse,
  type StoredAccessLogEntry,
  type TamperResponse,
  type TargetedRequestResponse,
  type TargetedRequestsResponse,
  type VaultView,
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
const PROCESSOR = process.env.E2E_PROCESSOR_URL ?? "http://localhost:4200";
const BUDGET_MS = Number(process.env.E2E_BUDGET_MS ?? 30_000);
const STACK_START_TIMEOUT_MS = 120_000;
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const QUICKLOAN = SEED_FIDUCIARIES[0]!;
const FID = QUICKLOAN.address;
const GRANTED = "marketing"; // has a downstream processor, so the cascade has someone to tell
const UNCONSENTED = "bureau_share";
const MARKETING_ID = purposeIdOf(FID, GRANTED);
const GRANTED_LOAN = "credit_check";
const CREDIT_ID = purposeIdOf(FID, GRANTED_LOAN); // the purpose behind the confidential-processing acts
const PLAINTEXT = DEMO_PROFILE.pan; // what must appear nowhere but the wallet and the Processor's memory (prd.md V-05)

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

/** Every HTTP answer the run saw, whole, so the plaintext search can look through all of it. */
const traffic: string[] = [];

async function api<T>(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<{ status: number; json: T }> {
  const res = await fetch(CORE + path, {
    method,
    headers: { ...(body ? { "content-type": "application/json" } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  traffic.push(`${method} ${path} ${res.status} ${text}`);
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    fail(`${method} ${path} answered ${res.status} with something that is not JSON: ${text.slice(0, 120)}`);
  }
  return { status: res.status, json: json as T };
}

/** A request that must succeed. */
async function call<T>(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<T> {
  const { status, json } = await api<T>(method, path, body, headers);
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

const stack: { child: ChildProcess | null; logFile: string; dbFile: string; vaultFile: string } = {
  child: null,
  logFile: join(tmpdir(), "sammati-e2e-stack.log"),
  dbFile: join(tmpdir(), "sammati-e2e.sqlite"),
  vaultFile: join(tmpdir(), "sammati-e2e-processor.sqlite"),
};

/** Deletes the throwaway database (and SQLite's side files); Windows can hold them briefly after the process exits. */
function removeDb(): void {
  for (const file of [stack.dbFile, stack.vaultFile]) {
    for (const suffix of ["", "-wal", "-shm"]) rmSync(file + suffix, { force: true, maxRetries: 10, retryDelay: 100 });
  }
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

async function processorUp(): Promise<boolean> {
  try {
    return (await fetch(`${PROCESSOR}/health`, { signal: AbortSignal.timeout(1500) })).ok;
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
    check(await processorUp(), `Core is up but the Sammati Processor (${PROCESSOR}) is not: is the whole \`pnpm demo:up\` stack running?`);
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
    env: { ...process.env, DB_PATH: stack.dbFile, PROCESSOR_DB_PATH: stack.vaultFile },
    detached: process.platform !== "win32",
    stdio: ["ignore", "pipe", "pipe"],
  });
  stack.child.stdout?.pipe(log);
  stack.child.stderr?.pipe(log);
  const exited = new Promise<number | null>((r) => stack.child?.once("exit", r));
  const deadline = Date.now() + STACK_START_TIMEOUT_MS;
  for (;;) {
    if ((await health())?.mode === "live" && (await companyUp()) && (await processorUp())) return "started";
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
  const eventTimes: number[] = []; // when each frame arrived, for the Data Flow Inspector's recording
  const socket = new WebSocket(CORE.replace(/^http/, "ws") + "/ws");
  socket.on("message", (raw) => {
    events.push(JSON.parse(raw.toString()) as WsEvent);
    eventTimes.push(Date.now());
  });
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
    const fire = (purposeCode: string, action?: "loan_decision") =>
      call<DemoFireResponse>("POST", "/v1/demo/fire", { fiduciary: FID, purposeCode, principal: user.address, ...(action ? { action } : {}) });
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

    // --- confidential processing (prd.md V-01 to V-06): use without reading ---

    /** The fields of the Processor's and QuickLoan's answers that this script reads. */
    interface RawJson {
      alg?: string;
      mode?: string;
      publicKey?: string;
      handle?: `0x${string}`;
      ciphertextHash?: `0x${string}`;
      status?: string;
      purposeCode?: string;
      envelope?: { ciphertext?: string } | null;
      code?: string;
    }

    /** A request to the Processor or to QuickLoan directly; recorded in `traffic` for the plaintext search. */
    const raw = async (method: string, url: string, body?: unknown, headers: Record<string, string> = {}) => {
      const res = await fetch(url, { method, headers: { ...(body ? { "content-type": "application/json" } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
      const text = await res.text();
      traffic.push(`${method} ${url} ${res.status} ${[...res.headers].map(([k, v]) => `${k}: ${v}`).join("; ")} ${text}`);
      return { status: res.status, json: (text ? JSON.parse(text) : {}) as RawJson, headers: res.headers };
    };

    const profile = { handle: "" as `0x${string}`, ciphertextHash: "" as `0x${string}` };
    /** The customer of the portal section, and the portal's own state machine and feed. */
    const portalUser: { wallet?: ReturnType<typeof Wallet.createRandom>; journey?: Journey; feed?: WebSocket; requestId?: string; purposes?: string[]; nonce?: number } = {};
    const portalFrames: unknown[] = [];
    /** What the Data Flow Inspector's replay answers its staff buttons with (trd.md §6.9): the two real reads. */
    const recorded: { vaultRow: unknown; staffView: { status: number; body: unknown } | null } = { vaultRow: null, staffView: null };

    await step("user gives credit_check consent; the wallet seals the demo profile and the Processor stores ciphertext only", async () => {
      const message = { principal: user.address, fiduciary: FID, purposeId: CREDIT_ID, expiresAt: inAnHour() + 86_400, noticeHash: notice.noticeHash, nonce: String(nonce++), deadline: inAnHour() };
      const signature = await user.signTypedData(notice.domain, { GrantConsent: [...GRANT_CONSENT_TYPE] }, message);
      expectEqual((await call<GrantResponse>("POST", "/v1/consents/grant", { request: message, signature })).status, "confirmed", "grant status");

      // The wallet asks Core where the Processor is, then takes its public key.
      const where = await call<{ url: string }>("GET", "/v1/processor");
      check(/^https?:\/\//.test(where.url), `Core pointed at ${where.url}`);
      const key = (await raw("GET", `${PROCESSOR}/v1/processor/pubkey`)).json;
      expectEqual([key.alg, key.mode], ["X25519", "simulated-enclave"], "the Processor's public key, labelled honestly");

      // Seal on the "phone" (here: this script), bound to this customer, company and purpose, and sign the submission.
      const envelope = seal(DEMO_PROFILE, key.publicKey!, { fiduciary: FID, principal: user.address, purposeCode: "credit_check" });
      const requestId = `e2e-${Date.now()}`;
      const submitSignature = await user.signMessage(submitMessage(handleOf(envelope), requestId));
      const submit = await raw("POST", `${PROCESSOR}/v1/vault/submit`, { principal: user.address, fiduciary: FID, purposeCode: "credit_check", envelope, requestId, signature: submitSignature });
      expectEqual(submit.status, 201, "submit status");
      profile.handle = submit.json.handle!;
      profile.ciphertextHash = submit.json.ciphertextHash!;
      expectEqual([profile.handle, profile.ciphertextHash], [handleOf(envelope), ciphertextHashOf(envelope)], "handle and hash");
      check(!JSON.stringify(envelope).includes(PLAINTEXT), "the envelope contains the plaintext");
    });

    await step("QuickLoan's admin view shows a handle and a hash, never the data", async () => {
      // QuickLoan learns the handle from the Processor's webhook; its credit-profile endpoint is the admin view.
      const held = await until(
        "QuickLoan to be told the handle",
        async () => {
          const r = await raw("GET", `http://localhost:${QUICKLOAN.port}/customers/1/credit-profile`, undefined, { "x-sammati-principal": user.address });
          return r.status === 200 && r.json.status === "stored" ? r.json : undefined;
        },
        4000,
      );
      expectEqual(held, { handle: profile.handle, ciphertextHash: profile.ciphertextHash, status: "stored" } satisfies VaultView, "what QuickLoan holds");
      recorded.staffView = { status: 200, body: held };

      // The same, as the console's simulator sees it through Core.
      const fired = await fire("credit_check");
      expectEqual([fired.decision, fired.reason], ["ALLOWED", "OK"], "the credit-profile request");
      expectEqual(fired.result, { handle: profile.handle, ciphertextHash: profile.ciphertextHash, status: "stored" }, "the result Core relays");
      record("credit_check admin view", fired, "ALLOWED");

      // And the vault itself: ciphertext and metadata, whoever asks.
      const vaulted = (await raw("GET", `${PROCESSOR}/v1/vault/${profile.handle}`)).json;
      expectEqual([vaulted.status, vaulted.purposeCode], ["stored", "credit_check"], "vault entry");
      recorded.vaultRow = vaulted;
      check(typeof vaulted.envelope?.ciphertext === "string", "the vault should return the ciphertext");
    });

    await step("apply: the Processor decrypts, QuickLoan gets only a decision", async () => {
      const fired = await fire("credit_check", "loan_decision");
      expectEqual([fired.decision, fired.reason], ["ALLOWED", "OK"], "the apply request");
      expectEqual(fired.result, { decision: "approved", limit: 300000, reasonCodes: ["SCORE_FAIR"] }, "the loan decision");
      record("loan decision", fired, "ALLOWED");
      check(LOAN_DECISION_ENDPOINT.path === "/customers/:id/apply", "the apply endpoint moved");
    });

    await step("user withdraws credit_check; apply is refused with 451 CONSENT_WITHDRAWN", async () => {
      const message = { principal: user.address, fiduciary: FID, purposeId: CREDIT_ID, nonce: String(nonce++), deadline: inAnHour() };
      const signature = await user.signTypedData(notice.domain, { WithdrawConsent: [...WITHDRAW_CONSENT_TYPE] }, message);
      expectEqual((await call<WithdrawResponse>("POST", "/v1/consents/withdraw", { request: message, signature })).status, "confirmed", "withdraw status");
      const fired = await fire("credit_check", "loan_decision");
      expectEqual([fired.decision, fired.reason, fired.result], ["BLOCKED", "CONSENT_WITHDRAWN", undefined], "the apply request after withdrawal");
      record("loan decision after withdrawal", fired, "BLOCKED");
    });

    await step("the vault entry is erased: metadata stays, ciphertext is gone", async () => {
      const erased = await until(
        "the vault entry to be erased",
        async () => {
          const v = (await raw("GET", `${PROCESSOR}/v1/vault/${profile.handle}`)).json;
          return v.status === "erased" ? v : undefined;
        },
        3000,
      );
      expectEqual([erased.envelope, erased.ciphertextHash], [null, profile.ciphertextHash], "erased entry");
    });

    await step("the live feeds carried every vault step, and nothing but handles, hashes and codes", async () => {
      const names = () => events.filter((e) => /^(vault|processor)\./.test(e.event)).map((e) => e.event);
      await until("the vault.erased event", async () => (names().includes("vault.erased") ? true : undefined), 3000);
      expectEqual(
        [...new Set(names())],
        ["vault.encrypted", "vault.stored", "processor.requested", "processor.decrypting", "processor.decided", "vault.erased"],
        "vault and processor events, in order of first appearance",
      );
      const decided = events.filter((e): e is Extract<WsEvent, { event: "processor.decided" }> => e.event === "processor.decided");
      expectEqual(decided.map((e) => [e.decision, e.limit, e.reasonCodes]), [["approved", 300000, ["SCORE_FAIR"]], ["blocked", null, ["CONSENT_WITHDRAWN"]]], "processor.decided");
      expectEqual(events.filter((e) => e.event === "vault.erased").map((e) => (e as Extract<WsEvent, { event: "vault.erased" }>).cause), ["withdrawn"], "vault.erased cause (once)");
    });

    // --- the customer portal and the wallet's data entry (prd.md C-09, W-13) ---
    // The portal's own state machine, with real answers and a real socket, and a headless wallet in place of the phone.

    await step("portal: a customer signs in, ticks the box, and the QR is on the page", async () => {
      const shopper = Wallet.createRandom();
      const portalName = `E2E portal ${shopper.address.slice(2, 8)}`;
      portalUser.wallet = shopper;

      const deps: JourneyDeps = {
        createRequest: async (alias, purposes) => {
          const created = await call<CreateRequestResponse>("POST", `/v1/fiduciaries/${FID}/requests`, { purposes, customerAlias: alias });
          portalUser.purposes = purposes;
          return { requestId: created.requestId, qrPayload: created.qrPayload };
        },
        consentRows: async () => (await call<{ rows: Array<{ principal: string; customerAlias: string | null }> }>("GET", `/v1/fiduciaries/${FID}/consents`)).rows,
        apply: async (alias, principal) => {
          const answered = await raw("POST", `http://localhost:${QUICKLOAN.port}/customers/${encodeURIComponent(alias)}/apply`, undefined, { "x-sammati-principal": principal });
          const entryId = answered.headers.get("x-sammati-entry-id");
          if (entryId) entries.push({ label: "portal apply", id: entryId, expected: answered.status === 451 ? "BLOCKED" : "ALLOWED" });
          return { status: answered.status, body: answered.json };
        },
        now: () => Date.now(),
      };
      const journey = new Journey(deps);
      portalUser.journey = journey;

      // The page listens like a browser does: the company's topic, whatever happens to it.
      const feed = new WebSocket(CORE.replace(/^http/, "ws") + "/ws");
      portalUser.feed = feed;
      feed.on("message", (data) => {
        const frame = JSON.parse(data.toString()) as unknown;
        portalFrames.push(frame);
        void journey.onFrame(frame);
      });
      await new Promise<void>((resolveOpen, rejectOpen) => {
        feed.once("open", () => resolveOpen());
        feed.once("error", rejectOpen);
      });
      feed.send(JSON.stringify({ sub: [`fiduciary:${FID}`, "auditor"] }));
      await sleep(100);

      check(!journey.login(PLAINTEXT), "the login accepted a PAN as a name");
      check(journey.login(portalName), "the login refused an ordinary name");
      expectEqual(journey.state.stage, "form", "stage after sign-in");
      expectEqual(journey.state.optional, [], "nothing is pre-ticked");

      await journey.tick();
      expectEqual(journey.state.stage, "awaiting-scan", "stage after ticking");
      expectEqual(portalUser.purposes, [GRANTED_LOAN], "the request asks only for the loan purpose");
      const qr = JSON.parse(journey.state.request!.qrPayload) as { requestId: string; fiduciary: string };
      expectEqual(qr.fiduciary, FID, "the QR names the company");
      portalUser.requestId = qr.requestId;
    });

    const portalStage = async (want: Stage, what: string, ms = 6000) => {
      await until(what, async () => (portalUser.journey!.state.stage === want ? true : undefined), ms);
    };

    await step("portal: the customer approves in the wallet, and the page says consent was received", async () => {
      const shopper = portalUser.wallet!;
      const n = await call<RequestNotice>("GET", `/v1/requests/${portalUser.requestId}?principal=${shopper.address}`);
      const message = {
        principal: shopper.address,
        fiduciary: FID,
        purposeId: CREDIT_ID,
        expiresAt: inAnHour() + 86_400,
        noticeHash: n.noticeHash,
        nonce: n.nonce,
        deadline: inAnHour(),
      };
      const signature = await shopper.signTypedData(n.domain, { GrantConsent: [...GRANT_CONSENT_TYPE] }, message);
      const granted = await call<GrantResponse>("POST", "/v1/consents/grant", { request: message, signature });
      portalUser.nonce = Number(n.nonce) + 1;
      await portalStage("consent-received", "the portal to show \"Consent received\"");
      expectEqual(portalUser.journey!.state.principal?.toLowerCase(), shopper.address.toLowerCase(), "the customer the portal recognised");
      expectEqual(portalUser.journey!.state.txHash, granted.txHash, "the transaction the portal shows");
    });

    await step("portal: the wallet shares the details (typed by hand) and the page says data was submitted securely", async () => {
      const shopper = portalUser.wallet!;
      const key = (await raw("GET", `${PROCESSOR}/v1/processor/pubkey`)).json;
      // W10, manual entry: PAN, income band and employment; no credit score to give.
      const typed = { employment: "salaried", incomeBand: DEMO_PROFILE.incomeBand, pan: DEMO_PROFILE.pan };
      const envelope = seal(typed, key.publicKey!, { fiduciary: FID, principal: shopper.address, purposeCode: "credit_check" });
      const requestId = `e2e-portal-${Date.now()}`;
      const signature = await shopper.signMessage(submitMessage(handleOf(envelope), requestId));
      const submit = await raw("POST", `${PROCESSOR}/v1/vault/submit`, { principal: shopper.address, fiduciary: FID, purposeCode: "credit_check", envelope, requestId, signature });
      expectEqual(submit.status, 201, "submit status");
      await portalStage("data-submitted", "the portal to show \"Data submitted securely\"");
      expectEqual(portalUser.journey!.state.vault, { handle: handleOf(envelope), ciphertextHash: ciphertextHashOf(envelope) }, "what the portal holds");
      // the portal's whole state, serialised, has nothing of the details in it
      const stateText = JSON.stringify(portalUser.journey!.state);
      for (const secret of [DEMO_PROFILE.pan, DEMO_PROFILE.incomeBand, "salaried"]) check(!stateText.includes(secret), `the portal's state contains "${secret}"`);
    });

    await step("portal: Apply returns a decision card, from data the page never saw", async () => {
      await portalUser.journey!.apply();
      const j = portalUser.journey!.state;
      expectEqual(j.stage, "decided", "stage after Apply");
      expectEqual(j.decision, { decision: "approved", limit: 300000, reasonCodes: ["SCORE_FAIR", "SCORE_ASSUMED"] }, "the decision card");
    });

    await step("portal: the customer withdraws, the page says so at once and Apply is blocked", async () => {
      const shopper = portalUser.wallet!;
      const n = await call<RequestNotice>("GET", `/v1/requests/${portalUser.requestId}?principal=${shopper.address}`);
      const message = { principal: shopper.address, fiduciary: FID, purposeId: CREDIT_ID, nonce: n.nonce, deadline: inAnHour() };
      const signature = await shopper.signTypedData(n.domain, { WithdrawConsent: [...WITHDRAW_CONSENT_TYPE] }, message);
      expectEqual((await call<WithdrawResponse>("POST", "/v1/consents/withdraw", { request: message, signature })).status, "confirmed", "withdraw status");
      await portalStage("withdrawn", "the portal to show \"Consent withdrawn\"");
      expectEqual(portalUser.journey!.state.decision, null, "the old decision is gone");

      // the page will not even try; and QuickLoan's backend refuses if asked anyway
      const before = entries.length;
      await portalUser.journey!.apply();
      expectEqual(entries.length, before, "a withdrawn page must not call the company");
      const direct = await raw("POST", `http://localhost:${QUICKLOAN.port}/customers/portal/apply`, undefined, { "x-sammati-principal": shopper.address });
      expectEqual([direct.status, direct.json.code], [451, "CONSENT_WITHDRAWN"], "QuickLoan's own answer to an Apply after withdrawal");
      const entryId = direct.headers.get("x-sammati-entry-id");
      check(entryId, "the refusal carried no log entry id");
      entries.push({ label: "portal apply after withdrawal", id: entryId!, expected: "BLOCKED" });

      await until("the portal to learn the details were erased", async () => (portalUser.journey!.state.dataErased ? true : undefined), 4000);
      expectEqual(portalUser.journey!.state.stage, "withdrawn", "the page stays on withdrawn");
      portalUser.feed!.close();
    });

    await step("targeted request: an ID is registered, a company sends to it, and it lands in the wallet's inbox within 2 s", async () => {
      const asha = Wallet.createRandom();
      const handle = `asha${Date.now().toString(36)}@sammati`;
      const issuedAt = Math.floor(Date.now() / 1000);
      const signature = await asha.signMessage(`sammati-id:v1:${handle}:${asha.address.toLowerCase()}:${issuedAt}`);
      expectEqual((await api("POST", "/v1/identities", { handle, principal: asha.address, issuedAt, signature })).status, 201, "registering the ID");

      const pushes: WsEvent[] = [];
      const ashaSocket = new WebSocket(CORE.replace(/^http/, "ws") + "/ws");
      ashaSocket.on("message", (raw) => pushes.push(JSON.parse(raw.toString()) as WsEvent));
      await new Promise<void>((ok, bad) => {
        ashaSocket.once("open", () => ok());
        ashaSocket.once("error", bad);
      });
      ashaSocket.send(JSON.stringify({ sub: [`principal:${asha.address}`] }));
      await sleep(150);

      try {
        const unknown = await api<Record<string, unknown>>("POST", `/v1/fiduciaries/${FID}/requests/targeted`, { handle: "nobody-here@sammati", purposes: [GRANTED_LOAN] });
        const sentAt = Date.now();
        const known = await api<Record<string, unknown>>("POST", `/v1/fiduciaries/${FID}/requests/targeted`, { handle, purposes: [GRANTED_LOAN], message: "Your loan form is ready", expiresInHours: 24 });
        expectEqual([unknown.status, known.status], [201, 201], "both sends");
        expectEqual(Object.keys(unknown.json).sort(), Object.keys(known.json).sort(), "the shape of the answer, known versus unknown ID");
        expectEqual([unknown.json.status, known.json.status], ["sent", "sent"], "the status the company is told");
        check(!JSON.stringify(known.json).toLowerCase().includes(asha.address.toLowerCase()), "the company's answer carried the customer's address");

        const pushed = await until("consent.requested on the wallet's feed", async () => pushes.find((e) => e.event === "consent.requested"), 2000);
        check(Date.now() - sentAt < 2000, "the request took longer than 2 s to arrive");
        const requested = pushed as Extract<WsEvent, { event: "consent.requested" }>;
        expectEqual([requested.requestId, requested.fiduciary, requested.purposeCodes], [known.json.requestId, FID, [GRANTED_LOAN]], "what was pushed");
        expectEqual(pushes.filter((e) => e.event === "consent.requested").length, 1, "pushes (the unknown ID must cause none)");

        const inbox = await call<InboxResponse>("GET", `/v1/principals/${asha.address}/requests`);
        expectEqual(inbox.requests.map((r) => [r.requestId, r.status, r.message]), [[known.json.requestId, "sent", "Your loan form is ready"]], "the inbox");

        // opening it is Seen, grant is Granted, and the company never saw an address
        const rowOf = async () => (await call<TargetedRequestsResponse>("GET", `/v1/fiduciaries/${FID}/requests/targeted`)).requests.find((r) => r.requestId === known.json.requestId)?.status;
        expectEqual(await rowOf(), "sent", "console status before the wallet opens it");
        const n = await call<RequestNotice>("GET", `/v1/requests/${known.json.requestId}?principal=${asha.address}`);
        expectEqual(await rowOf(), "seen", "console status once the wallet fetches the notice");
        const message = {
          principal: asha.address,
          fiduciary: FID,
          purposeId: CREDIT_ID,
          expiresAt: inAnHour() + 86_400,
          noticeHash: n.noticeHash,
          nonce: n.nonce,
          deadline: inAnHour(),
        };
        const grantSignature = await asha.signTypedData(n.domain, { GrantConsent: [...GRANT_CONSENT_TYPE] }, message);
        expectEqual((await call<GrantResponse>("POST", "/v1/consents/grant", { request: message, signature: grantSignature })).status, "confirmed", "grant status");
        expectEqual(await rowOf(), "granted", "console status after the grant");
        // The principal is known to the company only now, after consent (prd.md N-02).
        const consents = await call<FiduciaryConsentsResponse>("GET", `/v1/fiduciaries/${FID}/consents`);
        check(
          consents.rows.some((r) => r.principal.toLowerCase() === asha.address.toLowerCase() && r.purposeCode === GRANTED_LOAN && r.status === "Active"),
          "the grant is not in the company's Consents list",
        );
      } finally {
        ashaSocket.close();
      }
    });

    await step("targeted request: Decline, then Block this company, and the company learns nothing it was not told", async () => {
      const ravi = Wallet.createRandom();
      const handle = `ravi${Date.now().toString(36)}@sammati`;
      const stamp = () => Math.floor(Date.now() / 1000);
      const idAt = stamp();
      expectEqual(
        (await api("POST", "/v1/identities", { handle, principal: ravi.address, issuedAt: idAt, signature: await ravi.signMessage(`sammati-id:v1:${handle}:${ravi.address.toLowerCase()}:${idAt}`) })).status,
        201,
        "registering the ID",
      );
      const send = async () => (await call<TargetedRequestResponse>("POST", `/v1/fiduciaries/${FID}/requests/targeted`, { handle, purposes: [GRANTED_LOAN] })).requestId;
      const statusOf = async (id: string) => (await call<TargetedRequestsResponse>("GET", `/v1/fiduciaries/${FID}/requests/targeted`)).requests.find((r) => r.requestId === id)?.status;

      const first = await send();
      const declinedAt = stamp();
      const declineSig = await ravi.signMessage(`sammati-decline:v1:${first}:${ravi.address.toLowerCase()}:${declinedAt}`);
      await call("POST", `/v1/requests/${first}/decline`, { principal: ravi.address, issuedAt: declinedAt, signature: declineSig });
      expectEqual(await statusOf(first), "declined", "console status after Decline");
      expectEqual((await call<InboxResponse>("GET", `/v1/principals/${ravi.address}/requests`)).requests, [], "the inbox after Decline");

      const blockedAt = stamp();
      const blockSig = await ravi.signMessage(`sammati-block:v1:block:${FID.toLowerCase()}:${ravi.address.toLowerCase()}:${blockedAt}`);
      await call("POST", `/v1/principals/${ravi.address}/blocks`, { fiduciary: FID, action: "block", issuedAt: blockedAt, signature: blockSig });
      const second = await send(); // still "sent" to the company, but nothing is delivered
      expectEqual((await call<InboxResponse>("GET", `/v1/principals/${ravi.address}/requests`)).requests, [], "the inbox after Block: nothing delivered");
      expectEqual(await statusOf(second), "sent", "the company is not told it was blocked");
    });

    // --- a company joins Sammati (prd.md R-01 to R-04): apply, the regulator decides, the quickstart runs, the sandbox holds ---

    const regulator = { [REGULATOR_KEY_HEADER]: process.env.REGULATOR_KEY ?? "demo-regulator-key" };
    const stamp = () => Math.floor(Date.now() / 1000);
    const text3 = (en: string) => ({ en, hi: `${en} (hi)`, kn: `${en} (kn)` });
    const application = (name: string): ApplicationInput => ({
      name,
      sector: "Banking",
      contactEmail: "ops@demobank.example",
      purposes: [
        { code: "loan_offers", title: text3("Loan offers"), description: text3("Send you loan offers"), dataCategories: ["phone"], retentionDays: 90, sharesThirdParty: false, required: false },
        { code: "bureau_share", title: text3("Bureau sharing"), description: text3("Share repayment history with a bureau"), dataCategories: ["repayment history"], retentionDays: 365, sharesThirdParty: true, required: false },
      ],
      processors: [{ name: "BureauOne", purposeCode: "bureau_share" }],
    });
    const bankName = `DemoBank${Date.now().toString(36).slice(-4)}`;
    const bank = { id: "", address: "", apiKey: "", name: bankName };
    const customerWithId = async (label: string) => {
      const wallet = Wallet.createRandom();
      const handle = `${label}${Date.now().toString(36)}@sammati`;
      const issuedAt = stamp();
      const signature = await wallet.signMessage(`sammati-id:v1:${handle}:${wallet.address.toLowerCase()}:${issuedAt}`);
      expectEqual((await api("POST", "/v1/identities", { handle, principal: wallet.address, issuedAt, signature })).status, 201, `registering ${handle}`);
      return { wallet, handle };
    };
    const signGrant = async (who: Wallet | ReturnType<typeof Wallet.createRandom>, fid: string, requestId: string, code: string) => {
      const n = await call<RequestNotice>("GET", `/v1/requests/${requestId}?principal=${who.address}`);
      const message = { principal: who.address, fiduciary: fid, purposeId: purposeIdOf(fid, code), expiresAt: inAnHour() + 86_400, noticeHash: n.noticeHash, nonce: n.nonce, deadline: inAnHour() };
      const signature = await who.signTypedData(n.domain, { GrantConsent: [...GRANT_CONSENT_TYPE] }, message);
      return { message, signature };
    };

    await step("a new company applies through /join's API: a bad application is refused, a good one waits for the regulator", async () => {
      const bad = await api<{ error: { code: string; message: string } }>("POST", "/v1/registrations", { ...application(bankName), contactEmail: "nope" });
      expectEqual([bad.status, bad.json.error.code], [400, "BAD_APPLICATION"], "a malformed application");
      check(bad.json.error.message.includes("contactEmail"), "the refusal does not name the field");

      const sent = await call<{ applicationId: string; status: string }>("POST", "/v1/registrations", application(bankName));
      expectEqual(sent.status, "pending", "the new application");
      bank.id = sent.applicationId;
      const before = await call<FiduciariesResponse>("GET", "/v1/fiduciaries");
      check(!before.fiduciaries.some((f) => f.name === bankName), "a pending company is already in the directory");
      expectEqual((await api("POST", `/v1/regulator/registrations/${bank.id}/approve`, {}, {})).status, 401, "approving without the regulator's code");
    });

    await step("the regulator rejects another application: that company has no id, no key and cannot create requests", async () => {
      const other = await call<{ applicationId: string }>("POST", "/v1/registrations", application(`Rejected${Date.now().toString(36).slice(-4)}`));
      const rejected = await call<{ application: { status: string; note: string; contactEmail: string | null } }>("POST", `/v1/regulator/registrations/${other.applicationId}/reject`, { note: "Purposes are too broad." }, regulator);
      expectEqual([rejected.application.status, rejected.application.note, rejected.application.contactEmail], ["rejected", "Purposes are too broad.", null], "the rejection");
      const seen = await call<{ status: string; result: unknown }>("GET", `/v1/registrations/${other.applicationId}`);
      expectEqual([seen.status, seen.result], ["rejected", null], "what the rejected company sees");
      const stranger = Wallet.createRandom().address;
      expectEqual((await api("POST", `/v1/fiduciaries/${stranger}/requests`, { purposes: ["loan_offers"], customerAlias: "x" })).status, 404, "a request from a company that was never registered");
    });

    await step("the regulator approves it: registered on chain, in the directory in the sandbox, in the ledger, API key shown once", async () => {
      const approved = await call<{ fiduciary: { address: string; slug: string }; txHashes: string[] }>("POST", `/v1/regulator/registrations/${bank.id}/approve`, { note: "Welcome.", sandbox: true }, regulator);
      bank.address = approved.fiduciary.address;
      check(approved.txHashes.length >= 4, "too few ledger transactions for a company, two purposes and a processor");

      const listed = (await call<FiduciariesResponse>("GET", "/v1/fiduciaries")).fiduciaries.find((f) => f.address === bank.address);
      expectEqual([listed?.name, listed?.sandbox, listed?.demo, listed?.color], [bankName, true, false, "#16173F"], "the directory entry");
      expectEqual((await call<FiduciaryPurposesResponse>("GET", `/v1/fiduciaries/${bank.address}/purposes`)).purposes.map((p) => p.code), ["loan_offers", "bureau_share"], "its purposes");
      const ledger = await call<{ events: Array<{ type: string; payload: { kind?: string } | null }> }>("GET", `/v1/audit/ledger?fid=${bank.address}&type=purpose`);
      const kinds = ledger.events.map((e) => e.payload?.kind);
      check(kinds.includes("fiduciary") && kinds.includes("purpose"), `the ledger explorer lacks the registration events (saw ${kinds.join(",")})`);

      const first = await call<{ status: string; result: { apiKey: string | null; apiKeyShown: boolean; fiduciary: string } }>("GET", `/v1/registrations/${bank.id}`);
      check(first.result.apiKey?.startsWith("sk_"), "the applicant was not given an API key");
      bank.apiKey = first.result.apiKey!;
      const second = await call<{ result: { apiKey: string | null } }>("GET", `/v1/registrations/${bank.id}`);
      expectEqual(second.result.apiKey, null, "the API key on a second read");
      const regulatorView = JSON.stringify(await call("GET", "/v1/regulator/registrations", undefined, regulator));
      check(!regulatorView.includes(bank.apiKey), "the regulator's own view contained the API key");
    });

    await step("the quickstart in a tiny sample app: a test customer is asked, approves, ALLOWED; withdraws, BLOCKED", async () => {
      const sample = await startSampleApp({ coreUrl: CORE, fiduciary: bank.address, apiKey: bank.apiKey, purpose: "loan_offers" });
      try {
        const customer = await customerWithId("dana");
        expectEqual((await api("POST", "/v1/regulator/test-principals", { handle: customer.handle }, regulator)).status, 201, "naming the test customer");
        const guarded = (principal: string) => fetch(`${sample.url}/customers/1/profile`, { headers: { "x-sammati-principal": principal } });

        const before = await guarded(customer.wallet.address);
        expectEqual([before.status, ((await before.json()) as { code: string }).code], [451, "NO_CONSENT"], "the sample app before any consent");

        const asked = await call<TargetedRequestResponse>("POST", `/v1/fiduciaries/${bank.address}/requests/targeted`, { handle: customer.handle, purposes: ["loan_offers"], message: "To send you offers" }, { [API_KEY_HEADER]: bank.apiKey });
        const inbox = await until("the request in the test customer's inbox", async () => {
          const r = (await call<InboxResponse>("GET", `/v1/principals/${customer.wallet.address}/requests`)).requests;
          return r.length ? r : undefined;
        }, 3000);
        expectEqual([inbox[0]?.requestId, inbox[0]?.fiduciary.name], [asked.requestId, bankName], "the inbox");

        const grant = await signGrant(customer.wallet, bank.address, asked.requestId, "loan_offers");
        expectEqual((await call<GrantResponse>("POST", "/v1/consents/grant", { request: grant.message, signature: grant.signature })).status, "confirmed", "grant");
        expectEqual((await guarded(customer.wallet.address)).status, 200, "the sample app after consent");

        const consents = await call<PrincipalConsentsResponse>("GET", `/v1/principals/${customer.wallet.address}/consents`);
        const message = { principal: customer.wallet.address, fiduciary: bank.address, purposeId: purposeIdOf(bank.address, "loan_offers"), nonce: consents.nonce, deadline: inAnHour() };
        const signature = await customer.wallet.signTypedData(consents.domain, { WithdrawConsent: [...WITHDRAW_CONSENT_TYPE] }, message);
        expectEqual((await call<WithdrawResponse>("POST", "/v1/consents/withdraw", { request: message, signature })).status, "confirmed", "withdraw");
        const blocked = await guarded(customer.wallet.address);
        expectEqual([blocked.status, ((await blocked.json()) as { code: string }).code], [451, "CONSENT_WITHDRAWN"], "the sample app after withdrawal");

        await sample.close(); // flushes its log entries to Core
        const log = (await call<FiduciaryAccessResponse>("GET", `/v1/fiduciaries/${bank.address}/access?limit=10`)).items;
        expectEqual(log.map((e) => `${e.decision}:${e.reason}`).reverse(), ["BLOCKED:NO_CONSENT", "ALLOWED:OK", "BLOCKED:CONSENT_WITHDRAWN"], "DemoBank's own access log");
      } finally {
        await sample.close().catch(() => undefined);
      }
    });

    await step("the sandbox and the key hold: untested customers, another company's id and a missing key are all refused", async () => {
      const stranger = await customerWithId("eve");
      const key = { [API_KEY_HEADER]: bank.apiKey };
      // the company is told "sent" either way, and nothing reaches the stranger
      const sent = await api<TargetedRequestResponse>("POST", `/v1/fiduciaries/${bank.address}/requests/targeted`, { handle: stranger.handle, purposes: ["loan_offers"] }, key);
      expectEqual([sent.status, sent.json.status], [201, "sent"], "the answer to the company");
      expectEqual((await call<InboxResponse>("GET", `/v1/principals/${stranger.wallet.address}/requests`)).requests, [], "the stranger's inbox");
      const qr = await call<CreateRequestResponse>("POST", `/v1/fiduciaries/${bank.address}/requests`, { purposes: ["loan_offers"], customerAlias: "walk-in" }, key);
      const opened = await api<{ error: { code: string } }>("GET", `/v1/requests/${qr.requestId}?principal=${stranger.wallet.address}`);
      expectEqual([opened.status, opened.json.error.code], [403, "SANDBOX_COMPANY"], "a non-test customer opening a sandbox company's notice");

      // keys are scoped, and fail closed
      const other = await api<{ error: { code: string } }>("POST", `/v1/fiduciaries/${FID}/requests/targeted`, { handle: stranger.handle, purposes: [GRANTED_LOAN] }, key);
      expectEqual([other.status, other.json.error.code], [403, "FIDUCIARY_MISMATCH"], "DemoBank's key on QuickLoan");
      const none = await api<{ error: { code: string } }>("GET", `/v1/gateway/consent-state?principal=${stranger.wallet.address}&fid=${bank.address}&purpose=loan_offers`);
      expectEqual([none.status, none.json.error.code], [401, "INVALID_API_KEY"], "a gateway call with no key");

      // promotion lifts the sandbox
      expectEqual((await call<{ sandbox: boolean }>("POST", `/v1/regulator/fiduciaries/${bank.address}/sandbox`, { sandbox: false }, regulator)).sandbox, false, "promotion");
      expectEqual((await api("GET", `/v1/requests/${qr.requestId}?principal=${stranger.wallet.address}`)).status, 200, "the notice after promotion");
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
      const consentEvents = events.filter((e): e is Extract<WsEvent, { event: "consent.updated" }> => e.event === "consent.updated" && e.principal === user.address);
      for (const code of [GRANTED, "credit_check"]) {
        expectEqual(consentEvents.filter((e) => e.purposeCode === code).map((e) => e.status), ["Active", "Withdrawn"], `consent.updated for ${code} on the wallet's feed`);
      }
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

    await step("the demo PAN appears nowhere: not in any response, event, log or database file", async () => {
      // Everything the run said or stored, as text. The searches are real: the same text must contain what we expect to find.
      const databases = [stack.dbFile, join(repoRoot, "core/data/sammati.sqlite"), stack.vaultFile, join(repoRoot, "processor/data/processor.sqlite")];
      const files = databases.flatMap((f) => ["", "-wal", "-shm"].map((x) => f + x)).filter((f) => existsSync(f));
      const haystacks: Array<[string, string]> = [
        ["HTTP responses", traffic.join("\n")],
        ["WebSocket events", events.map((e) => JSON.stringify(e)).join("\n")],
        ["the portal's live feed", portalFrames.map((f) => JSON.stringify(f)).join("\n")],
        ...(existsSync(stack.logFile) && how === "started" ? ([["the stack's output", readFileSync(stack.logFile, "latin1")]] as Array<[string, string]>) : []),
        ...files.map((f): [string, string] => [`database file ${f}`, readFileSync(f, "latin1")]),
      ];
      check(traffic.length > 20 && events.length > 10, "the search saw too little traffic to mean anything");
      check(haystacks.some(([, text]) => text.includes("approved")), "control failed: the captured traffic does not contain the loan decision");
      check(files.some((f) => /processor/.test(f)), "control failed: the Processor's database file was not found, so it was not searched");
      for (const [where, text] of haystacks) {
        for (const secret of [PLAINTEXT, DEMO_PROFILE.incomeBand]) {
          if (text.includes(secret)) fail(`"${secret}" was found in ${where}`);
        }
      }
      if (how === "reused") console.log("    (the stack was already running: its console output was not captured, so it was not searched)");
    });

    const recordTo = process.env.E2E_RECORD_FLOW;
    if (recordTo) {
      await step(`record the flow for the Data Flow Inspector's replay (${recordTo})`, async () => {
        const kept = events
          .map((event, i) => ({ event, at: eventTimes[i]! }))
          .filter(({ event }) => /^(vault|processor)\./.test(event.event) && (event as { principal?: string }).principal === user.address);
        check(kept.length >= 8 && recorded.staffView && recorded.vaultRow, "the run did not produce a complete flow to record");
        const first = kept[0]!.at;
        const file = {
          v: 1,
          recordedAt: new Date().toISOString(),
          note: "Recorded from a real `pnpm e2e` run: real events, the real ciphertext row, QuickLoan's real admin answer.",
          events: kept.map(({ event, at }) => ({ t: at - first, event })),
          vaultRow: recorded.vaultRow,
          staffView: recorded.staffView,
        };
        const text = JSON.stringify(file, null, 2) + "\n";
        // The recording is played in a browser, so it gets the same search as everything else this run produced.
        if (text.includes(PLAINTEXT) || text.includes(DEMO_PROFILE.incomeBand)) fail("the recording contains the demo profile");
        const target = resolve(repoRoot, recordTo);
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, text);
      });
    }
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
