// The Data Flow Inspector's logic (V-07): what it may show, how the lanes follow the events, how it paces them and
// how it replays a recording. The screen itself is tested in FlowInspector.test.tsx.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { VaultEvent } from "@sammati/shared";
import { Playout } from "./playout";
import { BLOCKED_MARKER, checkFrame, cleanPrivacy, filterStaffView, privacyVerdict, scanForPlaintext } from "./privacy";
import { ReplayError, ReplayPlayer, buildReplay, parseReplay, type ReplayFile } from "./replay";
import { initialFlow, reduceFlow, timeline, type FlowAction, type FlowState } from "./state";

const ASHA = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const OTHER = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const FID = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const H1 = `0x${"ab".repeat(32)}`;
const H2 = `0x${"ef".repeat(32)}`;
const HASH = `0x${"cd".repeat(32)}`;
const T0 = 1760000000;

const base = (handle = H1, at = T0, principal = ASHA) => ({ principal, fiduciary: FID, purposeCode: "credit_check", handle, at, atMs: at * 1000 + 7 }) as const;
const encrypted = (over: Partial<VaultEvent> = {}): VaultEvent => ({ event: "vault.encrypted", ...base(), ciphertextHash: HASH, sizeBytes: 301, ...over }) as VaultEvent;
const stored = (at = T0 + 1): VaultEvent => ({ event: "vault.stored", ...base(H1, at), ciphertextHash: HASH, sizeBytes: 301 });
const requested = (ms = (T0 + 5) * 1000): VaultEvent => ({ event: "processor.requested", ...base(H1, T0 + 5), action: "loan_decision", requestedAt: ms });
const decrypting = (ms = (T0 + 5) * 1000 + 4): VaultEvent => ({ event: "processor.decrypting", ...base(H1, T0 + 5), decryptingAt: ms });
const approved = (): VaultEvent => ({ event: "processor.decided", ...base(H1, T0 + 5), decision: "approved", limit: 300000, reasonCodes: ["SCORE_FAIR"], entryId: "e1", durationMs: 9 });
const blocked = (at = T0 + 20): VaultEvent => ({ event: "processor.decided", ...base(H1, at), decision: "blocked", limit: null, reasonCodes: ["CONSENT_WITHDRAWN"], entryId: "e2", durationMs: 3 });
const erased = (cause: "withdrawn" | "superseded" = "withdrawn", handle = H1): VaultEvent => ({ event: "vault.erased", ...base(handle, T0 + 21), cause });

const run = (events: FlowAction[], from: FlowState = initialFlow) => events.reduce(reduceFlow, from);

describe("the plaintext check", () => {
  it("finds the demo values and profile fields anywhere in a frame, and nothing in a clean one", () => {
    expect(scanForPlaintext(approved())).toBeNull();
    expect(scanForPlaintext(stored())).toBeNull();
    expect(scanForPlaintext({ event: "x", nested: [{ note: "PAN is ABCDE1234F" }] })).toBe("$.nested[0].note");
    expect(scanForPlaintext({ income: "6-9 LPA" })).toBe("$.income");
    for (const name of ["pan", "incomeBand", "score", "plaintext"]) expect(scanForPlaintext({ a: { [name]: 1 } })).toBe(`$.a.${name}`);
    expect(scanForPlaintext("a hash 0x1234 and a decision approved")).toBeNull();
  });

  it("a violation is sticky, and the line needs a decision and some frames before it says clean", () => {
    let s = cleanPrivacy;
    expect(privacyVerdict(s, 0)).toBe("unknown");
    s = checkFrame(s, stored());
    expect(privacyVerdict(s, 0)).toBe("unknown"); // nothing decided yet: no claim
    expect(privacyVerdict(s, 1)).toBe("clean");
    s = checkFrame(s, { event: "vault.stored", leaked: "ABCDE1234F" });
    expect(privacyVerdict(s, 1)).toBe("violated");
    s = checkFrame(checkFrame(s, stored()), stored());
    expect(s.checked).toBe(4);
    expect(privacyVerdict(s, 5)).toBe("violated"); // later clean frames do not wash it out
  });
});

