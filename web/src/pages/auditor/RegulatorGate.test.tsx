// A hosted Auditor shows nothing until the regulator's access code is accepted by Core (trd.md §10.8).
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { REGULATOR_KEY_HEADER } from "@sammati/shared";

vi.mock("../../core", () => ({ CORE_URL: "https://core.example.com", LOGIN_REQUIRED: true }));

import { savedRegulatorCode } from "../../regulator";
import { RegulatorGate } from "./RegulatorGate";

const sent: Array<{ url: string; code: string | null }> = [];

beforeEach(() => {
  sessionStorage.clear();
  sent.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const code = (init?.headers as Record<string, string> | undefined)?.[REGULATOR_KEY_HEADER] ?? null;
      sent.push({ url, code });
      return code === "right-code"
        ? new Response(JSON.stringify({ fiduciaries: [] }), { status: 200 })
        : new Response(JSON.stringify({ error: { code: "UNAUTHORIZED", message: "Regulator access code required" } }), { status: 401 });
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const open = () => render(<RegulatorGate><p>Scorecards</p></RegulatorGate>);

describe("the Auditor's sign-in", () => {
  it("shows only the sign-in until a code is entered, and makes no Auditor call before then", async () => {
    open();
    expect(await screen.findByRole("heading", { name: "Regulator sign-in" })).toBeTruthy();
    expect(screen.queryByText("Scorecards")).toBeNull();
    expect(sent).toEqual([]);
  });

  it("refuses a wrong code, forgets it, and says so in words", async () => {
    open();
    fireEvent.change(await screen.findByLabelText("Regulator access code"), { target: { value: "wrong" } });
    fireEvent.click(screen.getByRole("button", { name: "Open the Auditor" }));
    expect((await screen.findByRole("alert")).textContent).toContain("That access code was not accepted.");
    expect(screen.queryByText("Scorecards")).toBeNull();
    expect(savedRegulatorCode()).toBe("");
  });

  it("opens with the right code, sends it as the regulator header, and keeps it for this tab only", async () => {
    open();
    fireEvent.change(await screen.findByLabelText("Regulator access code"), { target: { value: "right-code" } });
    fireEvent.click(screen.getByRole("button", { name: "Open the Auditor" }));
    expect(await screen.findByText("Scorecards")).toBeTruthy();
    expect(sent[0]).toEqual({ url: "https://core.example.com/v1/audit/fiduciaries", code: "right-code" });
    expect(savedRegulatorCode()).toBe("right-code");
  });

  it("a code kept from earlier in this tab opens it without asking again", async () => {
    sessionStorage.setItem("sammati.regulatorCode", "right-code");
    open();
    await waitFor(() => expect(screen.getByText("Scorecards")).toBeTruthy());
  });
});
