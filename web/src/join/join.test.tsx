// /join, the application status and onboarding result page, and the regulator's Registrations tab
// (prd.md R-01 to R-03; ui.md §3.2, §3.3, §4).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type ApplicationView, type RegistrationStatusResponse } from "@sammati/shared";
import { AppRoutes } from "../App";
import { gatewaySnippet } from "./quickstart";

const ADDRESS = "0x9A8f1b0e5d3c4a2b7e6f5d4c3b2a1908f7e6d5c4";
const KEY = "sk_" + "A".repeat(43);

const MockWs = vi.fn().mockImplementation(() => ({ send: vi.fn(), close: vi.fn(), readyState: 0 }));

interface Call {
  method: string;
  url: string;
  body: unknown;
  headers: Record<string, string>;
}
let calls: Call[];
type Handler = (call: Call) => { status?: number; json: unknown } | undefined;
let handlers: Handler[];

/** A Core stand-in: the first handler that knows the call answers; everything else is an empty 200. */
function stubCore(...more: Handler[]): void {
  handlers = more;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const call: Call = {
        method: init?.method ?? "GET",
        url: String(url).replace(/^https?:\/\/[^/]+/, ""),
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
        headers: (init?.headers ?? {}) as Record<string, string>,
      };
      calls.push(call);
      const answer = [...handlers, directory].map((h) => h(call)).find((a) => a !== undefined) ?? { json: {} };
      const status = answer.status ?? 200;
      return { ok: status < 400, status, statusText: "", json: async () => answer.json };
    }),
  );
}
const directory: Handler = (c) => (c.url === "/v1/fiduciaries" ? { json: { fiduciaries: [] } } : undefined);

beforeEach(() => {
  calls = [];
  vi.stubGlobal("WebSocket", MockWs);
  stubCore();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

function at(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>,
  );
}

describe("/join (R-01)", () => {
  it("shows what is wrong, beneath the field, with an icon and words, and sends nothing", async () => {
    at("/join");
    fireEvent.click(screen.getByRole("button", { name: "Send for review" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/Company name/);
    expect(alert.textContent).toContain("✕");
    expect(document.getElementById("name")?.getAttribute("aria-invalid")).toBe("true");
    expect(calls.some((c) => c.method === "POST")).toBe(false);
  });

  it("offers no prefilled example: the form starts empty", () => {
    stubCore(() => undefined);
    at("/join");
    expect(screen.queryByRole("button", { name: /example/i })).toBeNull();
    expect((document.getElementById("name") as HTMLInputElement).value).toBe("");
  });

  it("switches language, labels included", () => {
    at("/join");
    fireEvent.click(screen.getByRole("button", { name: "हि" }));
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("लोगों से सही तरीके से सहमति मांगें");
    fireEvent.click(screen.getByRole("button", { name: "ಕ" }));
    expect(screen.getByRole("button", { name: "ಪರಿಶೀಲನೆಗೆ ಕಳುಹಿಸಿ" })).toBeTruthy();
  });
});

function status(over: Partial<RegistrationStatusResponse> & { id?: string }): RegistrationStatusResponse {
  return { applicationId: over.id ?? "1".repeat(32), name: "DemoBank", sector: "Banking", status: "pending", note: null, createdAt: 1, decidedAt: null, result: null, ...over };
}
const statusOf = (id: string, ...answers: RegistrationStatusResponse[]): Handler => {
  let n = 0;
  return (c) => (c.url === `/v1/registrations/${id}` ? { json: answers[Math.min(n++, answers.length - 1)] } : undefined);
};
const approved = (id: string, apiKey: string | null, sandbox = true): RegistrationStatusResponse =>
  status({ id, status: "approved", decidedAt: 2, result: { fiduciary: ADDRESS, slug: "demobank", sandbox, apiKey, apiKeyShown: apiKey === null } });
const purposesHandler: Handler = (c) => (c.url === `/v1/fiduciaries/${ADDRESS}/purposes` ? { json: { fiduciary: ADDRESS, purposes: [{ code: "loan_offers" }] } } : undefined);

describe("the status and result page (R-01, R-03)", () => {
  it("follows a pending application until the regulator decides, then shows the key once and the quickstart", async () => {
    const id = "2".repeat(32);
    vi.useFakeTimers({ shouldAdvanceTime: true });
    stubCore(statusOf(id, status({ id }), approved(id, KEY)), purposesHandler);
    at(`/join/${id}`);
    expect(await screen.findByText("Waiting for the regulator")).toBeTruthy();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3100);
    });
    expect(await screen.findByText("DemoBank is registered")).toBeTruthy();
    expect(screen.getByText("SANDBOX")).toBeTruthy();
    expect(screen.getByTestId("api-key").textContent).toBe(KEY);
    expect(screen.getByText(/Shown once/)).toBeTruthy();

    // the quickstart has the company's own address, purpose and the key line; it stops polling once decided
    await waitFor(() => expect(document.body.textContent).toContain(`fiduciary: "${ADDRESS}"`));
    expect(document.body.textContent).toContain('purpose: "loan_offers"');
    expect(document.body.textContent).toContain(`export SAMMATI_API_KEY=${KEY}`);
    const reads = calls.filter((c) => c.url === `/v1/registrations/${id}`).length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(calls.filter((c) => c.url === `/v1/registrations/${id}`).length).toBe(reads);
  });

  it("keeps the key it was given if the page re-reads the status (Core shows it only once)", async () => {
    const id = "3".repeat(32);
    stubCore(statusOf(id, approved(id, KEY)), purposesHandler);
    at(`/join/${id}`);
    await screen.findByTestId("api-key");
    cleanup();
    stubCore(statusOf(id, approved(id, null)), purposesHandler); // Core: "already shown"
    at(`/join/${id}`);
    expect((await screen.findByTestId("api-key")).textContent).toBe(KEY);
  });

  it("says plainly that the key cannot be shown again when this page never received it", async () => {
    const id = "4".repeat(32);
    stubCore(statusOf(id, approved(id, null)), purposesHandler);
    at(`/join/${id}`);
    expect(await screen.findByText(/already seen your key/)).toBeTruthy();
    expect(screen.queryByTestId("api-key")).toBeNull();
    expect(document.body.textContent).toContain("export SAMMATI_API_KEY=<your API key>");
  });

  it("a rejected company sees the regulator's note and no key, no address", async () => {
    const id = "5".repeat(32);
    stubCore(statusOf(id, status({ id, status: "rejected", note: "Purposes are too broad.", decidedAt: 2 })));
    at(`/join/${id}`);
    expect(await screen.findByText("Not approved")).toBeTruthy();
    expect(screen.getByText("Purposes are too broad.")).toBeTruthy();
    expect(screen.queryByTestId("api-key")).toBeNull();
    expect(document.body.textContent).not.toContain("Fiduciary address");
  });

  it("an unknown application address is said to be unknown", async () => {
    stubCore((c) => (c.url.startsWith("/v1/registrations/") ? { status: 404, json: { error: { code: "APPLICATION_NOT_FOUND", message: "No such application" } } } : undefined));
    at(`/join/${"6".repeat(32)}`);
    expect(await screen.findByText("No application has this address.")).toBeTruthy();
  });

  it("the gateway snippet is exactly the one in docs/integration.md", () => {
    const guide = readFileSync(resolve(__dirname, "../../../docs/integration.md"), "utf8").replace(/\r\n/g, "\n");
    const block = guide.split("## 2. Integrate in 5 lines")[1]!.split("```ts\n")[1]!.split("\n```")[0]!;
    expect(block).toBe(gatewaySnippet({ coreUrl: "http://localhost:4000", fiduciary: "<your fiduciary address>", purposeCode: "<your purpose code>" }));
  });
});

