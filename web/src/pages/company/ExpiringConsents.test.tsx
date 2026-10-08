// The console's "Expiring consents" table (N-03, N-04): who is about to lose consent, what a renewal request's status is,
// and that asking is one click that says nothing about whether the customer blocked the company.
import { useEffect, useState, type ReactNode } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type ExpiringRow } from "@sammati/shared";
import { WsProvider } from "../../ws";
import { effectiveState, ExpiringConsents, relativeTime } from "./ExpiringConsents";

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
const PRINCIPAL = "0xF39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

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

const respond = (status: number, body: unknown) =>
  ({ ok: status >= 200 && status < 300, status, statusText: String(status), text: async () => JSON.stringify(body), json: async () => body }) as unknown as Response;

const row = (over: Partial<ExpiringRow> = {}): ExpiringRow => ({
  principal: PRINCIPAL as ExpiringRow["principal"],
  customerAlias: "Customer #4821",
  purposeCode: "credit_check",
  expiresAt: NOW + 3600,
  state: "expiring",
  renewal: null,
  ...over,
});

let rows: ExpiringRow[];
let posted: Array<Record<string, unknown>>;
let answer: { status: number; body: unknown };

beforeEach(() => {
  sockets = [];
  rows = [];
  posted = [];
  answer = { status: 201, body: { requestId: "req_ren00001", status: "sent", expiresAt: NOW + 86400 } };
  vi.stubGlobal("WebSocket", MockSocket);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).endsWith("/renewals") && init?.method === "POST") {
        posted.push(JSON.parse(String(init.body)) as Record<string, unknown>);
        if (answer.status === 201) rows = rows.map((r) => ({ ...r, renewal: { requestId: "req_ren00001", status: "sent", requestedAt: NOW } }));
        return respond(answer.status, answer.body);
      }
      if (String(url).endsWith("/expiring")) return respond(200, { rows });
      return respond(404, {});
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** The provider connects in an effect that runs after its children's: a panel that mounts with it would listen to nothing. In the app the panel mounts later, as here. */
function Later({ children }: { children: ReactNode }): ReactNode {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  return ready ? children : null;
}

function mount() {
  render(
    <WsProvider topics={["auditor"]}>
      <Later>
        <ExpiringConsents company={company} purposes={purposes} />
      </Later>
    </WsProvider>,
  );
}
const rowEl = () => screen.findByTestId(`expiring-${PRINCIPAL}:credit_check`);

