import { describe, expect, it } from "vitest";
import { Wallet } from "ethers";
import { submitMessage, handleOf } from "@sammati/shared/src/envelope";
import { decideLoan } from "../src/rules";
import { ApiFailure } from "../src/service";
import { MC_KEY, MEDICARE, PAN, QL_KEY, QUICKLOAN, rig } from "./rig";

const fails = async (p: Promise<unknown>): Promise<ApiFailure> => {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(ApiFailure);
    return e as ApiFailure;
  }
  throw new Error("expected a failure");
};

describe("loan rules", () => {
  it.each([
    [{ pan: PAN, incomeBand: "6-9 LPA", score: 742 }, { decision: "approved", limit: 300000, reasonCodes: ["SCORE_FAIR"] }],
    [{ pan: PAN, incomeBand: "6-9 LPA", score: 750 }, { decision: "approved", limit: 500000, reasonCodes: ["SCORE_GOOD"] }],
    [{ pan: PAN, incomeBand: "9+ LPA", score: 650 }, { decision: "approved", limit: 600000, reasonCodes: ["SCORE_FAIR"] }],
    [{ pan: PAN, incomeBand: "0-3 LPA", score: 800 }, { decision: "approved", limit: 100000, reasonCodes: ["SCORE_GOOD"] }],
    [{ pan: PAN, incomeBand: "3-6 LPA", score: 649 }, { decision: "declined", limit: null, reasonCodes: ["SCORE_LOW"] }],
    [{ pan: "abcde1234f", incomeBand: "6-9 LPA", score: 800 }, { decision: "declined", limit: null, reasonCodes: ["PAN_INVALID"] }],
    [{ pan: PAN, incomeBand: "rich", score: 800 }, { decision: "declined", limit: null, reasonCodes: ["INCOME_UNKNOWN"] }],
    [{ pan: PAN, incomeBand: "6-9 LPA", score: 700.5 }, { decision: "declined", limit: null, reasonCodes: ["SCORE_LOW"] }],
    [{ pan: PAN, incomeBand: "__proto__", score: 800 }, { decision: "declined", limit: null, reasonCodes: ["INCOME_UNKNOWN"] }],
    ["not an object", { decision: "declined", limit: null, reasonCodes: ["PAN_INVALID"] }],
    [{ pan: PAN, incomeBand: "6-9 LPA", employment: "salaried", score: 742 }, { decision: "approved", limit: 300000, reasonCodes: ["SCORE_FAIR"] }],
    [{ pan: PAN, incomeBand: "6-9 LPA", employment: "self-employed", score: 800 }, { decision: "approved", limit: 500000, reasonCodes: ["SCORE_GOOD"] }],
    [{ pan: PAN, incomeBand: "6-9 LPA", employment: "student", score: 800 }, { decision: "declined", limit: null, reasonCodes: ["EMPLOYMENT_INELIGIBLE"] }],
    [{ pan: PAN, incomeBand: "6-9 LPA", employment: "unemployed" }, { decision: "declined", limit: null, reasonCodes: ["EMPLOYMENT_INELIGIBLE"] }],
    [{ pan: PAN, incomeBand: "6-9 LPA", employment: "astronaut", score: 800 }, { decision: "declined", limit: null, reasonCodes: ["EMPLOYMENT_UNKNOWN"] }],
    [{ pan: PAN, incomeBand: "6-9 LPA", employment: 7, score: 800 }, { decision: "declined", limit: null, reasonCodes: ["EMPLOYMENT_UNKNOWN"] }],
    // manual entry has no credit score: the Processor assumes one, and says so in the answer
    [{ pan: PAN, incomeBand: "6-9 LPA", employment: "salaried" }, { decision: "approved", limit: 300000, reasonCodes: ["SCORE_FAIR", "SCORE_ASSUMED"] }],
    [{ pan: PAN, incomeBand: "9+ LPA", employment: "salaried" }, { decision: "approved", limit: 600000, reasonCodes: ["SCORE_FAIR", "SCORE_ASSUMED"] }],
    [{ pan: PAN, incomeBand: "6-9 LPA", employment: "salaried", score: "high" }, { decision: "declined", limit: null, reasonCodes: ["SCORE_LOW"] }],
  ])("%j", (profile, expected) => {
    expect(decideLoan(profile)).toEqual(expected);
  });
});

