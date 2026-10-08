import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SEED_FIDUCIARIES, type FiduciaryInfo } from "@sammati/shared";
import { AppRoutes } from "./App";

// WsProvider opens a WebSocket which is not available in jsdom. Stub it so
// tests don't throw, while still exercising routing and rendering.
const MockWs = vi.fn().mockImplementation(() => ({
  send: vi.fn(),
  close: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  onopen: null,
  onmessage: null,
  onerror: null,
  onclose: null,
  readyState: 0, // CONNECTING
  CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3,
}));

const SEEDS: FiduciaryInfo[] = SEED_FIDUCIARIES.map((f) => ({ address: f.address, slug: f.slug, name: f.name, sector: f.sector, color: f.color, sandbox: false, demo: true }));
const DEMOBANK: FiduciaryInfo = { address: "0x1111111111111111111111111111111111111111", slug: "demobank", name: "DemoBank", sector: "Banking", color: "#16173F", sandbox: true, demo: false };

/** A Core that answers the directory and nothing else usefully, like the page's first second. */
function coreWith(companies: FiduciaryInfo[] | "down"): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (String(url).endsWith("/v1/fiduciaries")) {
        if (companies === "down") throw new TypeError("fetch failed");
        return { ok: true, status: 200, json: async () => ({ fiduciaries: companies }) };
      }
      return { json: async () => ({ ok: true, mode: "stub" }) };
    }),
  );
}

beforeEach(() => {
  vi.stubGlobal("WebSocket", MockWs);
  coreWith(SEEDS);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});


function at(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>,
  );
}

describe("routes", () => {
  it.each([
    ["/company/quickloan", "QuickLoan"],
    ["/company/medicare", "MediCare+"],
    ["/company/foodrush", "FoodRush"],
  ])("%s shows the company", async (path, name) => {
    at(path);
    expect(await screen.findByRole("heading", { level: 1, name })).toBeTruthy();
  });

  it("/auditor loads", () => {
    at("/auditor");
    expect(screen.getByRole("heading", { level: 1, name: "Auditor" })).toBeTruthy();
  });

  it("/stage loads", () => {
    at("/stage");
    expect(screen.getByText("Citizen")).toBeTruthy();
  });

  it("an unknown company falls back to the first company Core lists, whichever it is", async () => {
    coreWith([DEMOBANK, ...SEEDS]);
    at("/company/nope");
    expect(await screen.findByRole("heading", { level: 1, name: "DemoBank" })).toBeTruthy();
  });

  it("/ opens the first company Core lists", async () => {
    coreWith([DEMOBANK, ...SEEDS]);
    at("/");
    expect(await screen.findByRole("heading", { level: 1, name: "DemoBank" })).toBeTruthy();
  });

  it("says so, instead of guessing a company, when Core cannot list them", async () => {
    coreWith("down");
    at("/company/quickloan");
    expect(await screen.findByText(/Cannot load the companies/)).toBeTruthy();
    expect(screen.queryByRole("heading", { level: 1, name: "QuickLoan" })).toBeNull();
  });

  it("renders Company overview with stat cards and live feed", async () => {
    at("/company/quickloan");
    await screen.findByRole("heading", { level: 1, name: "QuickLoan" });
    expect(screen.getByText("Active consents")).toBeTruthy();
    expect(screen.getByText("Allowed today")).toBeTruthy();
    expect(screen.getByText("Blocked today")).toBeTruthy();
    expect(screen.getByText("Last anchor")).toBeTruthy();
    expect(screen.getByText("Live request feed")).toBeTruthy();
  });

  it("switches between console rail sections (purposes, new request, live requests, consents)", async () => {
    at("/company/quickloan");
    await screen.findByRole("heading", { level: 1, name: "QuickLoan" });

    // Click Purposes
    fireEvent.click(document.getElementById("rail-purposes")!);
    expect(screen.getByRole("heading", { level: 2, name: /Purposes Registry/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /\+ Add purpose/i })).toBeTruthy();

    // Click New request
    fireEvent.click(document.getElementById("rail-new-request")!);
    expect(screen.getByRole("heading", { level: 2, name: /New Consent Request/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Generate consent QR/i })).toBeTruthy();

    // Click Live requests
    fireEvent.click(document.getElementById("rail-live-requests")!);
    expect(screen.getByRole("heading", { level: 2, name: /Live Requests & Simulator/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Run credit check/i })).toBeTruthy();

    // Click Consents
    fireEvent.click(document.getElementById("rail-consents")!);
    expect(screen.getByRole("heading", { level: 2, name: /Customer Consents/i })).toBeTruthy();
  });

  it("renders /auditor with scorecards and switches to ledger explorer", async () => {
    at("/auditor");

    expect(screen.getByRole("heading", { level: 1, name: "Auditor" })).toBeTruthy();
    expect(screen.getByText("Regulator Board")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Scorecards (A-01)" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Ledger Explorer (A-02)" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Tamper demo/i })).toBeTruthy();

    // Switch to Ledger Explorer tab
    fireEvent.click(screen.getByRole("button", { name: "Ledger Explorer (A-02)" }));
    expect(await screen.findByRole("heading", { level: 2, name: /Immutable Ledger Explorer/i })).toBeTruthy();
    expect(screen.getByPlaceholderText(/Search tx hash, principal, or ledger head/i)).toBeTruthy();
  });

  describe("companies are read from Core, not assumed (R-04)", () => {
    it("lists every company in the switcher, a fourth one with a SANDBOX badge", async () => {
      coreWith([...SEEDS, DEMOBANK]);
      at("/company/demobank");
      await screen.findByRole("heading", { level: 1, name: "DemoBank" });
      const switcher = screen.getByRole("navigation", { name: "Switch company" });
      expect(Array.from(switcher.querySelectorAll("a")).map((a) => a.textContent)).toEqual(["QuickLoan", "MediCare+", "FoodRush", expect.stringContaining("DemoBank")]);
      expect(switcher.textContent).toContain("SANDBOX");
      // and the heading carries the badge too
      expect(screen.getAllByText("SANDBOX").length).toBeGreaterThanOrEqual(2);
    });

    it("keeps working with a long list: past five companies the switcher is a dropdown", async () => {
      const many = [...SEEDS, ...["Alpha", "Beta", "Gamma"].map((n, i) => ({ ...DEMOBANK, name: n, slug: n.toLowerCase(), address: `0x${String(i + 2).repeat(40)}` }))];
      coreWith(many);
      at("/company/beta");
      await screen.findByRole("heading", { level: 1, name: "Beta" });
      const select = screen.getByRole("combobox", { name: "Switch company" }) as HTMLSelectElement;
      expect(select.options.length).toBe(6);
      expect(select.value).toBe("beta");
    });

    it("gives a company with no simulator backend the own-server card instead of QuickLoan's buttons", async () => {
      coreWith([...SEEDS, DEMOBANK]);
      at("/company/demobank");
      await screen.findByRole("heading", { level: 1, name: "DemoBank" });
      fireEvent.click(document.getElementById("rail-live-requests")!);
      expect(screen.getByText("Your requests come from your own server")).toBeTruthy();
      expect(screen.queryByRole("button", { name: /Run credit check/i })).toBeNull();
    });

    it("the Auditor's ledger filter offers the company that joined", async () => {
      coreWith([...SEEDS, DEMOBANK]);
      at("/auditor");
      fireEvent.click(await screen.findByRole("button", { name: "Ledger Explorer (A-02)" }));
      await screen.findByRole("option", { name: "DemoBank" });
    });
  });
});