describe("the staff lane's filter", () => {
  const row = {
    handle: H1, principal: ASHA, fiduciary: FID, purposeCode: "credit_check", ciphertextHash: HASH, status: "stored", createdAt: T0, erasedAt: null,
    envelope: { v: 1, ephPub: `0x${"11".repeat(32)}`, nonce: `0x${"22".repeat(12)}`, ciphertext: `0x${"33".repeat(20)}`, tag: `0x${"44".repeat(16)}` },
  };

  it("lets QuickLoan's real admin answer and the vault row through, unchanged", () => {
    const admin = filterStaffView({ handle: H1, ciphertextHash: HASH, status: "stored" });
    expect(admin).toMatchObject({ hidden: 0, blocked: [], leaked: false });
    expect(admin.fields.map((f) => f.name)).toEqual(["handle", "ciphertextHash", "status"]);
    const db = filterStaffView(row);
    expect(db.fields.map((f) => f.name)).toEqual(["handle", "principal", "fiduciary", "purposeCode", "ciphertextHash", "status", "createdAt", "erasedAt", "envelope"]);
    expect(filterStaffView({ ...row, status: "erased", envelope: null, erasedAt: T0 + 1 }).blocked).toEqual([]);
    expect(filterStaffView({ handle: null, ciphertextHash: null, status: "none" }).blocked).toEqual([]);
  });

  it("shows only the reason code of a refusal", () => {
    const refusal = filterStaffView({ code: "CONSENT_WITHDRAWN", message: "The user withdrew consent." });
    expect(refusal.fields).toEqual([{ name: "code", value: "CONSENT_WITHDRAWN" }]);
    expect(refusal.hidden).toBe(1);
  });

  it("hides every field it does not know, and says plaintext was in the answer", () => {
    const poisoned = filterStaffView({ handle: H1, ciphertextHash: HASH, status: "stored", pan: "ABCDE1234F", incomeBand: "6-9 LPA", score: 742 });
    expect(poisoned.fields.map((f) => f.name)).toEqual(["handle", "ciphertextHash", "status"]);
    expect(poisoned.hidden).toBe(3);
    expect(poisoned.leaked).toBe(true);
    expect(JSON.stringify(poisoned)).not.toContain("ABCDE1234F");
  });

  it("blocks a known field whose value is not what the field should hold, or looks like plaintext", () => {
    const view = filterStaffView({ handle: "ABCDE1234F", ciphertextHash: HASH, status: "ABCDE1234F", purposeCode: "credit check!", createdAt: "1760000000" });
    expect(view.blocked).toEqual(["handle", "status", "purposeCode", "createdAt"]);
    expect(view.fields.map((f) => f.name)).toEqual(["ciphertextHash"]);
    expect(JSON.stringify(view)).not.toContain("ABCDE1234F");
    expect(BLOCKED_MARKER).toMatch(/plaintext/);
  });

  it("refuses an envelope that carries anything beyond the five ciphertext fields, or a ciphertext that is not hex", () => {
    expect(filterStaffView({ envelope: { ...row.envelope, pan: "ABCDE1234F" } }).blocked).toEqual(["envelope"]);
    expect(filterStaffView({ envelope: { ...row.envelope, ciphertext: "ABCDE1234F" } }).blocked).toEqual(["envelope"]);
    expect(filterStaffView({ envelope: { ...row.envelope, ciphertext: `0x${"33".repeat(5000)}` } }).blocked).toEqual(["envelope"]);
  });

  it("an answer that is not an object shows nothing", () => {
    for (const odd of [null, "ABCDE1234F", 7, [row]]) expect(filterStaffView(odd).fields).toEqual([]);
    expect(filterStaffView("ABCDE1234F").leaked).toBe(true);
  });
});

