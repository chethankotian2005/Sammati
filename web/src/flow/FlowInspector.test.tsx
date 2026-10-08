// The Data Flow Inspector as a whole screen (V-07, S-04): a fake socket plays real-shaped events, a fake network
// answers the three reads, and the test checks each lane, the privacy line and the presenter's control.
import { act, cleanup, render, screen, waitFor, within, fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WsProvider } from "../ws";
import { FlowPanel } from "./FlowInspector";
import type { ReplayFile } from "./replay";

const ASHA = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"; // the demo principal: Core holds its key
const PHONE = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const QUICKLOAN = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const H1 = `0x${"ab".repeat(32)}`;
const HASH = `0x${"cd".repeat(32)}`;
const CIPHERTEXT = `0x${"1a2b3c4d".repeat(30)}`;
const T0 = 1760000000;

const envelope = { v: 1, ephPub: `0x${"11".repeat(32)}`, nonce: `0x${"22".repeat(12)}`, ciphertext: CIPHERTEXT, tag: `0x${"44".repeat(16)}` };
const vaultRow = { handle: H1, principal: ASHA, fiduciary: QUICKLOAN, purposeCode: "credit_check", ciphertextHash: HASH, status: "stored", createdAt: T0, erasedAt: null, envelope };

const base = (principal = ASHA, at = T0) => ({ principal, fiduciary: QUICKLOAN, purposeCode: "credit_check", handle: H1, at, atMs: at * 1000 + 7 });
const frames = {
  encrypted: (p = ASHA) => ({ event: "vault.encrypted", ...base(p), ciphertextHash: HASH, sizeBytes: 301 }),
  stored: (p = ASHA) => ({ event: "vault.stored", ...base(p, T0 + 1), ciphertextHash: HASH, sizeBytes: 301 }),
  requested: (p = ASHA) => ({ event: "processor.requested", ...base(p, T0 + 5), action: "loan_decision", requestedAt: (T0 + 5) * 1000 }),
  decrypting: (p = ASHA) => ({ event: "processor.decrypting", ...base(p, T0 + 5), decryptingAt: (T0 + 5) * 1000 + 4 }),
  approved: (p = ASHA) => ({ event: "processor.decided", ...base(p, T0 + 5), decision: "approved", limit: 300000, reasonCodes: ["SCORE_FAIR"], entryId: "e1", durationMs: 9 }),
  blocked: (p = ASHA) => ({ event: "processor.decided", ...base(p, T0 + 20), decision: "blocked", limit: null, reasonCodes: ["CONSENT_WITHDRAWN"], entryId: "e2", durationMs: 3 }),
  erased: (p = ASHA) => ({ event: "vault.erased", ...base(p, T0 + 21), cause: "withdrawn" }),
  withdrawn: (p = ASHA) => ({ event: "consent.updated", principal: p, fiduciary: QUICKLOAN, purposeId: HASH, purposeCode: "credit_check", status: "Withdrawn", expiresAt: null, txHash: HASH, at: T0 + 19 }),
};

// ---- a socket the test drives ----

let sockets: MockSocket[] = [];
class MockSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  sent: string[] = [];
  constructor() {
    sockets.push(this);
  }
  send(s: string) {
    this.sent.push(s);
  }
  close() {}
}
const socket = () => sockets.at(-1)!;
const open = () => act(() => { socket().readyState = 1; socket().onopen?.(); });
const send = (frame: unknown) => act(() => socket().onmessage?.({ data: JSON.stringify(frame) }));

// ---- a network the test controls ----

interface Answers {
  admin: { status: number; body: unknown };
  row: { status: number; body: unknown };
  withdraw: { status: number; body: unknown };
  fire: { status: number; body: unknown };
  replay: unknown;
}
let answers: Answers;
let calls: string[] = [];

function respond(status: number, body: unknown) {
  const text = JSON.stringify(body);
  return { ok: status >= 200 && status < 300, status, statusText: String(status), text: async () => text, json: async () => body } as unknown as Response;
}

