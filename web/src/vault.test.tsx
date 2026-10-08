// Confidential processing on the web (prd.md V-05, V-06): the console and Stage view show a handle, a hash, a status
// and the Processor's timeline, and nothing they receive or render can contain customer data.
import { render, screen, cleanup, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { VaultEvent } from "@sammati/shared";
import { VaultPanel, VaultTimeline, decidedText, foldTimeline, heldFromEvents } from "./ui/VaultPanel";
import { loanOutcome } from "./pages/company/LiveRequestsSection";

afterEach(cleanup);

const PRINCIPAL = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as const;
const FID = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as const;
const H1 = `0x${"ab".repeat(32)}` as const;
const H2 = `0x${"ef".repeat(32)}` as const;
const HASH = `0x${"cd".repeat(32)}` as const;
const base = (handle: `0x${string}`, at: number) => ({ principal: PRINCIPAL, fiduciary: FID, purposeCode: "credit_check", handle, at, atMs: at * 1000 });

const encrypted = (handle = H1, at = 1760000000): VaultEvent => ({ event: "vault.encrypted", ...base(handle, at), ciphertextHash: HASH, sizeBytes: 300 });
const stored = (handle = H1, at = 1760000001): VaultEvent => ({ event: "vault.stored", ...base(handle, at), ciphertextHash: HASH, sizeBytes: 300 });
const requested = (at = 1760000002): VaultEvent => ({ event: "processor.requested", ...base(H1, at), action: "loan_decision", requestedAt: at * 1000 });
const decrypting = (at = 1760000002): VaultEvent => ({ event: "processor.decrypting", ...base(H1, at), decryptingAt: at * 1000 });
const approved = (at = 1760000003): VaultEvent => ({ event: "processor.decided", ...base(H1, at), decision: "approved", limit: 300000, reasonCodes: ["SCORE_FAIR"], entryId: "e1", durationMs: 9 });
const blocked = (at = 1760000009): VaultEvent => ({ event: "processor.decided", ...base(H1, at), decision: "blocked", limit: null, reasonCodes: ["CONSENT_WITHDRAWN"], entryId: "e2", durationMs: 4 });
const erased = (handle = H1, cause: "withdrawn" | "superseded" = "withdrawn", at = 1760000010): VaultEvent => ({ event: "vault.erased", ...base(handle, at), cause });

describe("what the company holds", () => {
  it("is nothing until the Processor stores something", () => {
    expect(heldFromEvents([])).toEqual({ handle: null, ciphertextHash: null, status: "none" });
    expect(heldFromEvents([encrypted()])).toMatchObject({ status: "none" });
  });

  it("is the newest handle, and erased after a withdrawal", () => {
    expect(heldFromEvents([encrypted(), stored()])).toEqual({ handle: H1, ciphertextHash: HASH, status: "stored" });
    expect(heldFromEvents([stored(), approved(), erased()])).toEqual({ handle: H1, ciphertextHash: HASH, status: "erased" });
  });

  it("follows a replacement: the old copy being erased as superseded changes nothing", () => {
    const events = [stored(H1), stored(H2, 1760000050), erased(H1, "superseded", 1760000051)];
    expect(heldFromEvents(events)).toEqual({ handle: H2, ciphertextHash: HASH, status: "stored" });
    expect(heldFromEvents([...events, erased(H1, "withdrawn")]).status).toBe("stored"); // an erase of an old handle is old news
  });
});

describe("the timeline", () => {
  it("fills in step by step and starts over with a new submission", () => {
    const steps = (events: VaultEvent[]) => [...foldTimeline(events).keys()];
    expect(steps([encrypted(), stored(), requested(), decrypting(), approved()])).toEqual(["vault.encrypted", "vault.stored", "processor.requested", "processor.decrypting", "processor.decided"]);
    expect(steps([encrypted(), stored(), requested(), decrypting(), approved(), erased(), encrypted(H2, 1760000100)])).toEqual(["vault.encrypted"]);
  });

  it("clears the previous request's steps when a new request starts, so an old Decrypting never sits beside a new refusal", () => {
    const seen = foldTimeline([encrypted(), stored(), requested(), decrypting(), approved(), requested(1760000008), blocked()]);
    expect(seen.has("processor.decrypting")).toBe(false);
    expect(seen.get("processor.decided")).toMatchObject({ decision: "blocked" });
  });

  it("says what was decided in a line", () => {
    expect(decidedText(approved() as Extract<VaultEvent, { event: "processor.decided" }>)).toBe("Approved · limit 3,00,000 · SCORE_FAIR");
    expect(decidedText(blocked() as Extract<VaultEvent, { event: "processor.decided" }>)).toBe("451 · CONSENT_WITHDRAWN");
  });

  it("renders every step, marking the ones not reached yet", () => {
    render(<VaultTimeline events={[encrypted(), stored()]} />);
    const list = screen.getByRole("list", { name: /timeline/i });
    expect(within(list).getAllByRole("listitem")).toHaveLength(6);
    for (const label of ["Encrypted", "Stored", "Requested", "Decrypting", "Decided", "Erased"]) expect(within(list).getByText(label)).toBeTruthy();
  });
});

describe("the QuickLoan card", () => {
  it("shows a handle, a hash and a status, says staff cannot read it, and labels the Processor honestly", () => {
    render(<VaultPanel company="QuickLoan" events={[encrypted(), stored(), requested(), decrypting(), approved()]} />);
    const panel = screen.getByTestId("vault-panel");
    expect(within(panel).getByText("What QuickLoan holds")).toBeTruthy();
    expect(within(panel).getByText("stored")).toBeTruthy();
    expect(within(panel).getByText(/QuickLoan staff cannot read this/)).toBeTruthy();
    expect(within(panel).getByText(/Simulated enclave/i)).toBeTruthy();
    expect(within(panel).getByText("Approved · limit 3,00,000 · SCORE_FAIR")).toBeTruthy();
    expect(panel.textContent).not.toMatch(/ABCDE1234F|6-9 LPA/);
  });

  it("shows the erasure after a withdrawal", () => {
    render(<VaultPanel company="QuickLoan" events={[stored(), approved(), requested(1760000008), blocked(), erased()]} />);
    const panel = screen.getByTestId("vault-panel");
    expect(within(panel).getByText("erased")).toBeTruthy();
    expect(within(panel).getByText("451 · CONSENT_WITHDRAWN")).toBeTruthy();
    expect(within(panel).getByText("(withdrawn)")).toBeTruthy();
  });
});

describe("the simulator's loan line", () => {
  it("reads the Processor's answer as QuickLoan relays it", () => {
    expect(loanOutcome({ decision: "approved", limit: 300000, reasonCodes: ["SCORE_FAIR"] })).toBe("Approved · limit 3,00,000 · SCORE_FAIR");
    expect(loanOutcome({ decision: "declined", limit: null, reasonCodes: ["SCORE_LOW"] })).toBe("Declined · SCORE_LOW");
  });

  it("says nothing about any other payload, in particular a vault view or a refusal", () => {
    expect(loanOutcome({ handle: H1, ciphertextHash: HASH, status: "stored" })).toBeNull();
    expect(loanOutcome({ code: "CONSENT_WITHDRAWN", message: "x" })).toBeNull();
    expect(loanOutcome(null)).toBeNull();
    expect(loanOutcome("Approved")).toBeNull();
  });
});
