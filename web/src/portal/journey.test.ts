// The QuickLoan portal's state machine (C-09, trd.md §6.10): every stage, every way in and out of it, and the rule
// that nothing sensitive can pass through.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Journey, checkAlias, type JourneyDeps, type Stage } from "./journey";

const QUICKLOAN = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const ASHA = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const RAVI = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC";
const H1 = `0x${"ab".repeat(32)}`;
const H2 = `0x${"ef".repeat(32)}`;
const HASH = `0x${"cd".repeat(32)}`;
const TX = `0x${"12".repeat(32)}`;
const NOW = 1_760_000_000_000;

const granted = (principal = ASHA, over: Record<string, unknown> = {}) => ({
  event: "consent.updated", principal, fiduciary: QUICKLOAN, purposeId: HASH, purposeCode: "credit_check", status: "Active", expiresAt: null, txHash: TX, at: NOW / 1000 + 2, ...over,
});
const withdrawn = (principal = ASHA) => granted(principal, { status: "Withdrawn", txHash: HASH });
const stored = (principal = ASHA, handle = H1) => ({ event: "vault.stored", principal, fiduciary: QUICKLOAN, purposeCode: "credit_check", handle, ciphertextHash: HASH, at: NOW / 1000 + 4, atMs: 1, sizeBytes: 300 });
const erased = (principal = ASHA, cause = "withdrawn", handle = H1) => ({ event: "vault.erased", principal, fiduciary: QUICKLOAN, purposeCode: "credit_check", handle, cause, at: NOW / 1000 + 9, atMs: 1 });

let deps: { [K in keyof JourneyDeps]: ReturnType<typeof vi.fn> };
let j: Journey;
const stage = (): Stage => j.state.stage;

beforeEach(() => {
  deps = {
    createRequest: vi.fn(async () => ({ requestId: "req_abc12345", qrPayload: { v: 1, core: "http://core", requestId: "req_abc12345", fiduciary: QUICKLOAN, name: "QuickLoan" } })),
    consentRows: vi.fn(async () => [{ principal: ASHA, customerAlias: "Asha" }, { principal: RAVI, customerAlias: "Ravi" }]),
    apply: vi.fn(async () => ({ status: 200, body: { decision: "approved", limit: 300000, reasonCodes: ["SCORE_FAIR"], entryId: "e1" } })),
    now: vi.fn(() => NOW),
    wait: vi.fn(async () => {}),
  };
  j = new Journey(deps as unknown as JourneyDeps);
});

/** Logs in as Asha and gets as far as the QR. */
async function toQr(optional: string[] = []) {
  j.login("Asha");
  for (const o of optional) j.toggleOptional(o);
  await j.tick();
}
async function toConsent() {
  await toQr();
  await j.onFrame(granted());
}
async function toData() {
  await toConsent();
  await j.onFrame(stored());
}

describe("login", () => {
  it("takes a name or ID and opens the application form, nothing pre-ticked", () => {
    expect(stage()).toBe("logged-out");
    expect(j.login("  Asha  ")).toBe(true);
    expect(j.state).toMatchObject({ stage: "form", alias: "Asha", optional: [], request: null });
  });

  it.each([
    ["", /Enter your name/],
    ["   ", /Enter your name/],
    ["ABCDE1234F", /looks like a PAN/],
    ["abcde1234f", /looks like a PAN/],
    ["ABCDE 1234 F", /looks like a PAN/],
    ["x".repeat(41), /at most 40/],
    ["Asha\u0007", /letters and numbers/],
  ])("refuses %j", (raw, message) => {
    expect(j.login(raw)).toBe(false);
    expect(stage()).toBe("logged-out");
    expect(j.state.notice).toMatch(message);
    expect(checkAlias(raw).ok).toBe(false);
  });

  it("accepts ordinary names, including ones with digits", () => {
    for (const ok of ["Asha", "Customer #4821", "asha.k", "A12345"]) expect(checkAlias(ok)).toEqual({ ok: true, alias: ok });
  });

  it("signing out starts over", async () => {
    await toQr();
    j.signOut();
    expect(j.state).toMatchObject({ stage: "logged-out", alias: null, request: null });
  });
});

