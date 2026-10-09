// Company onboarding (prd.md R-01 to R-03, trd.md §6.12): applications, the regulator's decision, the registration on
// chain, API keys, the sandbox's test customers and the rate limits that guard the company-facing routes.
import { createHash, randomBytes } from "node:crypto";
import { Contract, Wallet, parseEther, type TransactionReceipt } from "ethers";
import {
  DEFAULT_COMPANY_COLOR,
  descHash,
  fiduciaryMetaHash,
  processorMetaHash,
  purposeIdOf,
  slugOf,
  validateApplication,
  type ApplicationStatus,
  type ApplicationView,
  type ApproveBody,
  type ApproveResponse,
  type Hex,
  type RegistrationCreated,
  type RegistrationStatusResponse,
  type RejectBody,
  type TestPrincipal,
  type WsEvent,
} from "@sammati/shared";
import type { Config } from "../config";
import { HttpError, badRequest } from "../errors";
import { now } from "../clock";
import { hashApiKey, newApiKey } from "./apikeys";
import type { Chain } from "./chain";
import type { Db } from "./db";
import type { Indexer } from "./indexer";
import { addr, type FiduciaryRow, type Repo } from "./repo";

const MAX_NOTE = 280;
const HOUR_MS = 3_600_000;
const MINUTE_MS = 60_000;
const ZERO = 0n;
const PROCESSOR_FUNDING_DIVISOR = 10n;

const lc = (s: string): string => s.toLowerCase();

type Row = Record<string, unknown>;
/** A processor as stored on the application: the address appears once approval has started. */
type StoredProcessor = { name: string; purposeCode: string; address?: Hex };

/** Counts events per key over a rolling window and says how long to wait when the limit is reached. */
export class RollingLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(private readonly clockMs: () => number = Date.now) {}

  /** Records a hit, or returns the seconds to wait if the key is already at `limit` within `windowMs`. */
  take(key: string, limit: number, windowMs: number): number {
    const t = this.clockMs();
    const recent = (this.hits.get(key) ?? []).filter((x) => t - x < windowMs);
    if (recent.length >= limit) {
      this.hits.set(key, recent);
      return Math.max(1, Math.ceil((windowMs - (t - recent[0]!)) / 1000));
    }
    recent.push(t);
    this.hits.set(key, recent);
    return 0;
  }
}

function tooFast(message: string, retryAfter: number, code = "RATE_LIMITED"): HttpError {
  const err = new HttpError(429, code, message);
  (err as HttpError & { retryAfter?: number }).retryAfter = retryAfter;
  return err;
}

function cleanNote(raw: unknown, required: boolean): string | null {
  if (raw === undefined || raw === null || raw === "") {
    if (required) throw badRequest('"note" is required', "BAD_NOTE");
    return null;
  }
  if (typeof raw !== "string") throw badRequest('"note" must be text', "BAD_NOTE");
  // eslint-disable-next-line no-control-regex
  const note = raw.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  if (note.length > MAX_NOTE) throw badRequest(`"note" must be at most ${MAX_NOTE} characters`, "BAD_NOTE");
  if (required && note === "") throw badRequest('"note" is required', "BAD_NOTE");
  return note === "" ? null : note;
}

