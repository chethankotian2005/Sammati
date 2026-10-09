// QuickLoan's customer page, driven through the screen the way one person would on stage (C-09): sign in, tick,
// scan, share in the wallet, Apply, withdraw. The socket and the network are test doubles; the page and its state machine
// are the real ones.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WsProvider } from "../ws";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { DirectoryProvider } from "../directory";
import { PortalPage } from "./PortalPage";

const QUICKLOAN = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const ASHA = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const H1 = `0x${"ab".repeat(32)}`;
const HASH = `0x${"cd".repeat(32)}`;
const TX = `0x${"12".repeat(32)}`;
const NOW_S = () => Math.floor(Date.now() / 1000);

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
  constructor() {
    sockets.push(this);
  }
  send() {}
  close() {}
}
const open = () => act(() => { sockets.at(-1)!.readyState = 1; sockets.at(-1)!.onopen?.(); });
const send = (frame: unknown) => act(() => sockets.at(-1)!.onmessage?.({ data: JSON.stringify(frame) }));

const frames = {
  granted: () => ({ event: "consent.updated", principal: ASHA, fiduciary: QUICKLOAN, purposeId: HASH, purposeCode: "credit_check", status: "Active", expiresAt: null, txHash: TX, at: NOW_S() + 2 }),
  withdrawn: () => ({ event: "consent.updated", principal: ASHA, fiduciary: QUICKLOAN, purposeId: HASH, purposeCode: "credit_check", status: "Withdrawn", expiresAt: null, txHash: HASH, at: NOW_S() + 9 }),
  stored: () => ({ event: "vault.stored", principal: ASHA, fiduciary: QUICKLOAN, purposeCode: "credit_check", handle: H1, ciphertextHash: HASH, at: NOW_S() + 4, atMs: 1, sizeBytes: 300 }),
  erased: () => ({ event: "vault.erased", principal: ASHA, fiduciary: QUICKLOAN, purposeCode: "credit_check", handle: H1, cause: "withdrawn", at: NOW_S() + 10, atMs: 1 }),
};

let calls: Array<{ method: string; url: string; body?: unknown }> = [];
let applyAnswer: { status: number; body: unknown };

const respond = (status: number, body: unknown) =>
  ({ ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body), json: async () => body }) as unknown as Response;