// --- the regulator's tab ---

const NOW = 1_700_000_000;
function app(over: Partial<ApplicationView> = {}): ApplicationView {
  return {
    id: "b".repeat(32),
    name: "DemoBank",
    slug: "demobank",
    sector: "Banking",
    contactEmail: "ops@demobank.example",
    purposes: [
      {
        code: "loan_offers",
        title: { en: "Loan offers", hi: "ऋण प्रस्ताव", kn: "ಸಾಲದ ಕೊಡುಗೆಗಳು" },
        description: { en: "Send you loan offers", hi: "ऋण प्रस्ताव भेजना", kn: "ಸಾಲದ ಕೊಡುಗೆಗಳನ್ನು ಕಳುಹಿಸುವುದು" },
        dataCategories: ["contact.mobile"],
        retentionDays: 90,
        sharesThirdParty: true,
        required: false,
      },
    ],
    processors: [{ name: "BureauOne", purposeCode: "loan_offers" }],
    status: "pending",
    note: null,
    fiduciary: null,
    sandbox: null,
    createdAt: NOW,
    decidedAt: null,
    ...over,
  };
}

function regulator(applications: ApplicationView[]): Handler[] {
  const listed: Handler = (c) => {
    if (c.url === "/v1/regulator/registrations") {
      return c.headers["x-sammati-regulator-key"] === "demo-regulator-key" ? { json: { applications } } : { status: 401, json: { error: { code: "UNAUTHORIZED", message: "Regulator access code required" } } };
    }
    return undefined;
  };
  const testers: Handler = (c) => (c.url.startsWith("/v1/regulator/test-principals") ? { json: { principals: [] } } : undefined);
  return [listed, testers];
}

async function openRegistrations(code = "demo-regulator-key") {
  at("/auditor");
  fireEvent.click(screen.getByRole("button", { name: "Registrations (R-02)" }));
  fireEvent.change(await screen.findByLabelText("Regulator access code"), { target: { value: code } });
  fireEvent.click(screen.getByRole("button", { name: "Unlock" }));
}