describe("the lanes follow the events", () => {
  it("runs the whole flow: encrypting, sent, decrypting, decision, then erased after a withdrawal", () => {
    let s = run([encrypted()]);
    expect([s.wallet, s.processor.phase, s.transit.sizeBytes, s.handle]).toEqual(["encrypting", "waiting", 301, H1]);

    s = run([stored(), requested(), decrypting()], s);
    expect([s.wallet, s.processor.phase]).toEqual(["sent", "decrypting"]);

    s = run([approved()], s);
    expect(s.processor).toEqual({ phase: "decision", decision: { outcome: "approved", limit: 300000, reasonCodes: ["SCORE_FAIR"], entryId: "e1" } });
    expect(s.decisionsSeen).toBe(1);

    s = run([requested((T0 + 20) * 1000), blocked(), erased()], s);
    expect(s.processor.decision).toMatchObject({ outcome: "blocked", reasonCodes: ["CONSENT_WITHDRAWN"], limit: null });
    expect(s.transit).toMatchObject({ erased: true, eraseCause: "withdrawn" });
    expect(s.decisionsSeen).toBe(2);
  });

  it("only the Processor's own two events move its lane", () => {
    const s = run([encrypted(), stored(), requested()]);
    expect(s.processor).toEqual({ phase: "waiting", decision: null });
    expect(reduceFlow(s, decrypting()).processor.phase).toBe("decrypting");
  });

  it("Scoring is the presentation's step between decrypting and the decision, and only then", () => {
    expect(reduceFlow(initialFlow, { type: "scoring" })).toBe(initialFlow);
    const decryptingNow = run([encrypted(), decrypting()]);
    expect(reduceFlow(decryptingNow, { type: "scoring" }).processor.phase).toBe("scoring");
    expect(reduceFlow(reduceFlow(decryptingNow, { type: "scoring" }), approved()).processor.phase).toBe("decision");
  });

  it("times the timeline from the events' own fields, with the gap from the step before", () => {
    const s = run([encrypted(), stored(), requested(), decrypting(), approved(), blocked(), erased()]);
    const rows = timeline(s);
    expect(rows.map((r) => r.key)).toEqual(["encrypted", "stored", "requested", "decrypting", "decided", "erased"]);
    expect(rows[0]).toMatchObject({ atMs: T0 * 1000 + 7, gapMs: null });
    expect(rows[1]).toMatchObject({ atMs: (T0 + 1) * 1000 + 7, gapMs: 1000 });
    expect(rows[2]).toMatchObject({ atMs: (T0 + 5) * 1000, gapMs: 3993 });
    expect(rows[3]).toMatchObject({ atMs: (T0 + 5) * 1000 + 4, gapMs: 4 });
    // the decision is placed at requestedAt + durationMs (3 ms here, from the blocked event, which came last)
    expect(rows[4]!.atMs).toBe((T0 + 5) * 1000 + 3);
    expect(rows[5]!.atMs).toBe((T0 + 21) * 1000 + 7);
  });

  it("leaves a step empty until it happens, and starts a new round at each request", () => {
    const first = run([encrypted(), stored(), requested(), decrypting(), approved()]);
    expect(timeline(first).filter((r) => r.atMs !== null)).toHaveLength(5);
    const second = run([requested((T0 + 30) * 1000)], first);
    expect(timeline(second).map((r) => r.atMs !== null)).toEqual([true, true, true, false, false, false]);
  });

  it("follows one customer: a new submission switches to its owner, anyone else's events are ignored", () => {
    const asha = run([encrypted(), stored(), approved()]);
    const intruder = { ...approved(), principal: OTHER } as VaultEvent;
    expect(reduceFlow(asha, intruder)).toBe(asha);

    const next = reduceFlow(asha, encrypted({ principal: OTHER, handle: H2 } as Partial<VaultEvent>));
    expect([next.principal, next.handle, next.wallet, next.processor.phase]).toEqual([OTHER, H2, "encrypting", "waiting"]);
    expect(next.decisionsSeen).toBe(asha.decisionsSeen); // the session's count survives
  });

  it("joining mid-flow adopts the customer of the first event", () => {
    const s = run([requested(), decrypting(), approved()]);
    expect([s.principal, s.processor.phase]).toEqual([ASHA, "decision"]);
  });

  it("an erased older copy is not shown as an erasure", () => {
    const s = run([encrypted(), stored()]);
    expect(reduceFlow(s, erased("superseded", H2)).transit.erased).toBe(false);
    expect(reduceFlow(s, erased("withdrawn")).transit.erased).toBe(true);
  });
});