describe("submit (V-02)", () => {
  it("stores ciphertext only, after verifying the signature and the consent", async () => {
    const r = rig();
    const { handle, created, body } = await r.submitted();
    expect(created).toBe(true);
    expect(handle).toBe(handleOf(body.envelope));

    const view = r.service.view(handle);
    expect(view.status).toBe("stored");
    expect(view.envelope).toEqual(body.envelope);
    expect(JSON.stringify(view)).not.toContain(PAN);
    expect(r.vault.get(handle)!.ciphertext!.toString("utf8")).not.toContain(PAN);
    expect(r.events.map((e) => e.event)).toEqual(["vault.encrypted", "vault.stored"]);
    expect(r.webhooks).toEqual([[QUICKLOAN, { event: "stored", handle, principal: r.principal, purposeCode: "credit_check", ciphertextHash: view.ciphertextHash }]]);
  });

  it("refuses a submission signed by someone else", async () => {
    const r = rig();
    r.consent.allow(r.principal, QUICKLOAN, "credit_check");
    const body = await r.walletSubmission();
    const stranger = Wallet.createRandom();
    const signature = await stranger.signMessage(submitMessage(handleOf(body.envelope), body.requestId));
    expect((await fails(r.service.submit({ ...body, signature }))).code).toBe("BAD_SIGNATURE");
    expect((await fails(r.service.submit({ ...body, signature: "0x1234" }))).code).toBe("BAD_SIGNATURE");
    expect((await fails(r.service.submit({ ...body, requestId: "another-request-id" }))).code).toBe("BAD_SIGNATURE");
    expect(r.vault.allLive()).toHaveLength(0);
  });

  it.each([
    ["no consent at all", "NO_CONSENT"],
    ["a withdrawn consent", "CONSENT_WITHDRAWN"],
    ["an expired consent", "CONSENT_EXPIRED"],
  ] as const)("answers 451 for %s and stores nothing", async (_n, reason) => {
    const r = rig();
    if (reason !== "NO_CONSENT") r.consent.deny(r.principal, QUICKLOAN, "credit_check", reason);
    const failure = await fails(r.service.submit(await r.walletSubmission()));
    expect([failure.status, failure.code]).toEqual([451, reason]);
    expect(r.vault.allLive()).toHaveLength(0);
  });

  it("fails closed when the chain cannot be read", async () => {
    const r = rig();
    r.consent.unavailable = true;
    const failure = await fails(r.service.submit(await r.walletSubmission()));
    expect([failure.status, failure.code]).toEqual([451, "LEDGER_UNAVAILABLE"]);
  });

  it.each([
    ["a body that is not an object", "nope"],
    ["a missing envelope", { principal: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", fiduciary: QUICKLOAN, purposeCode: "credit_check", requestId: "request-12345" }],
  ])("rejects %s", async (_n, body) => {
    expect((await fails(rig().service.submit(body))).status).toBe(400);
  });

  it("is idempotent, and a replay after erasure does not bring the data back", async () => {
    const r = rig();
    const { handle, body } = await r.submitted();
    const again = await r.service.submit(body);
    expect(again).toMatchObject({ created: false, handle });
    expect(r.vault.allLive()).toHaveLength(1);

    r.service.erase(r.vault.get(handle)!, "withdrawn");
    const replay = await r.service.submit(body);
    expect(replay.created).toBe(false);
    expect(r.vault.get(handle)!.ciphertext).toBeNull();
  });

  it("keeps one live copy per customer, company and purpose", async () => {
    const r = rig();
    const first = await r.submitted();
    r.webhooks.length = 0;
    r.events.length = 0;
    const second = await r.submitted();
    expect(second.handle).not.toBe(first.handle);
    expect(r.vault.get(first.handle)).toMatchObject({ ciphertext: null, eraseCause: "superseded" });
    expect(r.vault.get(second.handle)!.ciphertext).not.toBeNull();
    expect(r.events.map((e) => e.event)).toEqual(["vault.encrypted", "vault.erased", "vault.stored"]);
    expect(r.webhooks.map(([, p]) => p.event)).toEqual(["stored"]); // the company is not told about the replaced copy
  });
});

describe("evaluate (V-03)", () => {
  it("returns only the decision, logs the use and reports the steps", async () => {
    const r = rig();
    const { handle } = await r.submitted();
    r.events.length = 0;
    const result = await r.service.evaluate(QL_KEY, r.evaluateBody(handle));

    expect(result).toEqual({ decision: "approved", limit: 300000, reasonCodes: ["SCORE_FAIR"], entryId: r.logs[0]!.id });
    expect(r.logs).toEqual([{ fiduciary: QUICKLOAN, id: result.entryId, purpose: "credit_check", principal: r.principal, decision: "ALLOWED", reason: "OK" }]);
    expect(r.events.map((e) => e.event)).toEqual(["processor.requested", "processor.decrypting", "processor.decided"]);
    expect(r.events[2]).toMatchObject({ decision: "approved", limit: 300000, reasonCodes: ["SCORE_FAIR"], entryId: result.entryId, handle });
    expect(JSON.stringify([result, r.events, r.logs])).not.toContain(PAN);
  });

  it("authenticates the company and keeps companies apart", async () => {
    const r = rig();
    const { handle } = await r.submitted();
    expect((await fails(r.service.evaluate(undefined, r.evaluateBody(handle)))).status).toBe(401);
    expect((await fails(r.service.evaluate("sk_wrong", r.evaluateBody(handle)))).status).toBe(401);
    expect((await fails(r.service.evaluate(MC_KEY, r.evaluateBody(handle)))).code).toBe("WRONG_FIDUCIARY"); // key of one company, body of another
    expect((await fails(r.service.evaluate(MC_KEY, r.evaluateBody(handle, "credit_check", MEDICARE)))).code).toBe("HANDLE_NOT_FOUND"); // another company's handle
    expect((await fails(r.service.evaluate(QL_KEY, r.evaluateBody("0x" + "11".repeat(32) as `0x${string}`)))).code).toBe("HANDLE_NOT_FOUND");
    expect((await fails(r.service.evaluate(QL_KEY, { ...r.evaluateBody(handle), action: "export_everything" }))).code).toBe("UNSUPPORTED_ACTION");
    expect(r.logs).toHaveLength(0); // nothing was used, so nothing is logged
  });

  it("withdrawn: 451, a BLOCKED log entry, the ciphertext erased, the company told", async () => {
    const r = rig();
    const { handle } = await r.submitted();
    r.consent.deny(r.principal, QUICKLOAN, "credit_check", "CONSENT_WITHDRAWN");
    r.events.length = 0;
    r.webhooks.length = 0;

    const failure = await fails(r.service.evaluate(QL_KEY, r.evaluateBody(handle)));
    expect([failure.status, failure.code, failure.entryId]).toEqual([451, "CONSENT_WITHDRAWN", r.logs[0]!.id]);
    expect(r.logs[0]).toMatchObject({ decision: "BLOCKED", reason: "CONSENT_WITHDRAWN", purpose: "credit_check" });
    expect(r.vault.get(handle)).toMatchObject({ ciphertext: null, eraseCause: "withdrawn" });
    expect(r.service.view(handle)).toMatchObject({ status: "erased", envelope: null });
    expect(r.events.map((e) => e.event)).toEqual(["processor.requested", "processor.decided", "vault.erased"]);
    expect(r.events[1]).toMatchObject({ decision: "blocked", reasonCodes: ["CONSENT_WITHDRAWN"] });
    expect(r.events[2]).toMatchObject({ cause: "withdrawn" });
    expect(r.webhooks.map(([, p]) => p.event)).toEqual(["erased"]);
  });

  it("expired: 451 CONSENT_EXPIRED and erased", async () => {
    const r = rig();
    const { handle } = await r.submitted();
    r.consent.deny(r.principal, QUICKLOAN, "credit_check", "CONSENT_EXPIRED");
    expect((await fails(r.service.evaluate(QL_KEY, r.evaluateBody(handle)))).code).toBe("CONSENT_EXPIRED");
    expect(r.vault.get(handle)).toMatchObject({ ciphertext: null, eraseCause: "expired" });
  });

  it("an unreadable chain blocks with LEDGER_UNAVAILABLE and erases nothing", async () => {
    const r = rig();
    const { handle } = await r.submitted();
    r.consent.unavailable = true;
    const failure = await fails(r.service.evaluate(QL_KEY, r.evaluateBody(handle)));
    expect([failure.status, failure.code]).toEqual([451, "LEDGER_UNAVAILABLE"]);
    expect(r.logs[0]).toMatchObject({ decision: "BLOCKED", reason: "LEDGER_UNAVAILABLE" });
    expect(r.vault.get(handle)!.ciphertext).not.toBeNull();
  });

  it("does not let a company use data for a purpose other than the one it was given for", async () => {
    const r = rig();
    const { handle } = await r.submitted();
    r.consent.allow(r.principal, QUICKLOAN, "marketing"); // the customer did consent to marketing...
    const failure = await fails(r.service.evaluate(QL_KEY, r.evaluateBody(handle, "marketing"))); // ...but this data was given for credit_check
    expect([failure.status, failure.code]).toEqual([451, "NO_CONSENT"]);
    expect(r.logs[0]).toMatchObject({ decision: "BLOCKED", reason: "NO_CONSENT", purpose: "marketing" }); // on the record
    expect(r.vault.get(handle)!.ciphertext).not.toBeNull(); // the misuse attempt does not destroy the customer's data
  });

  it("consent given again after a withdrawal does not bring erased data back: 410", async () => {
    const r = rig();
    const { handle } = await r.submitted();
    r.consent.deny(r.principal, QUICKLOAN, "credit_check", "CONSENT_WITHDRAWN");
    await fails(r.service.evaluate(QL_KEY, r.evaluateBody(handle)));
    r.consent.allow(r.principal, QUICKLOAN, "credit_check");
    const failure = await fails(r.service.evaluate(QL_KEY, r.evaluateBody(handle)));
    expect([failure.status, failure.code]).toEqual([410, "VAULT_ERASED"]);
  });

  it("a tampered ciphertext is an error, never a guessed decision", async () => {
    const r = rig();
    const { handle } = await r.submitted();
    expect(r.service.tamper(handle)).toBe(true);
    r.events.length = 0;
    const failure = await fails(r.service.evaluate(QL_KEY, r.evaluateBody(handle)));
    expect([failure.status, failure.code]).toEqual([422, "CIPHERTEXT_INVALID"]);
    expect(r.events.at(-1)).toMatchObject({ event: "processor.decided", decision: "error", limit: null, reasonCodes: ["CIPHERTEXT_INVALID"] });
    expect(failure.message).not.toContain(PAN);
  });

  it("valid JSON of the wrong shape is declined, not crashed on", async () => {
    const r = rig();
    r.consent.allow(r.principal, QUICKLOAN, "credit_check");
    const body = await r.walletSubmission("credit_check", QUICKLOAN, "just a string");
    const { handle } = await r.service.submit(body);
    const result = await r.service.evaluate(QL_KEY, r.evaluateBody(handle));
    expect(result).toMatchObject({ decision: "declined", reasonCodes: ["PAN_INVALID"] });
  });

  it("an envelope moved to another customer or company does not open", async () => {
    const r = rig();
    r.consent.allow(r.principal, QUICKLOAN, "credit_check");
    const { handle } = await r.submitted();
    const row = r.vault.get(handle)!;
    // Re-file the same ciphertext under another company's name, as a hostile database administrator might.
    r.vault.insert({ ...row, handle: ("0x" + "22".repeat(32)) as `0x${string}`, fiduciary: MEDICARE, ciphertext: row.ciphertext! });
    r.consent.allow(r.principal, MEDICARE, "credit_check");
    const failure = await fails(r.service.evaluate(MC_KEY, r.evaluateBody("0x" + "22".repeat(32) as `0x${string}`, "credit_check", MEDICARE)));
    expect(failure.code).toBe("CIPHERTEXT_INVALID");
  });
});

describe("erasure (V-04)", () => {
  it("a withdrawal event makes the Processor look, and the chain decides", async () => {
    const r = rig();
    const { handle } = await r.submitted();
    await r.service.recheckFor(r.principal, QUICKLOAN, "credit_check");
    expect(r.vault.get(handle)!.ciphertext).not.toBeNull(); // consent is still valid: a prompt alone erases nothing
    r.consent.deny(r.principal, QUICKLOAN, "credit_check", "CONSENT_WITHDRAWN");
    await r.service.recheckFor(r.principal, QUICKLOAN, "credit_check");
    expect(r.vault.get(handle)).toMatchObject({ ciphertext: null, eraseCause: "withdrawn" });
    expect(r.events.filter((e) => e.event === "vault.erased")).toHaveLength(1);
  });

  it("the sweep erases expired data and leaves everything alone while the chain is unreadable", async () => {
    const r = rig();
    const a = await r.submitted();
    r.consent.unavailable = true;
    await r.service.sweep();
    expect(r.vault.get(a.handle)!.ciphertext).not.toBeNull();
    r.consent.unavailable = false;
    r.consent.deny(r.principal, QUICKLOAN, "credit_check", "CONSENT_EXPIRED");
    await r.service.sweep();
    expect(r.vault.get(a.handle)).toMatchObject({ ciphertext: null, eraseCause: "expired" });
    await r.service.sweep(); // nothing left to erase, no second event
    expect(r.events.filter((e) => e.event === "vault.erased")).toHaveLength(1);
  });
});