describe("Registrations tab (R-02)", () => {
  it("shows nothing but the access code field until the code is accepted", async () => {
    stubCore(...regulator([app()]));
    await openRegistrations("wrong");
    expect(await screen.findByText("That access code was not accepted.")).toBeTruthy();
    expect(screen.queryByText("DemoBank")).toBeNull();
  });

  it("lists the pending applications with a count, and shows every detail of one for review", async () => {
    stubCore(...regulator([app(), app({ id: "c".repeat(32), name: "OldCo", slug: "oldco", status: "approved", contactEmail: null, fiduciary: ADDRESS, sandbox: true })]));
    await openRegistrations();
    const list = await screen.findByRole("list", { name: "Applications" });
    expect(within(list).getByText("DemoBank")).toBeTruthy();
    expect(within(list).queryByText("OldCo")).toBeNull(); // approved ones are under their own filter
    expect(within(screen.getByRole("group", { name: "Filter applications" })).getByRole("button", { name: /Pending/ }).textContent).toContain("1");

    fireEvent.click(within(list).getByText("DemoBank"));
    const review = await screen.findByRole("article", { name: "Review DemoBank" });
    expect(review.textContent).toContain("ops@demobank.example");
    expect(review.textContent).toContain("loan_offers");
    expect(review.textContent).toContain("ಸಾಲದ ಕೊಡುಗೆಗಳು"); // all three languages are in front of the reviewer
    expect(review.textContent).toContain("Shared with third parties");
    expect(review.textContent).toContain("BureauOne");
  });

  it("approves with the sandbox choice and the note, and reports the ledger transactions", async () => {
    const tx = "0x" + "ab".repeat(32);
    stubCore(
      (c) => (c.url === `/v1/regulator/registrations/${"b".repeat(32)}/approve` ? { json: { application: app({ status: "approved" }), fiduciary: { address: ADDRESS, slug: "demobank" }, txHashes: [tx] } } : undefined),
      ...regulator([app()]),
    );
    await openRegistrations();
    fireEvent.click(await screen.findByText("DemoBank"));
    fireEvent.change(await screen.findByLabelText(/Note/), { target: { value: "Looks right." } });
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    expect(await screen.findByText(/Approved\. DemoBank is in the directory/)).toBeTruthy();
    const post = calls.find((c) => c.url.endsWith("/approve"))!;
    expect(post.body).toEqual({ note: "Looks right.", sandbox: true });
    expect(post.headers["x-sammati-regulator-key"]).toBe("demo-regulator-key");
    // the regulator is shown no API key, and none is in what came back
    expect(document.body.textContent).not.toMatch(/sk_/);
  });

  it("rejecting needs a note, then sends it", async () => {
    stubCore(
      (c) => (c.url.endsWith("/reject") ? { json: { application: app({ status: "rejected", note: "Too broad." }) } } : undefined),
      ...regulator([app()]),
    );
    await openRegistrations();
    fireEvent.click(await screen.findByText("DemoBank"));
    fireEvent.click(await screen.findByRole("button", { name: "Reject" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Write a note");
    expect(calls.some((c) => c.url.endsWith("/reject"))).toBe(false);

    fireEvent.change(screen.getByLabelText(/Note/), { target: { value: "Too broad." } });
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    await waitFor(() => expect(calls.find((c) => c.url.endsWith("/reject"))?.body).toEqual({ note: "Too broad." }));
  });

  it("promotes an approved company out of the sandbox, after a confirmation, and can issue a new key", async () => {
    const co = app({ status: "approved", contactEmail: null, fiduciary: ADDRESS, sandbox: true, id: "d".repeat(32) });
    stubCore(
      (c) => (c.url === `/v1/regulator/fiduciaries/${ADDRESS}/sandbox` ? { json: { fiduciary: ADDRESS, sandbox: false } } : undefined),
      (c) => (c.url === `/v1/regulator/fiduciaries/${ADDRESS}/reissue-key` ? { json: { ok: true } } : undefined),
      ...regulator([co]),
    );
    await openRegistrations();
    fireEvent.click(await screen.findByRole("button", { name: "Promote to live" }));
    expect(screen.getByText("Promote to live?")).toBeTruthy();
    expect(calls.some((c) => c.url.endsWith("/sandbox"))).toBe(false); // nothing happened yet
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(calls.find((c) => c.url.endsWith("/sandbox"))?.body).toEqual({ sandbox: false }));

    fireEvent.click(await screen.findByRole("button", { name: "Issue a new API key" }));
    expect(screen.getByText(/The old key stops working at once/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(calls.some((c) => c.url.endsWith("/reissue-key"))).toBe(true));
  });

  it("manages test customers by Sammati ID", async () => {
    let list: unknown[] = [];
    stubCore(
      (c) => {
        if (c.method === "POST" && c.url === "/v1/regulator/test-principals") {
          list = [{ principal: ADDRESS, handle: (c.body as { handle: string }).handle, addedAt: NOW }];
          return { status: 201, json: { principals: list } };
        }
        if (c.url.startsWith("/v1/regulator/test-principals")) return { json: { principals: list } };
        return undefined;
      },
      ...regulator([]),
    );
    await openRegistrations();
    fireEvent.change(await screen.findByLabelText("Sammati ID or address"), { target: { value: "asha@sammati" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(await screen.findByText("asha@sammati")).toBeTruthy();
    expect(calls.find((c) => c.method === "POST")?.body).toEqual({ handle: "asha@sammati" });
  });
});
