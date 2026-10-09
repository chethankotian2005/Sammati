// The console's "Send to user" tab (N-02): one answer whatever the ID, statuses that follow the customer's own
// actions, and no way to learn who the customer is.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type TargetedRequestRow } from "@sammati/shared";
import { WsProvider } from "../../ws";
import { NewRequestSection } from "./NewRequestSection";
import { effectiveStatus } from "./SendToUserPanel";

import { TEST_COMPANIES } from "@sammati/test-fixtures";
const seed = TEST_COMPANIES[0]!;
const company = { address: seed.address, slug: seed.slug, name: seed.name, sector: seed.sector, color: seed.color, sandbox: false, demo: true };
const purposes = seed.purposes.map((p) => ({
  id: `0x${p.code}`,
  code: p.code,
  title: p.title,
  description: p.description,
  dataCategories: p.dataCategories,
  retentionDays: p.retentionDays,
  sharesThirdParty: p.sharesThirdParty,
  required: p.required,
}));
const NOW = Math.floor(Date.now() / 1000);

let sockets: MockSocket[] = [];
class MockSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  readyState = 1;
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
const push = (frame: unknown) => act(() => sockets.at(-1)!.onmessage?.({ data: JSON.stringify(frame) }));

let rows: TargetedRequestRow[];
let posted: Array<Record<string, unknown>>;
let answer: { status: number; body: unknown };

const respond = (status: number, body: unknown) =>
  ({ ok: status >= 200 && status < 300, status, statusText: String(status), text: async () => JSON.stringify(body), json: async () => body }) as unknown as Response;

beforeEach(() => {
  sockets = [];
  rows = [];
  posted = [];
  answer = { status: 201, body: { requestId: "req_aaaa0001", status: "sent", expiresAt: NOW + 72 * 3600 } };
  vi.stubGlobal("WebSocket", MockSocket);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).endsWith("/requests/targeted") && init?.method === "POST") {
        const body = JSON.parse(String(init.body)) as Record<string, unknown>;
        posted.push(body);
        if (answer.status === 201) {
          rows = [
            { requestId: "req_aaaa0001", handle: String(body.handle), purposes: body.purposes as string[], message: (body.message as string) ?? null, status: "sent", createdAt: NOW, expiresAt: NOW + 72 * 3600 },
            ...rows,
          ];
        }
        return respond(answer.status, answer.body);
      }
      if (String(url).endsWith("/requests/targeted")) return respond(200, { requests: rows });
      return respond(404, {});
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function mount(onOpenConsents = vi.fn()) {
  render(
    <WsProvider topics={["auditor"]}>
      <NewRequestSection company={company} purposes={purposes} onOpenConsents={onOpenConsents} />
    </WsProvider>,
  );
  fireEvent.click(screen.getByRole("tab", { name: "Send to user" }));
  return onOpenConsents;
}
const idField = () => screen.getByLabelText("Sammati ID") as HTMLInputElement;
const sendButton = () => screen.getByRole("button", { name: "Send request" }) as HTMLButtonElement;