beforeEach(() => {
  sockets = [];
  calls = [];
  answers = {
    admin: { status: 200, body: { handle: H1, ciphertextHash: HASH, status: "stored" } },
    row: { status: 200, body: vaultRow },
    withdraw: { status: 200, body: { txHash: HASH, status: "confirmed" } },
    fire: { status: 200, body: { decision: "BLOCKED", reason: "CONSENT_WITHDRAWN", entryId: "e2" } },
    replay: null,
  };
  vi.stubGlobal("WebSocket", MockSocket);
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: /reduce/.test(q), addEventListener() {}, removeEventListener() {} }));
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const u = String(url);
      calls.push(`${init?.method ?? "GET"} ${u}`);
      if (u.endsWith("/v1/processor")) return respond(200, { url: "http://processor.test:4200" });
      if (u.includes("/v1/vault/")) return respond(answers.row.status, answers.row.body);
      if (u.includes("/customers/1/credit-profile")) return respond(answers.admin.status, answers.admin.body);
      if (u.endsWith("/v1/demo/withdraw")) return respond(answers.withdraw.status, answers.withdraw.body);
      if (u.endsWith("/v1/demo/fire")) return respond(answers.fire.status, answers.fire.body);
      if (u.endsWith("/flow-replay.json")) return answers.replay ? respond(200, answers.replay) : respond(404, {});
      return respond(404, {});
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function mount(startInReplay = false) {
  return render(
    <WsProvider topics={["auditor"]}>
      <FlowPanel startInReplay={startInReplay} />
    </WsProvider>,
  );
}

const lane = (n: number) => document.querySelector(`section[aria-labelledby="lane-${n}"]`) as HTMLElement;

async function playFullFlow(principal = ASHA) {
  await open();
  for (const f of [frames.encrypted(principal), frames.stored(principal), frames.requested(principal), frames.decrypting(principal), frames.approved(principal)]) await send(f);
}