describe("the playout", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const collect = (dwell?: number) => {
    const seen: string[] = [];
    const p = new Playout((a) => seen.push("type" in a ? "scoring" : a.event), dwell);
    return { seen, p };
  };

  it("applies the first event at once and the rest one dwell apart, in order", () => {
    const { seen, p } = collect(600);
    p.push(encrypted());
    p.push(stored());
    p.push(requested());
    expect(seen).toEqual(["vault.encrypted"]);
    vi.advanceTimersByTime(599);
    expect(seen).toEqual(["vault.encrypted"]);
    vi.advanceTimersByTime(1);
    expect(seen).toEqual(["vault.encrypted", "vault.stored"]);
    vi.advanceTimersByTime(600);
    expect(seen).toEqual(["vault.encrypted", "vault.stored", "processor.requested"]);
    expect(p.pending).toBe(0);
  });

  it("holds Decrypting, shows Scoring, then the decision, even when the decision is already waiting", () => {
    const { seen, p } = collect(600);
    p.push(decrypting());
    p.push(approved());
    expect(seen).toEqual(["processor.decrypting"]);
    vi.advanceTimersByTime(600);
    expect(seen).toEqual(["processor.decrypting", "scoring"]);
    vi.advanceTimersByTime(599);
    expect(seen).toEqual(["processor.decrypting", "scoring"]);
    vi.advanceTimersByTime(1);
    expect(seen).toEqual(["processor.decrypting", "scoring", "processor.decided"]);
  });

  it("shows Scoring while a decision that has not arrived yet is awaited, and applies it the moment it comes", () => {
    const { seen, p } = collect(600);
    p.push(decrypting());
    vi.advanceTimersByTime(1300);
    expect(seen).toEqual(["processor.decrypting", "scoring"]);
    p.push(approved());
    expect(seen.at(-1)).toBe("processor.decided");
  });

  it("with no dwell (reduced motion) applies everything immediately and adds no Scoring", () => {
    const { seen, p } = collect(0);
    for (const e of [encrypted(), stored(), requested(), decrypting(), approved()]) p.push(e);
    expect(seen).toEqual(["vault.encrypted", "vault.stored", "processor.requested", "processor.decrypting", "processor.decided"]);
  });

  it("clear drops what is waiting and stops the clock", () => {
    const { seen, p } = collect(600);
    p.push(encrypted());
    p.push(stored());
    p.clear();
    vi.advanceTimersByTime(5000);
    expect(seen).toEqual(["vault.encrypted"]);
    p.push(requested());
    expect(seen).toEqual(["vault.encrypted", "processor.requested"]);
  });
});