export class Onboarding {
  private readonly applyLimiter = new RollingLimiter();
  private readonly gatewayLimiter = new RollingLimiter();
  /** API keys waiting for the applicant's one read, by application id. Memory only: a key is never written down. */
  private readonly undelivered = new Map<string, string>();
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly db: Db,
    private readonly repo: Repo,
    private readonly chain: Chain,
    private readonly config: Config,
    private readonly indexer: Indexer,
    private readonly publish: (event: WsEvent) => void,
    private readonly log: (message: string) => void = console.warn,
  ) {}

  // ------------------------------------------------------------ R-01: applying

  submit(raw: unknown, clientId: string): RegistrationCreated {
    const checked = validateApplication(raw);
    if (!checked.ok) throw new HttpError(400, "BAD_APPLICATION", `${checked.field}: ${checked.message}`);
    const input = checked.value;
    const slug = slugOf(input.name);

    const wait = this.applyLimiter.take(clientId, this.config.registrationsPerHour, HOUR_MS);
    if (wait > 0) throw tooFast(`Too many applications from this address. Try again in ${Math.ceil(wait / 60)} minutes.`, wait);
    const pending = (this.db.prepare("SELECT COUNT(*) AS n FROM fiduciary_applications WHERE status = 'pending'").get() as { n: number }).n;
    if (pending >= this.config.maxPendingApplications) {
      throw new HttpError(429, "TOO_MANY_PENDING", "The regulator has too many applications waiting. Try again later.");
    }
    if (this.slugTaken(slug)) throw new HttpError(409, "NAME_TAKEN", `A company called "${input.name}" is already registered or applying. Choose another name.`);

    const id = randomBytes(16).toString("hex");
    const passwordHash = input.password ? createHash("sha256").update(input.password, "utf8").digest("hex") : null;
    this.db
      .prepare(
        `INSERT INTO fiduciary_applications (id, name, slug, sector, contact_email, password_hash, purposes, processors, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
      )
      .run(id, input.name, slug, input.sector, input.contactEmail, passwordHash, JSON.stringify(input.purposes), JSON.stringify(input.processors), now());
    return { applicationId: id, status: "pending" };
  }

  /** A slug is taken by a company, or by an application that is still pending or already approved. */
  private slugTaken(slug: string): boolean {
    const company = this.db.prepare("SELECT 1 FROM fiduciaries WHERE slug = ?").get(slug);
    const application = this.db.prepare("SELECT 1 FROM fiduciary_applications WHERE slug = ? AND status <> 'rejected'").get(slug);
    return company !== undefined || application !== undefined;
  }

  private row(id: string): Row {
    const r = this.db.prepare("SELECT * FROM fiduciary_applications WHERE id = ?").get(id) as Row | undefined;
    if (!r) throw new HttpError(404, "APPLICATION_NOT_FOUND", "No such application");
    return r;
  }

  private view(r: Row): ApplicationView {
    return {
      id: r.id as string,
      name: r.name as string,
      slug: r.slug as string,
      sector: r.sector as string,
      contactEmail: (r.contact_email as string | null) ?? null,
      purposes: JSON.parse(r.purposes as string) as ApplicationView["purposes"],
      processors: (JSON.parse(r.processors as string) as StoredProcessor[]).map((p) => ({ name: p.name, purposeCode: p.purposeCode })),
      status: r.status as ApplicationStatus,
      note: (r.note as string | null) ?? null,
      fiduciary: (r.fiduciary as Hex | null) ?? null,
      sandbox: r.sandbox === null ? null : r.sandbox === 1,
      createdAt: r.created_at as number,
      decidedAt: (r.decided_at as number | null) ?? null,
    };
  }

  /** What the applicant sees. The API key comes out once, the first time it is read after approval. */
  status(id: string): RegistrationStatusResponse {
    const r = this.row(id);
    const app = this.view(r);
    let result: RegistrationStatusResponse["result"] = null;
    if (app.status === "approved" && app.fiduciary) {
      const f = this.repo.fiduciary(app.fiduciary);
      const apiKey = this.undelivered.get(id) ?? null;
      this.undelivered.delete(id);
      result = { fiduciary: f.address, slug: f.slug, sandbox: f.sandbox, apiKey, apiKeyShown: apiKey === null };
    }
    return { applicationId: id, name: app.name, sector: app.sector, status: app.status, note: app.note, createdAt: app.createdAt, decidedAt: app.decidedAt, result };
  }

  // ------------------------------------------------------------ R-02: the regulator

  list(status?: string): ApplicationView[] {
    if (status !== undefined && status !== "pending" && status !== "approved" && status !== "rejected") {
      throw badRequest('"status" must be pending, approved or rejected');
    }
    const rows = (status
      ? this.db.prepare("SELECT * FROM fiduciary_applications WHERE status = ? ORDER BY created_at DESC, rowid DESC").all(status)
      : this.db.prepare("SELECT * FROM fiduciary_applications ORDER BY created_at DESC, rowid DESC").all()) as Row[];
    return rows.map((r) => this.view(r));
  }

  reject(id: string, body: Partial<RejectBody>): ApplicationView {
    const note = cleanNote(body.note, true);
    const r = this.row(id);
    if (r.status !== "pending") throw new HttpError(409, "ALREADY_DECIDED", "This application has already been decided");
    // The email was only for this application: it goes with the decision.
    this.db.prepare("UPDATE fiduciary_applications SET status = 'rejected', note = ?, contact_email = NULL, decided_at = ? WHERE id = ?").run(note, now(), id);
    return this.view(this.row(id));
  }

  /** One approval at a time: they share the admin account's transaction nonce. */
  approve(id: string, body: ApproveBody): Promise<ApproveResponse> {
    const run = () => this.approveNow(id, body);
    const result = this.queue.then(run, run);
    this.queue = result.catch(() => undefined);
    return result;
  }

  private async approveNow(id: string, body: ApproveBody): Promise<ApproveResponse> {
    const note = cleanNote(body.note, false);
    if (body.sandbox !== undefined && typeof body.sandbox !== "boolean") throw badRequest('"sandbox" must be true or false');
    const sandbox = body.sandbox ?? true;
    const r = this.row(id);
    if (r.status !== "pending") throw new HttpError(409, "ALREADY_DECIDED", "This application has already been decided");
    const app = this.view(r);

    // Keys first, and written down, so a retry after a failure registers the very same addresses.
    const { company, processors } = this.keysFor(id, r);
    const provider = this.chain.provider;
    const admin = new Wallet(this.config.adminKey, provider);
    const registry = this.chain.registryContract;
    const hashes: Hex[] = [];
    const receipts: TransactionReceipt[] = [];
    let step = "start";
    const send = async (as: Wallet, method: string, args: unknown[]): Promise<void> => {
      const tx = await (registry.connect(as) as Contract).getFunction(method)(...args);
      const receipt = (await tx.wait()) as TransactionReceipt;
      hashes.push(receipt.hash as Hex);
      receipts.push(receipt);
    };
    try {
      step = "funding the company's account";
      await this.fund(admin, company.address, parseEther(this.config.registrationFundingEth));
      for (const p of processors) {
        step = `funding ${p.name}'s account`;
        await this.fund(admin, p.wallet.address, parseEther(this.config.registrationFundingEth) / PROCESSOR_FUNDING_DIVISOR);
      }

      step = "registering the company";
      if (!(await registry.getFunction("isFiduciary")(company.address))) {
        await send(admin, "registerFiduciary", [company.address, app.name, fiduciaryMetaHash({ name: app.name, sector: app.sector })]);
      }
      for (const p of app.purposes) {
        step = `registering the purpose ${p.code}`;
        const purposeId = purposeIdOf(company.address, p.code);
        const owner = (await registry.getFunction("getPurpose")(purposeId)).fiduciary as string;
        if (BigInt(owner) === ZERO) {
          await send(company, "registerPurpose", [purposeId, descHash(p.description), p.retentionDays, p.sharesThirdParty]);
        }
      }
      for (const p of processors) {
        step = `registering the processor ${p.name}`;
        const purposeId = purposeIdOf(company.address, p.purposeCode);
        if (!(await registry.getFunction("isProcessor")(purposeId, p.wallet.address))) {
          await send(company, "registerProcessor", [purposeId, p.wallet.address, processorMetaHash({ name: p.name })]);
        }
      }
    } catch (err) {
      const why = err instanceof Error ? err.message.split("\n")[0] : String(err);
      this.log(`[onboarding] approving ${app.name} failed while ${step}: ${why}`);
      throw new HttpError(502, "REGISTRATION_FAILED", `Registration failed while ${step}. Nothing is visible yet: press Approve again.`);
    }

    // Everything is on chain: now the company becomes visible, all at once.
    const apiKey = newApiKey();
    const decidedAt = now();
    const registeredTx = hashes[0] ?? null;
    this.db.transaction(() => {
      this.db
        .prepare("INSERT INTO fiduciaries (address, name, sector, color, registered_tx, slug, sandbox) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .run(company.address, app.name, app.sector, DEFAULT_COMPANY_COLOR, registeredTx, app.slug, sandbox ? 1 : 0);
      this.insertDirectory(company.address, app, processors);
      this.db.prepare("INSERT INTO fiduciary_credentials (fiduciary, api_key_hash, issued_at) VALUES (?, ?, ?)").run(company.address, hashApiKey(apiKey), decidedAt);
      if (r.password_hash && r.contact_email) {
        this.db.prepare("INSERT OR IGNORE INTO console_operators (email, password_hash, created_at) VALUES (?, ?, ?)").run(r.contact_email, r.password_hash, decidedAt);
        this.db.prepare("INSERT INTO fiduciary_operators (fiduciary, operator_email) VALUES (?, ?)").run(company.address, r.contact_email);
      }
      this.db
        .prepare("UPDATE fiduciary_applications SET status = 'approved', note = ?, contact_email = NULL, sandbox = ?, decided_at = ? WHERE id = ?")
        .run(note, sandbox ? 1 : 0, decidedAt, id);
    })();
    this.undelivered.set(id, apiKey);

    for (const receipt of receipts) {
      await this.indexer.ingestReceipt(receipt).catch(() => undefined); // the poller picks them up otherwise
    }
    this.publish({ event: "fiduciary.registered", fiduciary: company.address, slug: app.slug, name: app.name, sandbox, at: decidedAt });
    return { application: this.view(this.row(id)), fiduciary: { address: company.address, slug: app.slug }, txHashes: hashes };
  }

  /** Generates (once) and stores the company's key and its processors' keys. A retry finds them again. */
  private keysFor(id: string, r: Row): { company: Wallet; processors: Array<{ name: string; purposeCode: string; wallet: Wallet }> } {
    const stored = JSON.parse(r.processors as string) as StoredProcessor[];
    const provider = this.chain.provider;
    return this.db.transaction(() => {
      let companyAddress = (r.fiduciary as Hex | null) ?? null;
      let company: Wallet;
      if (companyAddress) {
        company = new Wallet(this.repo.fiduciaryKey(companyAddress)!, provider);
      } else {
        company = new Wallet(Wallet.createRandom().privateKey, provider);
        companyAddress = addr(company.address);
        this.db.prepare("INSERT INTO fiduciary_keys (address, private_key, created_at) VALUES (?, ?, ?)").run(companyAddress, company.privateKey, now());
        this.db.prepare("UPDATE fiduciary_applications SET fiduciary = ? WHERE id = ?").run(companyAddress, id);
      }
      const processors = stored.map((p) => {
        if (p.address) return { name: p.name, purposeCode: p.purposeCode, wallet: new Wallet(this.repo.processorKey(p.address)!, provider) };
        const w = new Wallet(Wallet.createRandom().privateKey, provider);
        p.address = addr(w.address);
        this.db.prepare("INSERT INTO processor_keys (address, private_key, created_at) VALUES (?, ?, ?)").run(p.address, w.privateKey, now());
        return { name: p.name, purposeCode: p.purposeCode, wallet: w };
      });
      this.db.prepare("UPDATE fiduciary_applications SET processors = ? WHERE id = ?").run(JSON.stringify(stored), id);
      return { company, processors };
    })();
  }

  private async fund(admin: Wallet, to: string, target: bigint): Promise<void> {
    const balance = await this.chain.provider.getBalance(to);
    if (balance >= target) return;
    await (await admin.sendTransaction({ to, value: target - balance })).wait();
  }

  private insertDirectory(
    company: Hex,
    app: ApplicationView,
    processors: Array<{ name: string; purposeCode: string; wallet: Wallet }>,
  ): void {
    const insertP = this.db.prepare(
      `INSERT INTO purposes (id, fiduciary, code, title_en, title_hi, title_kn, desc_en, desc_hi, desc_kn,
         data_categories, retention_days, shares_third_party, desc_hash, required)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const p of app.purposes) {
      insertP.run(
        purposeIdOf(company, p.code), company, p.code,
        p.title.en, p.title.hi, p.title.kn, p.description.en, p.description.hi, p.description.kn,
        JSON.stringify(p.dataCategories), p.retentionDays, p.sharesThirdParty ? 1 : 0, descHash(p.description), p.required ? 1 : 0,
      );
    }
    const insertProc = this.db.prepare("INSERT INTO processors (address, name, purpose_id) VALUES (?, ?, ?)");
    for (const p of processors) insertProc.run(addr(p.wallet.address), p.name, purposeIdOf(company, p.purposeCode));
  }

  // ------------------------------------------------------------ R-03: sandbox, keys, test customers

  setSandbox(fiduciary: string, sandbox: unknown): { fiduciary: Hex; sandbox: boolean } {
    if (typeof sandbox !== "boolean") throw badRequest('"sandbox" must be true or false');
    const f = this.repo.fiduciary(fiduciary);
    this.db.prepare("UPDATE fiduciaries SET sandbox = ? WHERE address = ?").run(sandbox ? 1 : 0, f.address);
    this.publish({ event: "fiduciary.updated", fiduciary: f.address, slug: f.slug, sandbox, at: now() });
    return { fiduciary: f.address, sandbox };
  }

  /** The old key stops working at once; the new one waits for the applicant's next read of their status page. */
  reissueKey(fiduciary: string): void {
    const f = this.repo.fiduciary(fiduciary);
    const app = this.db.prepare("SELECT id FROM fiduciary_applications WHERE fiduciary = ? AND status = 'approved'").get(f.address) as { id: string } | undefined;
    if (!app) throw new HttpError(404, "FIDUCIARY_NOT_FOUND", "This company has no approved registration");
    const apiKey = newApiKey();
    this.db.prepare("UPDATE fiduciary_credentials SET api_key_hash = ?, issued_at = ? WHERE fiduciary = ?").run(hashApiKey(apiKey), now(), f.address);
    this.undelivered.set(app.id, apiKey);
  }

  /** Lets a person sign in to this company's console: for a company approved without a console login. */
  setOperator(fiduciary: string, raw: unknown): void {
    const body = raw as { email?: unknown; password?: unknown } | null;
    const email = typeof body?.email === "string" ? body.email.trim() : "";
    const password = typeof body?.password === "string" ? body.password : "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 120) throw badRequest("email must look like an email address");
    if (password.length < 8) throw badRequest("password must be at least 8 characters");
    const f = this.repo.fiduciary(fiduciary);
    const hash = createHash("sha256").update(password, "utf8").digest("hex");
    this.db.transaction(() => {
      this.db.prepare("INSERT INTO console_operators (email, password_hash, created_at) VALUES (?, ?, ?) ON CONFLICT (email) DO UPDATE SET password_hash = excluded.password_hash").run(email, hash, now());
      this.db.prepare("INSERT OR IGNORE INTO fiduciary_operators (fiduciary, operator_email) VALUES (?, ?)").run(f.address, email);
    })();
  }

  isTester(principal: string): boolean {
    const p = lc(principal);
    if (this.config.sandboxTestPrincipals.includes(p)) return true;
    return this.db.prepare("SELECT 1 FROM sandbox_testers WHERE principal = ?").get(p) !== undefined;
  }

  /** A sandbox company may deal only with test customers; a live one with anyone. */
  mayDealWith(f: Pick<FiduciaryRow, "sandbox">, principal: string | null): boolean {
    return !f.sandbox || (principal !== null && this.isTester(principal));
  }

  testers(): TestPrincipal[] {
    const rows = this.db
      .prepare(
        `SELECT t.principal, t.added_at, i.handle FROM sandbox_testers t LEFT JOIN identities i ON i.principal = t.principal
         ORDER BY t.added_at DESC, t.rowid DESC`,
      )
      .all() as Row[];
    return rows.map((r) => ({ principal: r.principal as Hex, handle: (r.handle as string | null) ?? null, addedAt: r.added_at as number }));
  }

  addTester(body: { handle?: unknown; principal?: unknown }): TestPrincipal {
    let principal: string;
    if (typeof body.handle === "string") {
      const h = this.db.prepare("SELECT principal FROM identities WHERE handle = ?").get(body.handle.trim().toLowerCase()) as { principal: string } | undefined;
      if (!h) throw new HttpError(404, "HANDLE_NOT_FOUND", "No wallet has registered that Sammati ID");
      principal = h.principal;
    } else if (typeof body.principal === "string") {
      principal = lc(addr(body.principal));
    } else {
      throw badRequest('Give a "handle" or a "principal"');
    }
    this.db.prepare("INSERT OR IGNORE INTO sandbox_testers (principal, added_at) VALUES (?, ?)").run(principal, now());
    return this.testers().find((t) => lc(t.principal) === principal)!;
  }

  removeTester(principal: string): void {
    this.db.prepare("DELETE FROM sandbox_testers WHERE principal = ?").run(lc(addr(principal)));
  }

  /** After a reset the database is empty: keys waiting for a read and counted calls belong to a company that no longer exists. */
  forget(): void {
    this.undelivered.clear();
  }

  // ------------------------------------------------------------ the company-facing rate limit

  /** Counts a call made with this company's key; refuses it past `GATEWAY_RATE_PER_MINUTE`. */
  checkGatewayRate(fiduciary: string): void {
    const wait = this.gatewayLimiter.take(lc(fiduciary), this.config.gatewayRatePerMinute, MINUTE_MS);
    if (wait > 0) throw tooFast(`This API key is making too many calls. Try again in ${wait} seconds.`, wait);
  }
}