describe("the four lanes, live", () => {
  it("starts empty, with every lane's caption and no privacy claim", async () => {
    mount();
    await open();
    expect(screen.getByRole("heading", { level: 1, name: "Data flow" })).toBeTruthy();
    for (const [n, title, caption] of [
      [1, "Wallet", "On the customer's own phone"],
      [2, "In transit and at rest", "X25519 + AES-256-GCM"],
      [3, "QuickLoan staff view", "What QuickLoan can see"],
      [4, "Sealed Processor", "Demo visualisation of a sealed processor"],
    ] as const) {
      expect(within(lane(n)).getByRole("heading", { name: title })).toBeTruthy();
      expect(within(lane(n)).getByText(caption)).toBeTruthy();
    }
    expect(screen.getAllByText("Waiting for the customer to send their details")).toHaveLength(2);
    expect(screen.queryByTestId("privacy-line")).toBeNull();
    expect(screen.getByText("● Live")).toBeTruthy();
  });

  it("follows a whole run from the events: encrypting, ciphertext in transit, decrypting, a decision", async () => {
    mount();
    await open();

    await send(frames.encrypted());
    expect(within(lane(1)).getByText("Encrypting")).toBeTruthy();
    expect(within(lane(2)).getByText("301 bytes")).toBeTruthy();

    await send(frames.stored());
    await waitFor(() => expect(within(lane(1)).getByText("Sent encrypted")).toBeTruthy());
    await waitFor(() => expect(within(lane(2)).getByTestId("ciphertext").textContent).toMatch(/^0x1a2b3c4d1a…[0-9a-f]{8}/));
    expect(calls).toContain("GET http://processor.test:4200/v1/vault/" + H1);

    await send(frames.requested());
    expect(within(lane(4)).getByRole("listitem", { current: "step" }).textContent).toContain("Waiting");
    await send(frames.decrypting());
    expect(within(lane(4)).getByRole("listitem", { current: "step" }).textContent).toContain("Decrypting");
    await send(frames.approved());
    expect(within(lane(4)).getByRole("listitem", { current: "step" }).textContent).toContain("Decision");
    const decision = within(lane(4)).getByTestId("decision");
    expect(decision.textContent).toContain("Approved");
    expect(decision.textContent).toContain("Limit 3,00,000");
    expect(decision.textContent).toContain("SCORE_FAIR");

    // the timeline is from the events' own timestamps
    const steps = within(screen.getByRole("list", { name: "Step by step" })).getAllByRole("listitem");
    expect(steps.map((s) => s.textContent?.includes("—"))).toEqual([false, false, false, false, false, true]);
    expect(steps[3]!.textContent).toContain("+4 ms");
  });

  it("the sealed box shows masks by shape and never the values, whatever it has decided", async () => {
    mount();
    await playFullFlow();
    const box = within(lane(4)).getByTestId("processor-box");
    expect(box.textContent).toContain("••••• •••• •");
    expect(lane(4).textContent).not.toMatch(/ABCDE1234F|6-9 LPA|742/);
    expect(lane(2).textContent).not.toMatch(/ABCDE1234F|6-9 LPA/);
    expect(lane(3).textContent).not.toMatch(/ABCDE1234F|6-9 LPA/);
    // only the customer's own phone shows them
    expect(within(lane(1)).getByTestId("wallet-fields").textContent).toContain("ABCDE1234F");
  });

  it("says the line about plaintext only after a decision, and only while nothing leaked", async () => {
    mount();
    await open();
    await send(frames.encrypted());
    await send(frames.stored());
    expect(screen.queryByTestId("privacy-line")).toBeNull();
    await send(frames.requested());
    await send(frames.decrypting());
    await send(frames.approved());
    await waitFor(() => expect(screen.getByTestId("privacy-line").textContent).toContain("No plaintext was visible to QuickLoan or any third party"));
  });

  it("hides that line, and says so loudly, if any event of the session carried a plaintext value", async () => {
    mount();
    await playFullFlow();
    expect(screen.getByTestId("privacy-line")).toBeTruthy();

    await send({ event: "access.logged", principal: ASHA, note: "customer PAN ABCDE1234F" }); // not even a vault event
    expect(screen.queryByTestId("privacy-line")).toBeNull();
    expect(screen.getByTestId("privacy-violation").textContent).toContain("Plaintext found in an event");

    // and it stays that way
    await send(frames.stored());
    expect(screen.queryByTestId("privacy-line")).toBeNull();
    expect(screen.getByTestId("privacy-violation")).toBeTruthy();
  });

  it("a profile field smuggled into a Processor event never reaches the Processor lane", async () => {
    mount();
    await open();
    await send(frames.encrypted());
    await send({ ...frames.approved(), pan: "ABCDE1234F" });
    expect(lane(4).textContent).not.toContain("ABCDE1234F");
    expect(screen.getByTestId("privacy-violation")).toBeTruthy();
  });

  it("shows the Live feed offline chip when the socket is not open, and disables the presenter control", async () => {
    mount();
    expect(screen.getByText(/Live feed offline/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Withdraw and re-run" }) as HTMLButtonElement).disabled).toBe(true);
    await open();
    expect(screen.getByText("● Live")).toBeTruthy();
  });

  it("follows one customer and ignores another's events", async () => {
    mount();
    await playFullFlow();
    await send({ ...frames.blocked(PHONE), principal: PHONE });
    expect(within(lane(4)).getByTestId("decision").textContent).toContain("Approved");
  });
});

describe("the staff lane can only ever show ciphertext", () => {
  const click = async (name: string) => {
    fireEvent.click(screen.getByRole("button", { name }));
    await waitFor(() => expect(calls.some((c) => c.includes(name === "Try to read database" ? "/v1/vault/" : "credit-profile"))).toBe(true));
  };

  it("Try to view customer data: the hash of the ciphertext and 'Not authorised to read content', nothing else", async () => {
    mount();
    await playFullFlow();
    await click("Try to view customer data");
    const answer = await screen.findByTestId("staff-admin");
    expect(answer.textContent).toContain("HTTP 200");
    expect(answer.textContent).toContain("ciphertextHash");
    expect(answer.textContent).toContain("Not authorised to read content");
    expect(calls).toContain(`GET http://localhost:4101/customers/1/credit-profile`);
    expect(answer.textContent).not.toMatch(/ABCDE1234F|6-9 LPA/);
  });

  it("Try to read database: the raw ciphertext row, and it says so", async () => {
    mount();
    await playFullFlow();
    await click("Try to read database");
    const answer = await screen.findByTestId("staff-database");
    expect(answer.textContent).toContain("ciphertext");
    expect(answer.textContent).toContain("A database administrator sees ciphertext only.");
    expect(answer.textContent).not.toMatch(/ABCDE1234F|6-9 LPA/);
  });

  it("if the admin endpoint ever returned the profile, the lane would not show it", async () => {
    answers.admin = { status: 200, body: { handle: H1, ciphertextHash: HASH, status: "stored", pan: "ABCDE1234F", incomeBand: "6-9 LPA", score: 742 } };
    mount();
    await playFullFlow();
    await click("Try to view customer data");
    const answer = await screen.findByTestId("staff-admin");
    expect(answer.textContent).not.toContain("ABCDE1234F");
    expect(answer.textContent).not.toContain("6-9 LPA");
    expect(answer.textContent).toContain("3 unrecognised field(s) not shown");
    expect(answer.textContent).toContain("Plaintext was in this answer and was not shown");
  });

  it("a known field carrying plaintext is replaced by the block marker", async () => {
    answers.admin = { status: 200, body: { handle: "ABCDE1234F", ciphertextHash: HASH, status: "stored" } };
    mount();
    await playFullFlow();
    await click("Try to view customer data");
    const answer = await screen.findByTestId("staff-admin");
    expect(answer.textContent).not.toContain("ABCDE1234F");
    expect(answer.textContent).toContain("Blocked: looks like plaintext");
  });

  it("after a withdrawal the admin endpoint refuses, and the lane shows only the reason", async () => {
    answers.admin = { status: 451, body: { code: "CONSENT_WITHDRAWN", message: "The user withdrew consent for this purpose." } };
    mount();
    await playFullFlow();
    await click("Try to view customer data");
    const answer = await screen.findByTestId("staff-admin");
    expect(answer.textContent).toContain("HTTP 451");
    expect(answer.textContent).toContain("CONSENT_WITHDRAWN");
    expect(answer.textContent).not.toContain("The user withdrew");
  });

  it("an unreachable company or vault is said plainly", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("down"); }));
    mount();
    await open();
    await send(frames.encrypted());
    fireEvent.click(screen.getByRole("button", { name: "Try to view customer data" }));
    expect((await screen.findByTestId("staff-admin")).textContent).toContain("QuickLoan's backend did not answer");
    fireEvent.click(screen.getByRole("button", { name: "Try to read database" }));
    expect((await screen.findByTestId("staff-database")).textContent).toContain("The vault did not answer");
  });
});

