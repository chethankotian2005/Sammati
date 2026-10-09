// `pnpm e2e:remote` (trd.md §10.9): the public-API flow against services that are already running, e.g. the Render
// deployment. It starts nothing, reads no database and needs no DEV_TOOLS, so it cannot run `dev:tamper` or search files.
//
//   CORE_URL=https://… PROCESSOR_URL=https://… REGULATOR_KEY=… [QUICKLOAN_URL=…] [COMPANY2_URL=…] [PUBLIC_CORE_URL=…] pnpm e2e:remote
//
// healthz of every service → the Processor's key → a throwaway company applies, the regulator approves → a headless
// wallet grants a consent on chain → the company's server (the gateway SDK) answers ALLOWED → an unconsented purpose is
// BLOCKED → the wallet withdraws → BLOCKED → the processor acknowledges → the log is anchored and the Auditor's verify is
// clean. It leaves one throwaway company in the deployment's directory: use a staging deployment, or accept that.
import { Wallet } from "ethers";
import { API_KEY_HEADER, GRANT_CONSENT_TYPE, REGULATOR_KEY_HEADER, WITHDRAW_CONSENT_TYPE, purposeIdOf, type ApplicationInput, type CascadeResponse, type Hex, type RequestNotice, type VerifyResponse } from "@sammati/shared";
import { TEST_COMPANIES } from "@sammati/test-fixtures";
import { startSampleApp } from "../examples/quickstart";

function need(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`${name} is required (see docs/deploy-guide.md §6).`);
    process.exit(1);
  }
  return value.replace(/\/+$/, "");
}

const CORE = need("CORE_URL");
const PROCESSOR = need("PROCESSOR_URL");
const REGULATOR = { [REGULATOR_KEY_HEADER]: need("REGULATOR_KEY") };
// What the QR payload must say: Core's own public address. It is CORE_URL unless a proxy or tunnel makes them differ.
const PUBLIC_CORE = (process.env.PUBLIC_CORE_URL?.trim() || CORE).replace(/\/+$/, "");
const EXTRA = [["QuickLoan", process.env.QUICKLOAN_URL], ["the second company site", process.env.COMPANY2_URL]] as const;
const TIMEOUT_MS = Number(process.env.E2E_TIMEOUT_MS ?? 120_000); // a public chain mines in seconds, not milliseconds

const GRANTED = "marketing"; // has a downstream processor, so the cascade has someone to tell
const UNCONSENTED = "bureau_share";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const hour = () => Math.floor(Date.now() / 1000) + 3600;

class RemoteError extends Error {}
const check = (ok: unknown, message: string): void => {
  if (!ok) throw new RemoteError(message);
};