beforeEach(() => {
  sockets = [];
  calls = [];
  applyAnswer = { status: 200, body: { decision: "approved", limit: 300000, reasonCodes: ["SCORE_FAIR"], entryId: "e1" } };
  vi.stubGlobal("WebSocket", MockSocket);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const u = String(url);
      const method = init?.method ?? "GET";
      calls.push({ method, url: u, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      if (u.endsWith("/v1/fiduciaries")) return respond(200, { fiduciaries: [{ address: QUICKLOAN, slug: "quickloan", name: "QuickLoan", sector: "Lending", color: "#16173F", sandbox: false }] });
      if (u.endsWith("/purposes")) return respond(200, { fiduciary: QUICKLOAN, purposes: [
        { id: "0x01", code: "credit_check", description: { en: "Check your credit eligibility" }, sharesThirdParty: false },
        { id: "0x02", code: "marketing", description: { en: "Send you loan offers" }, sharesThirdParty: true },
        { id: "0x03", code: "bureau_share", description: { en: "Share repayment history with credit bureaus" }, sharesThirdParty: true },
      ] });
      if (u.endsWith("/requests")) return respond(201, { requestId: "req_abc12345", qrPayload: { v: 1, requestId: "req_abc12345", fiduciary: QUICKLOAN, name: "QuickLoan" } });
      if (u.endsWith("/consents")) return respond(200, { fiduciary: QUICKLOAN, rows: [{ principal: ASHA, customerAlias: "Asha" }] });
      if (u.includes("/apply")) return respond(applyAnswer.status, applyAnswer.body);
      return respond(404, {});
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function mount() {
  return render(
    <WsProvider topics={["auditor"]}>
      <DirectoryProvider>
        <MemoryRouter initialEntries={["/portal/quickloan"]}>
          <Routes>
            <Route path="/portal/:slug" element={<PortalPage />} />
          </Routes>
        </MemoryRouter>
      </DirectoryProvider>
    </WsProvider>,
  );
}

const signIn = async (alias = "Asha") => {
  fireEvent.change(await screen.findByLabelText("Your customer ID"), { target: { value: alias } });
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
};
const mainBox = () => screen.getByRole("checkbox", { name: "Allow QuickLoan to use my data for loan purposes" }) as HTMLInputElement;
const apply = () => screen.getByRole("button", { name: /^Apply/ }) as HTMLButtonElement;

describe("logged out", () => {
  it("asks for a name or ID and nothing else: no field for a PAN or an income", async () => {
    mount();
    await open();
    expect(screen.getByRole("heading", { name: "Sign in to apply" })).toBeTruthy();
    const inputs = document.querySelectorAll("input, textarea, select");
    expect(inputs).toHaveLength(1);
    expect((inputs[0] as HTMLInputElement).type).toBe("text");
    expect(document.body.textContent).not.toMatch(/\bPAN\b|income|salary|employment/i);
  });

  it("refuses a PAN typed into the one field, and says why", async () => {
    mount();
    await signIn("ABCDE1234F");
    expect(screen.getByRole("alert").textContent).toContain("That looks like a PAN. QuickLoan does not need it here.");
    expect(screen.queryByRole("heading", { name: "Apply for a loan" })).toBeNull();
  });
});

describe("the application form", () => {
  it("shows the consent box unticked with the purposes beneath it in plain language, nothing pre-ticked, Apply off", async () => {
    mount();
    await signIn();
    expect(screen.getByText("Hello, Asha")).toBeTruthy();
    expect(mainBox().checked).toBe(false);
    const list = screen.getByRole("list", { name: "What QuickLoan will use your data for" });
    expect(within(list).getByText("Check your credit eligibility")).toBeTruthy();
    const optional = within(list).getAllByRole("checkbox") as HTMLInputElement[];
    expect(optional.map((c) => c.checked)).toEqual([false, false]);
    expect(within(list).getByText("Send you loan offers")).toBeTruthy();
    expect(within(list).getByText(/Share repayment history with credit bureaus/)).toBeTruthy();
    expect(within(list).getAllByText("Shared with third parties")).toHaveLength(2); // loan offers go to an ad partner, repayment history to bureaus
    expect(apply().disabled).toBe(true);
    expect(screen.getByText("Allow the use of your data first")).toBeTruthy();
  });
});

describe("the whole loop, in the order a person does it", () => {
  it("tick, scan, approve, share in the wallet, apply, see the decision, withdraw, Apply is blocked", async () => {
    mount();
    await open();
    await signIn();

    // 1. tick: the request is made and the QR appears on the same page
    fireEvent.click(mainBox());
    await screen.findByText("Waiting for you to approve in the Sammati app...");
    expect(calls.find((c) => c.url.endsWith("/requests"))).toMatchObject({ method: "POST", body: { purposes: ["credit_check"], customerAlias: "Asha" } });
    expect(document.querySelector("svg")).toBeTruthy();
    expect(screen.getByText("Waiting")).toBeTruthy();
    expect(apply().disabled).toBe(true);
    for (const box of within(screen.getByRole("list", { name: "What QuickLoan will use your data for" })).getAllByRole("checkbox")) expect((box as HTMLInputElement).disabled).toBe(true);

    // 2. the customer approves in the wallet: the page follows
    await send(frames.granted());
    await screen.findByText("Consent received");
    expect(screen.getByText("Recorded on the ledger")).toBeTruthy();
    const rows = within(screen.getByRole("list", { name: "Your sensitive details" })).getAllByRole("listitem");
    expect(rows.map((r) => r.textContent)).toEqual(
      ["PAN", "Income", "Employment"].map((f) => expect.stringContaining(f)),
    );
    for (const r of rows) expect(r.textContent).toContain("Provided securely in your Sammati app");
    expect(apply().disabled).toBe(true);
    expect(screen.getByText("Share your details in the Sammati app")).toBeTruthy();

    // 3. the details go from the wallet to the Processor: only a handle and a hash reach the page
    await send(frames.stored());
    await screen.findByText("Data submitted securely");
    expect(screen.getByText(/QuickLoan holds only a reference/)).toBeTruthy();
    expect(document.body.textContent).toContain("Handle");
    expect(document.body.textContent).toContain("Ciphertext hash");
    expect(apply().disabled).toBe(false);

    // 4. Apply: the decision card, never data
    fireEvent.click(apply());
    const card = await screen.findByTestId("decision-card");
    expect(card.textContent).toContain("Approved");
    expect(card.textContent).toContain("Limit 3,00,000");
    expect(card.textContent).toContain("SCORE_FAIR");
    expect(calls.find((c) => c.url.includes("/apply"))).toMatchObject({ method: "POST", url: "http://localhost:4310/customers/Asha/apply" });
    expect(document.body.textContent).not.toMatch(/ABCDE1234F|6-9 LPA|salaried/);

    // 5. withdraw: the page changes at once and Apply is off
    await send(frames.withdrawn());
    await screen.findByText("Consent withdrawn. Application cannot be processed");
    expect(apply().disabled).toBe(true);
    expect(screen.queryByTestId("decision-card")).toBeNull();
    await send(frames.erased());
    expect(screen.getByText("Your encrypted details were erased.")).toBeTruthy();
    const before = calls.length;
    fireEvent.click(apply());
    expect(calls.length).toBe(before);
  });

  it("carries the optional purposes the customer ticked into the request", async () => {
    mount();
    await signIn();
    const [offers] = within(screen.getByRole("list", { name: "What QuickLoan will use your data for" })).getAllByRole("checkbox");
    fireEvent.click(offers!);
    fireEvent.click(mainBox());
    await screen.findByText("Waiting for you to approve in the Sammati app...");
    expect(calls.find((c) => c.url.endsWith("/requests"))!.body).toMatchObject({ purposes: ["credit_check", "marketing"] });
  });

  it("unticking cancels the wait and brings the form back", async () => {
    mount();
    await signIn();
    fireEvent.click(mainBox());
    await screen.findByText("Waiting for you to approve in the Sammati app...");
    fireEvent.click(mainBox());
    await waitFor(() => expect(screen.queryByText("Waiting for you to approve in the Sammati app...")).toBeNull());
    expect(mainBox().checked).toBe(false);
  });

  it("ignores another customer's consent while waiting", async () => {
    mount();
    await signIn();
    fireEvent.click(mainBox());
    await screen.findByText("Waiting for you to approve in the Sammati app...");
    await send({ ...frames.granted(), principal: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC" });
    expect(screen.queryByText("Consent received")).toBeNull();
  });
});

describe("errors", () => {
  it("shows what failed and offers to try again, keeping the form", async () => {
    mount();
    await signIn();
    vi.stubGlobal("fetch", vi.fn(async () => respond(503, { error: { message: "Could not reach the ledger" } })));
    fireEvent.click(mainBox());
    const alert = await screen.findByText(/Could not reach the ledger/);
    expect(alert).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(screen.getByRole("heading", { name: "Apply for a loan" })).toBeTruthy();
    expect(screen.queryByText(/Could not reach the ledger/)).toBeNull();
  });

  it("an apply that fails says so and leaves Apply available to retry", async () => {
    mount();
    await open();
    await signIn();
    fireEvent.click(mainBox());
    await screen.findByText("Waiting for you to approve in the Sammati app...");
    await send(frames.granted());
    await screen.findByText("Consent received");
    await send(frames.stored());
    await screen.findByText("Data submitted securely");
    applyAnswer = { status: 409, body: { error: { code: "NO_SUBMISSION", message: "This customer has not sent their details yet" } } };
    fireEvent.click(apply());
    await screen.findByText(/has not sent their details yet/);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(apply().disabled).toBe(false);
  });

  it("stops, and says so, if a profile value ever arrives in a live event", async () => {
    mount();
    await open();
    await signIn();
    fireEvent.click(mainBox());
    await screen.findByText("Waiting for you to approve in the Sammati app...");
    await send({ event: "access.logged", principal: ASHA, note: "PAN ABCDE1234F" });
    expect((await screen.findByRole("alert")).textContent).toContain("A profile value appeared in a live event");
    expect(document.body.textContent).not.toContain("ABCDE1234F");
  });
});