describe("Withdraw and re-run", () => {
  it("for the demo customer: Core withdraws, the apply is fired, and the lanes show Blocked and 'Ciphertext erased'", async () => {
    mount();
    await playFullFlow(ASHA);
    fireEvent.click(screen.getByRole("button", { name: "Withdraw and re-run" }));
    await waitFor(() => expect(calls).toContain("POST http://localhost:4000/v1/demo/withdraw"));
    await waitFor(() => expect(calls).toContain("POST http://localhost:4000/v1/demo/fire"));
    const fireCall = (fetch as unknown as { mock: { calls: Array<[string, RequestInit]> } }).mock.calls.find(([u]) => u.endsWith("/v1/demo/fire"))!;
    expect(JSON.parse(fireCall[1].body as string)).toMatchObject({ purposeCode: "credit_check", principal: ASHA, action: "loan_decision" });
    await waitFor(() => expect(screen.getByText("BLOCKED · CONSENT_WITHDRAWN")).toBeTruthy());

    // what the screen shows comes from the events that follow
    await send(frames.blocked());
    await send(frames.erased());
    const decision = within(lane(4)).getByTestId("decision");
    expect(decision.textContent).toContain("Blocked");
    expect(decision.textContent).toContain("451 · CONSENT_WITHDRAWN");
    expect(within(lane(2)).getByText("Ciphertext erased")).toBeTruthy();
    expect(screen.getByTestId("privacy-line")).toBeTruthy();
  });

  it("for a real phone: asks for the withdrawal on the phone, waits for its event, then applies", async () => {
    answers.withdraw = { status: 403, body: { error: { code: "NOT_A_DEMO_PRINCIPAL", message: "withdraw on their phone" } } };
    mount();
    await playFullFlow(PHONE);
    fireEvent.click(screen.getByRole("button", { name: "Withdraw and re-run" }));
    await waitFor(() => expect(screen.getByText("Withdraw on the phone now")).toBeTruthy());
    expect(calls).not.toContain("POST http://localhost:4000/v1/demo/fire");

    await send(frames.withdrawn("0x0000000000000000000000000000000000000009")); // someone else's: not ours
    expect(calls).not.toContain("POST http://localhost:4000/v1/demo/fire");

    await send(frames.withdrawn(PHONE));
    await waitFor(() => expect(calls).toContain("POST http://localhost:4000/v1/demo/fire"));
    await waitFor(() => expect(screen.getByText("BLOCKED · CONSENT_WITHDRAWN")).toBeTruthy());
  });

  it("can be cancelled while it waits for the phone", async () => {
    answers.withdraw = { status: 403, body: { error: { code: "NOT_A_DEMO_PRINCIPAL", message: "x" } } };
    mount();
    await playFullFlow(PHONE);
    fireEvent.click(screen.getByRole("button", { name: "Withdraw and re-run" }));
    await waitFor(() => screen.getByText("Withdraw on the phone now"));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByText("Withdraw on the phone now")).toBeNull();
    await send(frames.withdrawn(PHONE));
    expect(calls).not.toContain("POST http://localhost:4000/v1/demo/fire");
  });

  it("says what went wrong", async () => {
    answers.withdraw = { status: 500, body: { error: { code: "INTERNAL", message: "Unexpected error" } } };
    mount();
    await playFullFlow();
    fireEvent.click(screen.getByRole("button", { name: "Withdraw and re-run" }));
    await waitFor(() => expect(screen.getByText("Unexpected error")).toBeTruthy());
  });
});