describe("the table", () => {
  it("says what it is for when nothing is expiring", async () => {
    mount();
    expect(await screen.findByText("No consents are about to expire.")).toBeTruthy();
  });

  it("lists the customer, the purpose, when it ends and whether it is Expiring or Expired, each with a word", async () => {
    rows = [row(), row({ principal: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", purposeCode: "marketing", customerAlias: null, expiresAt: NOW - 30, state: "expired" })];
    mount();
    const first = await rowEl();
    expect(first.textContent).toContain("Customer #4821");
    expect(first.textContent).toContain("Credit check");
    expect(first.textContent).toContain("Expiring");
    expect(first.textContent).toContain("in 1 hour");
    const second = screen.getByTestId("expiring-0x70997970C51812dc3A010C7d01b50e0d17dc79C8:marketing");
    expect(second.textContent).toContain("Expired");
    expect(second.textContent).toContain("Citizen");
    expect(second.textContent).toContain("30 seconds ago");
  });

  it("shows the customer as the shortened hash the Consents table uses, never the full address", async () => {
    rows = [row()];
    mount();
    const el = await rowEl();
    expect(el.textContent).toContain("0xF39F…2266");
    expect(el.textContent).not.toContain(PRINCIPAL);
  });

  it("an Expiring row turns Expired when its time passes, without a refetch", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
    try {
      rows = [row({ expiresAt: Math.floor(Date.now() / 1000) + 2 })];
      mount();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10);
      });
      expect((await rowEl()).textContent).toContain("Expiring");
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3000);
      });
      expect((await rowEl()).textContent).toContain("Expired");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("Request renewal", () => {
  it("sends the principal and purpose, then shows the request as Sent and the button as Requested", async () => {
    rows = [row()];
    mount();
    const el = await rowEl();
    fireEvent.click(within(el).getByRole("button", { name: "Request renewal" }));
    await waitFor(() => expect(within(screen.getByTestId(`expiring-${PRINCIPAL}:credit_check`)).getByRole("button", { name: "Requested" })).toBeTruthy());
    expect(posted).toEqual([{ principal: PRINCIPAL, purposeCode: "credit_check" }]);
    const after = screen.getByTestId(`expiring-${PRINCIPAL}:credit_check`);
    expect(after.textContent).toContain("Sent");
    expect((within(after).getByRole("button", { name: "Requested" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("the button is at least 48 px tall", async () => {
    rows = [row()];
    mount();
    const button = within(await rowEl()).getByRole("button", { name: "Request renewal" });
    expect(button.className).toContain("min-h-[48px]");
  });

  it("follows the customer by request id: Seen, then Granted", async () => {
    rows = [row({ renewal: { requestId: "req_ren00001", status: "sent", requestedAt: NOW } })];
    mount();
    await rowEl();
    await push({ event: "request.updated", fiduciary: company.address, requestId: "req_ren00001", status: "seen", at: NOW });
    await waitFor(() => expect(screen.getByTestId(`expiring-${PRINCIPAL}:credit_check`).textContent).toContain("Seen"));
    await push({ event: "request.updated", fiduciary: company.address, requestId: "req_ren00001", status: "granted", at: NOW });
    await waitFor(() => expect(screen.getByTestId(`expiring-${PRINCIPAL}:credit_check`).textContent).toContain("Granted"));
  });

  it("ignores another company's updates", async () => {
    rows = [row({ renewal: { requestId: "req_ren00001", status: "sent", requestedAt: NOW } })];
    mount();
    await rowEl();
    await push({ event: "request.updated", fiduciary: TEST_COMPANIES[1]!.address, requestId: "req_ren00001", status: "granted", at: NOW });
    expect(screen.getByTestId(`expiring-${PRINCIPAL}:credit_check`).textContent).toContain("Sent");
  });

  it("a renewed consent refetches, so the row follows the new expiry", async () => {
    rows = [row()];
    mount();
    await rowEl();
    rows = [];
    await push({ event: "consent.updated", principal: PRINCIPAL, fiduciary: company.address, purposeId: "0x1", purposeCode: "credit_check", status: "Active", expiresAt: NOW + 86400 * 90, txHash: "0xaa", at: NOW });
    expect(await screen.findByText("No consents are about to expire.")).toBeTruthy();
  });

  it("shows Core's rate-limit answer in its own words", async () => {
    rows = [row()];
    answer = { status: 429, body: { error: { code: "RATE_LIMITED", message: "You are sending too fast. Try again in 12 seconds." } } };
    mount();
    fireEvent.click(within(await rowEl()).getByRole("button", { name: "Request renewal" }));
    expect((await screen.findByRole("alert")).textContent).toContain("You are sending too fast. Try again in 12 seconds.");
  });

  it("looks the same whether or not the customer blocked the company: the answer is just Sent", async () => {
    rows = [row()];
    mount();
    fireEvent.click(within(await rowEl()).getByRole("button", { name: "Request renewal" }));
    await waitFor(() => expect(screen.getByTestId(`expiring-${PRINCIPAL}:credit_check`).textContent).toContain("Sent"));
    expect(document.body.textContent).not.toMatch(/block/i);
  });
});

describe("helpers", () => {
  it("relativeTime picks the largest unit and says which way", () => {
    expect([relativeTime(259200), relativeTime(7200), relativeTime(90), relativeTime(45), relativeTime(-120), relativeTime(1)]).toEqual([
      "in 3 days",
      "in 2 hours",
      "in 2 minutes",
      "in 45 seconds",
      "2 minutes ago",
      "in 1 second",
    ]);
  });

  it("effectiveState applies expiry the moment its time passes", () => {
    expect(effectiveState({ state: "expiring", expiresAt: NOW - 1 }, NOW)).toBe("expired");
    expect(effectiveState({ state: "expiring", expiresAt: NOW + 1 }, NOW)).toBe("expiring");
    expect(effectiveState({ state: "expired", expiresAt: NOW + 1 }, NOW)).toBe("expired");
  });
});