describe("the consent checkbox", () => {
  it("asks only for the loan purpose when nothing else is ticked, and shows the QR", async () => {
    await toQr();
    expect(deps.createRequest).toHaveBeenCalledWith("Asha", ["credit_check"]);
    expect(stage()).toBe("awaiting-scan");
    expect(JSON.parse(j.state.request!.qrPayload)).toMatchObject({ requestId: "req_abc12345", fiduciary: QUICKLOAN });
  });

  it("adds the optional purposes the customer ticked first, and locks them once the QR exists", async () => {
    await toQr(["marketing"]);
    expect(deps.createRequest).toHaveBeenCalledWith("Asha", ["credit_check", "marketing"]);
    j.toggleOptional("bureau_share");
    expect(j.state.optional).toEqual(["marketing"]);
  });

  it("ignores purposes that are not on offer", () => {
    j.login("Asha");
    j.toggleOptional("credit_check");
    j.toggleOptional("nonsense");
    expect(j.state.optional).toEqual([]);
  });

  it("unticking cancels, and a request that was still in flight does not bring the QR back", async () => {
    j.login("Asha");
    let release!: () => void;
    deps.createRequest.mockImplementationOnce(() => new Promise((r) => { release = () => r({ requestId: "late", qrPayload: {} }); }));
    const ticking = j.tick();
    j.signOut();
    j.login("Asha");
    release();
    await ticking;
    expect(stage()).toBe("form");
    j.signOut();
    await toQr();
    j.untick();
    expect(j.state).toMatchObject({ stage: "form", request: null });
  });

  it("a failed request shows the error and keeps the form, and retry returns to it", async () => {
    j.login("Asha");
    deps.createRequest.mockRejectedValueOnce(new Error("Could not reach Sammati"));
    await j.tick();
    expect(j.state).toMatchObject({ stage: "error", error: "Could not reach Sammati", resumeStage: "form", alias: "Asha" });
    j.retry();
    expect(j.state).toMatchObject({ stage: "form", error: null });
    await j.tick();
    expect(stage()).toBe("awaiting-scan");
  });
});

describe("consent received", () => {
  it("follows the customer whose alias the company's own table gives, and keeps the transaction", async () => {
    await toQr();
    await j.onFrame(granted(ASHA));
    expect(j.state).toMatchObject({ stage: "consent-received", principal: ASHA, txHash: TX, vault: null });
    expect(deps.consentRows).toHaveBeenCalled();
  });

  it("ignores another customer's consent, even at the same moment", async () => {
    await toQr();
    await j.onFrame(granted(RAVI)); // Ravi's alias is Ravi, ours is Asha
    expect(stage()).toBe("awaiting-scan");
    expect(j.state.principal).toBeNull();
  });

  it("waits for the table to catch up, then accepts", async () => {
    await toQr();
    deps.consentRows.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    await j.onFrame(granted());
    expect(stage()).toBe("consent-received");
    expect(deps.consentRows).toHaveBeenCalledTimes(3);
  });

  it("gives up if the table never names this customer, and survives it being unreachable", async () => {
    await toQr();
    deps.consentRows.mockRejectedValue(new Error("down"));
    await j.onFrame(granted());
    expect(stage()).toBe("awaiting-scan");
  });

  it.each([
    ["an older consent", granted(ASHA, { at: NOW / 1000 - 600 })],
    ["another company", granted(ASHA, { fiduciary: RAVI })],
    ["another purpose", granted(ASHA, { purposeCode: "marketing" })],
    ["a withdrawal", withdrawn()],
    ["a frame that is not an event", { hello: "world" }],
  ])("ignores %s while waiting for the scan", async (_n, frame) => {
    await toQr();
    await j.onFrame(frame);
    expect(stage()).toBe("awaiting-scan");
  });

  it("ignores consent when nobody asked for it", async () => {
    j.login("Asha");
    await j.onFrame(granted());
    expect(stage()).toBe("form");
  });

  it("the sensitive fields are never part of the state", async () => {
    await toData();
    const text = JSON.stringify(j.state);
    for (const word of ["pan", "income", "employment", "ABCDE1234F"]) expect(text.toLowerCase()).not.toContain(word.toLowerCase());
  });
});