describe("replay", () => {
  const recording = (): ReplayFile => ({
    v: 1,
    recordedAt: "2026-10-08T12:00:00.000Z",
    events: [
      { t: 0, event: frames.encrypted() },
      { t: 10, event: frames.stored() },
      { t: 20, event: frames.requested() },
      { t: 30, event: frames.decrypting() },
      { t: 40, event: frames.approved() },
      { t: 50, event: frames.requested() },
      { t: 60, event: frames.blocked() },
      { t: 70, event: frames.erased() },
    ],
    vaultRow,
    staffView: { status: 200, body: { handle: H1, ciphertextHash: HASH, status: "stored" } },
  });

  it("plays a recording through the same lanes, marked as a recording, with no stack running", async () => {
    answers.replay = recording();
    vi.stubGlobal("fetch", vi.fn(async (url: string) => (String(url).endsWith("/flow-replay.json") ? respond(200, answers.replay) : Promise.reject(new TypeError("no stack")))));
    mount(true);
    expect(screen.getByText("⏺ Replay of a recording")).toBeTruthy();
    await waitFor(() => expect(within(lane(2)).getByText("Ciphertext erased")).toBeTruthy(), { timeout: 3000 });
    expect(within(lane(1)).getByText("Sent encrypted")).toBeTruthy();
    expect(within(lane(4)).getByTestId("decision").textContent).toContain("Blocked");
    expect(within(lane(2)).getByTestId("ciphertext").textContent).toContain("0x1a2b3c4d1a");
    expect(screen.getByTestId("privacy-line")).toBeTruthy();
    // the presenter's control is off: the recording already holds the withdrawal
    expect((screen.getByRole("button", { name: "Withdraw and re-run" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("answers the staff buttons from the recording and says they are recorded", async () => {
    answers.replay = recording();
    vi.stubGlobal("fetch", vi.fn(async (url: string) => (String(url).endsWith("/flow-replay.json") ? respond(200, answers.replay) : Promise.reject(new TypeError("no stack")))));
    mount(true);
    await waitFor(() => within(lane(2)).getByText("Ciphertext erased"), { timeout: 3000 });
    fireEvent.click(screen.getByRole("button", { name: "Try to view customer data" }));
    const admin = await screen.findByTestId("staff-admin");
    expect(admin.textContent).toContain("recorded");
    expect(admin.textContent).toContain("Not authorised to read content");
    fireEvent.click(screen.getByRole("button", { name: "Try to read database" }));
    expect((await screen.findByTestId("staff-database")).textContent).toContain("recorded");
  });

  it("refuses a recording that contains plaintext, and says so", async () => {
    answers.replay = { ...recording(), events: [{ t: 0, event: { event: "vault.stored", note: "ABCDE1234F" } }] };
    mount(true);
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("refusing to play it"));
    expect(lane(1).textContent).toContain("Waiting for the customer to send their details");
  });

  it("says when there is no recording at all", async () => {
    mount(true);
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("no recording"));
  });

  it("switches between live and replay with the Replay button, starting each clean", async () => {
    answers.replay = recording();
    mount();
    await playFullFlow();
    fireEvent.click(screen.getByRole("button", { name: "Replay" }));
    expect(screen.getByText("⏺ Replay of a recording")).toBeTruthy();
    expect(within(lane(4)).queryByText(/Approved/)).toBeNull(); // the live run's state is gone
    fireEvent.click(screen.getByRole("button", { name: "Back to live" }));
    expect(screen.queryByText("⏺ Replay of a recording")).toBeNull();
    expect(screen.getByText("● Live")).toBeTruthy();
  });
});

describe("reduced motion", () => {
  it("applies events with no pacing at all", async () => {
    mount();
    await playFullFlow();
    // all six states reached in one go, without waiting a dwell for any
    expect(within(lane(4)).getByTestId("decision").textContent).toContain("Approved");
  });
});