describe("replay", () => {
  const file = (over: Partial<ReplayFile> = {}): ReplayFile => ({
    v: 1,
    recordedAt: "2026-10-08T12:00:00.000Z",
    events: [{ t: 0, event: encrypted() }, { t: 300, event: stored() }, { t: 2000, event: approved() }],
    vaultRow: { handle: H1, status: "stored" },
    staffView: { status: 200, body: { handle: H1, ciphertextHash: HASH, status: "stored" } },
    ...over,
  });

  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("accepts a well-formed recording", () => {
    expect(parseReplay(file()).events).toHaveLength(3);
  });

  it.each([
    ["not an object", "x", /not an object/],
    ["an unknown version", { ...file(), v: 2 }, /version/],
    ["no events", file({ events: [] }), /no events/],
    ["timestamps out of order", file({ events: [{ t: 10, event: {} }, { t: 5, event: {} }] }), /order/],
    ["no staff view", { ...file(), staffView: undefined }, /staff view/],
  ])("refuses %s", (_name, bad, message) => {
    expect(() => parseReplay(bad)).toThrow(ReplayError);
    expect(() => parseReplay(bad)).toThrow(message);
  });

  it("refuses to play a recording that contains plaintext, wherever it is", () => {
    expect(() => parseReplay(file({ events: [{ t: 0, event: { event: "vault.stored", note: "ABCDE1234F" } }] }))).toThrow(/plaintext/);
    expect(() => parseReplay(file({ vaultRow: { pan: "x" } }))).toThrow(/plaintext/);
    expect(() => parseReplay(file({ staffView: { status: 200, body: { income: "6-9 LPA" } } }))).toThrow(/plaintext/);
  });

  it("plays the frames at their recorded times, scaled by the speed", () => {
    const frames: unknown[] = [];
    const player = new ReplayPlayer(file(), (f) => frames.push((f as VaultEvent).event), 2);
    expect(player.durationMs).toBe(1000);
    player.start();
    vi.advanceTimersByTime(0);
    expect(frames).toEqual(["vault.encrypted"]);
    vi.advanceTimersByTime(150);
    expect(frames).toEqual(["vault.encrypted", "vault.stored"]);
    vi.advanceTimersByTime(850);
    expect(frames).toEqual(["vault.encrypted", "vault.stored", "processor.decided"]);
  });

  it("stop cancels what has not played yet, and start again plays from the top", () => {
    const frames: unknown[] = [];
    const player = new ReplayPlayer(file(), (f) => frames.push((f as VaultEvent).event));
    player.start();
    vi.advanceTimersByTime(100);
    player.stop();
    vi.advanceTimersByTime(5000);
    expect(frames).toEqual(["vault.encrypted"]);
    player.start();
    vi.advanceTimersByTime(0);
    expect(frames).toEqual(["vault.encrypted", "vault.encrypted"]);
  });

  it("a saved session is itself a valid recording", () => {
    const saved = buildReplay([{ at: 5000, frame: encrypted() }, { at: 5400, frame: stored() }], { handle: H1 }, { status: 200, body: {} });
    expect(saved.events.map((e) => e.t)).toEqual([0, 400]);
    expect(parseReplay(saved)).toBeTruthy();
  });
});

describe("the committed recording (web/public/flow-replay.json)", () => {
  // Generated by `E2E_RECORD_FLOW=web/public/flow-replay.json pnpm e2e`; this keeps it honest if it is ever regenerated badly.
  const file = parseReplay(JSON.parse(readFileSync(resolve(process.cwd(), "public/flow-replay.json"), "utf8")));
  const events = file.events.map((e) => e.event as VaultEvent);

  it("is a real, ordered run of the whole flow, and has no plaintext in it", () => {
    expect(events.map((e) => e.event)).toEqual([
      "vault.encrypted", "vault.stored", "processor.requested", "processor.decrypting", "processor.decided",
      "processor.requested", "processor.decided", "vault.erased",
    ]);
    expect(JSON.stringify(file)).not.toMatch(/ABCDE1234F|6-9 LPA/);
    expect(events.reduce(checkFrame, cleanPrivacy)).toMatchObject({ checked: 8, violation: null });
  });

  it("plays through the lanes to Blocked and erased", () => {
    const end = run(events);
    expect(end.processor.decision).toMatchObject({ outcome: "blocked", reasonCodes: ["CONSENT_WITHDRAWN"] });
    expect(end.transit.erased).toBe(true);
    expect(end.decisionsSeen).toBe(2);
    // the last round was a refusal, which never decrypts: the timeline says so by leaving that step empty
    expect(timeline(end).filter((r) => r.atMs === null).map((r) => r.key)).toEqual(["decrypting"]);
    expect(privacyVerdict(events.reduce(checkFrame, cleanPrivacy), end.decisionsSeen)).toBe("clean");
  });

  it("answers the staff buttons with ciphertext and nothing else", () => {
    const admin = filterStaffView(file.staffView.body);
    expect(admin).toMatchObject({ hidden: 0, blocked: [], leaked: false });
    expect(admin.fields.map((f) => f.name)).toEqual(["handle", "ciphertextHash", "status"]);
    const row = filterStaffView(file.vaultRow);
    expect(row).toMatchObject({ hidden: 0, blocked: [], leaked: false });
    expect(row.fields.map((f) => f.name)).toContain("envelope");
  });
});