describe("data submitted", () => {
  it("moves on the Processor's vault.stored, with the handle and hash only", async () => {
    await toConsent();
    await j.onFrame(stored());
    expect(j.state).toMatchObject({ stage: "data-submitted", vault: { handle: H1, ciphertextHash: HASH }, dataErased: false });
  });

  it("remembers data that arrived before the customer was recognised", async () => {
    await toQr();
    await j.onFrame(stored()); // principal unknown yet
    expect(stage()).toBe("awaiting-scan");
    await j.onFrame(granted());
    expect(j.state).toMatchObject({ stage: "data-submitted", vault: { handle: H1 } });
  });

  it("ignores another customer's data, another purpose, and data before consent", async () => {
    await toConsent();
    await j.onFrame(stored(RAVI, H2));
    await j.onFrame({ ...stored(), purposeCode: "marketing" });
    expect(stage()).toBe("consent-received");
  });

  it("a newer submission replaces the handle and clears an old decision", async () => {
    await toData();
    await j.apply();
    expect(stage()).toBe("decided");
    await j.onFrame(stored(ASHA, H2));
    expect(j.state).toMatchObject({ stage: "data-submitted", vault: { handle: H2 }, decision: null });
  });
});

describe("apply", () => {
  it("is not possible before the data is submitted, and nothing is asked of the company", async () => {
    await toConsent();
    await j.apply();
    expect(deps.apply).not.toHaveBeenCalled();
    expect(stage()).toBe("consent-received");
    j.signOut();
    await j.apply();
    expect(deps.apply).not.toHaveBeenCalled();
  });

  it("shows the decision: outcome, limit and reasons, never data", async () => {
    await toData();
    await j.apply();
    expect(deps.apply).toHaveBeenCalledWith("Asha", ASHA);
    expect(j.state).toMatchObject({ stage: "decided", applying: false, decision: { decision: "approved", limit: 300000, reasonCodes: ["SCORE_FAIR"] } });
  });

  it("shows a decline just as plainly", async () => {
    await toData();
    deps.apply.mockResolvedValueOnce({ status: 200, body: { decision: "declined", limit: null, reasonCodes: ["EMPLOYMENT_INELIGIBLE"] } });
    await j.apply();
    expect(j.state.decision).toEqual({ decision: "declined", limit: null, reasonCodes: ["EMPLOYMENT_INELIGIBLE"] });
  });

  it("a 451 for a withdrawn consent is the withdrawn stage", async () => {
    await toData();
    deps.apply.mockResolvedValueOnce({ status: 451, body: { code: "CONSENT_WITHDRAWN", message: "x" } });
    await j.apply();
    expect(stage()).toBe("withdrawn");
  });

  it("any other refusal is said, and Apply stays available", async () => {
    await toData();
    deps.apply.mockResolvedValueOnce({ status: 451, body: { code: "LEDGER_UNAVAILABLE", message: "x" } });
    await j.apply();
    expect(j.state).toMatchObject({ stage: "data-submitted", applying: false });
    expect(j.state.notice).toContain("LEDGER_UNAVAILABLE");
  });

  it("an error is shown with the company's words, and retry returns to Apply", async () => {
    await toData();
    deps.apply.mockResolvedValueOnce({ status: 410, body: { error: { code: "VAULT_ERASED", message: "The stored data was erased" } } });
    await j.apply();
    expect(j.state).toMatchObject({ stage: "error", error: "The stored data was erased", resumeStage: "data-submitted" });
    j.retry();
    expect(stage()).toBe("data-submitted");
    deps.apply.mockRejectedValueOnce(new Error("down"));
    await j.apply();
    expect(j.state.error).toBe("QuickLoan's backend did not answer");
  });

  it("does not trust an answer it cannot read, or one that carries the profile", async () => {
    await toData();
    deps.apply.mockResolvedValueOnce({ status: 200, body: { decision: "maybe" } });
    await j.apply();
    expect(j.state.error).toBe("QuickLoan's answer could not be read");
    j.retry();
    deps.apply.mockResolvedValueOnce({ status: 200, body: { decision: "approved", limit: 1, reasonCodes: [], pan: "ABCDE1234F" } });
    await j.apply();
    expect(stage()).toBe("error");
    expect(JSON.stringify(j.state)).not.toContain("ABCDE1234F");
  });

  it("cannot be pressed twice at once", async () => {
    await toData();
    let release!: () => void;
    deps.apply.mockImplementationOnce(() => new Promise((r) => { release = () => r({ status: 200, body: { decision: "approved", limit: 1, reasonCodes: [] } }); }));
    const first = j.apply();
    expect(j.state.applying).toBe(true);
    await j.apply();
    expect(deps.apply).toHaveBeenCalledTimes(1);
    release();
    await first;
    expect(stage()).toBe("decided");
  });
});