describe("the tabs", () => {
  it("keep the QR for in-person use and add Send to user", () => {
    render(
      <WsProvider topics={["auditor"]}>
        <NewRequestSection company={company} purposes={purposes} />
      </WsProvider>,
    );
    expect(screen.getByRole("tab", { name: "QR (in person)" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText("New Consent Request")).toBeTruthy(); // the QR tab, untouched
    fireEvent.click(screen.getByRole("tab", { name: "Send to user" }));
    expect(screen.getByRole("tab", { name: "Send to user" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByLabelText("Sammati ID")).toBeTruthy();
    expect(screen.queryByText("New Consent Request")).toBeNull();
  });
});

describe("sending", () => {
  it("needs a well-formed ID and a purpose, and says what an ID looks like", () => {
    mount();
    expect(sendButton().disabled).toBe(true);
    fireEvent.change(idField(), { target: { value: "asha" } });
    expect(screen.getByText(/An ID looks like asha@sammati/)).toBeTruthy();
    expect(sendButton().disabled).toBe(true);
    fireEvent.change(idField(), { target: { value: "Asha@Sammati" } });
    expect(sendButton().disabled).toBe(false); // case does not matter
    fireEvent.click(screen.getByRole("checkbox", { name: "Credit check" })); // untick the only purpose
    expect(sendButton().disabled).toBe(true);
  });

  it("posts the ID, the purposes, the message and the expiry", async () => {
    mount();
    fireEvent.change(idField(), { target: { value: " Asha@Sammati " } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Loan offers" }));
    fireEvent.change(screen.getByLabelText("Message (optional)"), { target: { value: "  Your form is ready  " } });
    fireEvent.change(screen.getByLabelText("Expires in"), { target: { value: "24" } });
    fireEvent.click(sendButton());
    await screen.findByTestId("sent-note");
    expect(posted).toEqual([{ handle: "asha@sammati", purposes: ["credit_check", "marketing"], message: "Your form is ready", expiresInHours: 24 }]);
  });

  it("says Request sent, and says it tells nothing about whether the ID exists", async () => {
    mount();
    fireEvent.change(idField(), { target: { value: "nobody@sammati" } });
    fireEvent.click(sendButton());
    expect((await screen.findByTestId("sent-note")).textContent).toContain("Request sent. We tell you nothing about whether this ID exists.");
    expect(idField().value).toBe(""); // ready for the next one
  });

  it("counts the message and refuses one that is too long", () => {
    mount();
    fireEvent.change(idField(), { target: { value: "asha@sammati" } });
    fireEvent.change(screen.getByLabelText("Message (optional)"), { target: { value: "x".repeat(141) } });
    expect(screen.getByText("141/140")).toBeTruthy();
    expect(sendButton().disabled).toBe(true);
  });

  it("shows Core's rate-limit answer in its own words", async () => {
    answer = { status: 429, body: { error: { code: "RATE_LIMITED", message: "You are sending too fast. Try again in 12 seconds." } } };
    mount();
    fireEvent.change(idField(), { target: { value: "asha@sammati" } });
    fireEvent.click(sendButton());
    expect((await screen.findByRole("alert")).textContent).toContain("You are sending too fast. Try again in 12 seconds.");
  });
});

describe("the requests sent", () => {
  const sent = (over: Partial<TargetedRequestRow> = {}): TargetedRequestRow => ({
    requestId: "req_aaaa0001",
    handle: "asha@sammati",
    purposes: ["credit_check"],
    message: null,
    status: "sent",
    createdAt: NOW,
    expiresAt: NOW + 3600,
    ...over,
  });

  it("lists each with the ID as typed, its purposes and a status chip", async () => {
    rows = [sent(), sent({ requestId: "req_aaaa0002", handle: "ravi@sammati", status: "declined" })];
    mount();
    const row = await screen.findByTestId("row-req_aaaa0001");
    expect(row.textContent).toContain("asha@sammati");
    expect(row.textContent).toContain("credit_check");
    expect(row.textContent).toContain("Sent");
    expect(screen.getByTestId("row-req_aaaa0002").textContent).toContain("Declined");
  });

  it("follows the customer: Seen, then Granted, live, by request id", async () => {
    rows = [sent()];
    mount();
    await screen.findByTestId("row-req_aaaa0001");
    await push({ event: "request.updated", fiduciary: company.address, requestId: "req_aaaa0001", status: "seen", at: NOW });
    await waitFor(() => expect(screen.getByTestId("row-req_aaaa0001").textContent).toContain("Seen"));
    await push({ event: "request.updated", fiduciary: company.address, requestId: "req_aaaa0001", status: "granted", at: NOW });
    await waitFor(() => expect(screen.getByTestId("row-req_aaaa0001").textContent).toContain("Granted"));
  });

  it("ignores another company's updates", async () => {
    rows = [sent()];
    mount();
    await screen.findByTestId("row-req_aaaa0001");
    await push({ event: "request.updated", fiduciary: TEST_COMPANIES[1]!.address, requestId: "req_aaaa0001", status: "granted", at: NOW });
    expect(screen.getByTestId("row-req_aaaa0001").textContent).toContain("Sent");
  });

  it("a Granted row links to the Consents section", async () => {
    rows = [sent({ status: "granted" })];
    const open = mount();
    const row = await screen.findByTestId("row-req_aaaa0001");
    fireEvent.click(within(row).getByRole("button", { name: "Open Consents" }));
    expect(open).toHaveBeenCalled();
  });

  it("a request past its time reads Expired without waiting for the server", async () => {
    rows = [sent({ expiresAt: NOW - 5 })];
    mount();
    expect((await screen.findByTestId("row-req_aaaa0001")).textContent).toContain("Expired");
  });

  it("holds nothing that could identify the customer: there is no field for an address, and none is shown", async () => {
    rows = [sent()];
    mount();
    await screen.findByTestId("row-req_aaaa0001");
    expect(document.body.textContent).not.toMatch(/0x[0-9a-fA-F]{40}/);
    expect(effectiveStatus({ status: "sent", expiresAt: NOW - 1 }, NOW)).toBe("expired");
    expect(effectiveStatus({ status: "granted", expiresAt: NOW - 1 }, NOW)).toBe("granted");
    expect(effectiveStatus({ status: "seen", expiresAt: NOW + 1 }, NOW)).toBe("seen");
  });
});