async function api<T>(method: string, base: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<{ status: number; json: T }> {
  const res = await fetch(base + path, {
    method,
    headers: { ...(body ? { "content-type": "application/json" } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(60_000),
  });
  const text = await res.text();
  return { status: res.status, json: (text ? JSON.parse(text) : null) as T };
}

async function core<T>(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<T> {
  const { status, json } = await api<T>(method, CORE, path, body, headers);
  check(status >= 200 && status < 300, `${method} ${path} answered ${status}: ${JSON.stringify(json)}`);
  return json;
}

async function until<T>(what: string, read: () => Promise<T | undefined>): Promise<T> {
  const deadline = Date.now() + TIMEOUT_MS;
  for (;;) {
    const value = await read();
    if (value !== undefined) return value;
    check(Date.now() < deadline, `timed out after ${TIMEOUT_MS / 1000}s waiting for ${what}`);
    await sleep(1000);
  }
}

let stepNumber = 0;
async function step<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const started = Date.now();
  try {
    const value = await fn();
    console.log(`  ok ${String(++stepNumber).padStart(2)}  ${name} (${((Date.now() - started) / 1000).toFixed(1)}s)`);
    return value;
  } catch (err) {
    console.error(`FAILED step ${++stepNumber}: ${name}\n  ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
}

console.log(`Public-API flow against Core ${CORE} and the Processor ${PROCESSOR}`);

await step("every service answers /healthz with ok", async () => {
  const targets: Array<[string, string]> = [["Core", CORE], ["the Processor", PROCESSOR]];
  for (const [name, url] of EXTRA) if (url) targets.push([name, url.replace(/\/+$/, "")]);
  for (const [name, url] of targets) {
    const res = await fetch(`${url}/healthz`, { signal: AbortSignal.timeout(90_000) }); // the first call may wake a sleeping instance
    check(res.status === 200 && (await res.text()) === "ok", `${name} did not answer /healthz with ok (${res.status})`);
  }
});

await step("the Processor publishes its key, and says it is a simulated enclave", async () => {
  const pub = (await api<{ publicKey: string; mode: string }>("GET", PROCESSOR, "/v1/processor/pubkey")).json;
  check(/^0x[0-9a-f]{64}$/i.test(pub.publicKey) && pub.mode === "simulated-enclave", `unexpected key answer ${JSON.stringify(pub)}`);
});

const company = TEST_COMPANIES[0]!;
const suffix = Date.now().toString(36).slice(-5);
const { fid, apiKey } = await step("a throwaway company applies and the regulator approves it", async () => {
  const input: ApplicationInput = {
    name: `Remote${suffix}`,
    sector: company.sector,
    contactEmail: `remote-${suffix}@example.test`,
    purposes: company.purposes.map((p) => ({ code: p.code, title: p.title, description: p.description, dataCategories: p.dataCategories, retentionDays: p.retentionDays, sharesThirdParty: p.sharesThirdParty, required: p.required })),
    processors: company.processors.map((p) => ({ name: p.name, purposeCode: p.purposeCode })),
  };
  const sent = await core<{ applicationId: string }>("POST", "/v1/registrations", input);
  const approved = await core<{ fiduciary: { address: Hex } }>("POST", `/v1/regulator/registrations/${sent.applicationId}/approve`, { note: "e2e:remote", sandbox: false }, REGULATOR);
  const status = await core<{ result: { apiKey: string | null } }>("GET", `/v1/registrations/${sent.applicationId}`);
  check(status.result.apiKey, "the approved company was not given an API key");
  return { fid: approved.fiduciary.address, apiKey: status.result.apiKey! };
});
const companyKey = { [API_KEY_HEADER]: apiKey };

await step("the company's key identifies it, and a missing key is refused", async () => {
  const me = await core<{ fiduciary: string }>("GET", "/v1/gateway/whoami", undefined, companyKey);
  check(me.fiduciary.toLowerCase() === fid.toLowerCase(), "whoami named another company");
  check((await api("GET", CORE, "/v1/gateway/whoami")).status === 401, "a call without a key was not refused with 401");
});

const user = Wallet.createRandom();
const app = await startSampleApp({ coreUrl: CORE, fiduciary: fid, apiKey, purpose: GRANTED });
const profile = (principal: string) => fetch(`${app.url}/customers/1/profile`, { headers: { "x-sammati-principal": principal } });

try {
  const notice = await step("the company creates a request and the wallet fetches its notice", async () => {
    const request = await core<{ requestId: string; qrPayload: { core: string } }>("POST", `/v1/fiduciaries/${fid}/requests`, { purposes: [GRANTED], customerAlias: "Customer #1" }, companyKey);
    check(request.qrPayload.core.replace(/\/+$/, "") === PUBLIC_CORE, `the QR payload points at ${request.qrPayload.core}, not at Core's public URL ${PUBLIC_CORE}`);
    return core<RequestNotice>("GET", `/v1/requests/${request.requestId}?principal=${user.address}`);
  });

  await step("the wallet signs and the relayer grants the consent on chain", async () => {
    const message = { principal: user.address, fiduciary: fid, purposeId: purposeIdOf(fid, GRANTED), expiresAt: hour() + 86_400, noticeHash: notice.noticeHash, nonce: notice.nonce, deadline: hour() };
    const signature = await user.signTypedData(notice.domain, { GrantConsent: [...GRANT_CONSENT_TYPE] }, message);
    const granted = await core<{ status: string }>("POST", "/v1/consents/grant", { request: message, signature });
    check(granted.status === "confirmed", "the grant was not confirmed");
  });

  await step("the company's server answers ALLOWED for the consented purpose", async () => {
    await until("ALLOWED", async () => ((await profile(user.address)).status === 200 ? true : undefined));
  });

  await step("a purpose never consented to is BLOCKED (NO_CONSENT)", async () => {
    const state = await core<{ valid: boolean; reason?: string }>("GET", `/v1/gateway/consent-state?principal=${user.address}&fid=${fid}&purpose=${UNCONSENTED}`, undefined, companyKey);
    check(!state.valid && state.reason === "NO_CONSENT", `expected NO_CONSENT, got ${JSON.stringify(state)}`);
  });

  await step("the wallet withdraws and the same request is BLOCKED (CONSENT_WITHDRAWN)", async () => {
    const consents = await core<{ nonce: string; domain: RequestNotice["domain"] }>("GET", `/v1/principals/${user.address}/consents`);
    const message = { principal: user.address, fiduciary: fid, purposeId: purposeIdOf(fid, GRANTED), nonce: consents.nonce, deadline: hour() };
    const signature = await user.signTypedData(consents.domain, { WithdrawConsent: [...WITHDRAW_CONSENT_TYPE] }, message);
    await core("POST", "/v1/consents/withdraw", { request: message, signature });
    await until("BLOCKED", async () => {
      const res = await profile(user.address);
      return res.status === 451 && ((await res.json()) as { code: string }).code === "CONSENT_WITHDRAWN" ? true : undefined;
    });
  });

  await step("the processor acknowledges the withdrawal on chain", async () => {
    await until("the acknowledgement", async () => {
      const cascade = await core<CascadeResponse>("GET", `/v1/principals/${user.address}/cascade/${purposeIdOf(fid, GRANTED)}`);
      return cascade.processors.length > 0 && cascade.processors.every((p) => p.ackedAt !== null) ? true : undefined;
    });
  });

  await step("the access log is anchored on chain and the Auditor's verify is clean", async () => {
    await app.close(); // flushes the SDK's queued log entries
    await until("an anchored batch", async () => {
      const log = await core<{ items: Array<{ batchIndex: number | null }> }>("GET", `/v1/fiduciaries/${fid}/access?limit=50`, undefined, companyKey);
      return log.items.length > 0 && log.items.every((e) => e.batchIndex !== null) ? true : undefined;
    });
    const verified = await core<VerifyResponse>("POST", `/v1/audit/verify/${fid}`, undefined, REGULATOR);
    check(verified.ok, `verify was not clean: ${JSON.stringify(verified).slice(0, 300)}`);
  });
} finally {
  await app.close().catch(() => undefined);
}

console.log(`\nAll ${stepNumber} steps passed against ${CORE}. A throwaway company (Remote${suffix}, ${fid}) was left in its directory.`);
console.log("Not covered here, by design: dev:tamper (it edits a local file) and the search of database files for plaintext (it needs the files).");
process.exit(0);