describe("withdrawal", () => {
  it.each([["consent received", toConsent], ["data submitted", toData]] as const)("from %s, the page moves to withdrawn the moment the event arrives", async (_n, go) => {
    await go();
    await j.onFrame(withdrawn());
    expect(stage()).toBe("withdrawn");
  });

  it("from a decision too, and Apply is then not possible", async () => {
    await toData();
    await j.apply();
    await j.onFrame(withdrawn());
    expect(j.state).toMatchObject({ stage: "withdrawn", decision: null });
    deps.apply.mockClear();
    await j.apply();
    expect(deps.apply).not.toHaveBeenCalled();
  });

  it("another customer's withdrawal changes nothing", async () => {
    await toData();
    await j.onFrame(withdrawn(RAVI));
    expect(stage()).toBe("data-submitted");
  });

  it("the Processor's erasure is noted, in either order", async () => {
    await toData();
    await j.onFrame(withdrawn());
    await j.onFrame(erased());
    expect(j.state).toMatchObject({ stage: "withdrawn", dataErased: true, vault: null });

    j.signOut();
    await toData();
    await j.onFrame(erased()); // before the withdrawal reaches us
    expect(j.state).toMatchObject({ stage: "consent-received", dataErased: true });
    await j.onFrame(withdrawn());
    expect(stage()).toBe("withdrawn");
  });

  it("an older copy being erased is not the customer's data going away", async () => {
    await toData();
    await j.onFrame(erased(ASHA, "superseded", H2));
    expect(j.state).toMatchObject({ stage: "data-submitted", dataErased: false });
  });

  it("consent given again after a withdrawal asks for the details again", async () => {
    await toData();
    await j.onFrame(withdrawn());
    await j.onFrame(granted(ASHA, { at: NOW / 1000 + 20, txHash: HASH }));
    expect(j.state).toMatchObject({ stage: "consent-received", txHash: HASH, vault: null });
  });
});

describe("nothing sensitive gets through", () => {
  it("stops, and says so, if a profile value turns up in any live event", async () => {
    await toData();
    await j.onFrame({ event: "access.logged", principal: ASHA, note: "customer PAN ABCDE1234F" });
    expect(j.state).toMatchObject({ stage: "error", resumeStage: null });
    expect(j.state.error).toContain("A profile value appeared in a live event");
    expect(JSON.stringify(j.state)).not.toContain("ABCDE1234F");
    // and it stays stopped: later events, even good ones, do nothing
    await j.onFrame(withdrawn());
    expect(stage()).toBe("error");
  });

  it("also for a profile field name with any value", async () => {
    await toQr();
    await j.onFrame({ event: "vault.stored", principal: ASHA, employment: "salaried" });
    expect(stage()).toBe("error");
  });

  it("signing out clears the stop", async () => {
    await toQr();
    await j.onFrame({ pan: "x" });
    j.signOut();
    j.login("Asha");
    await j.tick();
    expect(stage()).toBe("awaiting-scan");
  });
});

describe("listeners", () => {
  it("hear every change, and stop hearing when they unsubscribe", async () => {
    const seen: Stage[] = [];
    const off = j.subscribe((s) => seen.push(s.stage));
    j.login("Asha");
    await j.tick();
    off();
    j.signOut();
    expect(seen).toEqual(["form", "awaiting-scan"]);
  });
});
