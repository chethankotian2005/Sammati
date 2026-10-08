import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppRoutes } from "./App";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ json: async () => ({ ok: true, mode: "stub" }) }));
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
  ])("%s shows the company", (path, name) => {
    at(path);
    expect(screen.getByRole("heading", { level: 1, name })).toBeTruthy();
  });

  it("/auditor loads", () => {
    at("/auditor");
    expect(screen.getByRole("heading", { level: 1, name: "Auditor" })).toBeTruthy();
  });

  it("/stage loads", () => {
    at("/stage");
    expect(screen.getByText("Citizen")).toBeTruthy();
  });

  it("unknown company and unknown paths fall back to QuickLoan", () => {
    at("/company/nope");
    expect(screen.getByRole("heading", { level: 1, name: "QuickLoan" })).toBeTruthy();
  });
});
