import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { VaultHandles } from "../src/vault-handles";

const source = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../src/index.ts"), "utf8");
const HANDLE = "0x" + "ab".repeat(32);
const HASH = "0x" + "cd".repeat(32);
const CUSTOMER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

describe("the sample lender holds no customer data (V-05)", () => {
  it("does not wrap the apply endpoint in requireConsent: the Processor decides and logs", () => {
    expect(source).toMatch(/app\.post\("\/customers\/:id\/apply",\s*async/);
  });

  it("has no PAN, income or score anywhere in its source, and names no company", () => {
    expect(source).not.toMatch(/ABCDE1234F|incomeBand\s*:|\bpan\s*:|score\s*:\s*\d/);
    expect(source).not.toMatch(/QuickLoan|MediCare|FoodRush|0x[0-9a-fA-F]{40}/);
  });

  it("keeps a handle per customer, replaces it on a new one and marks it erased", () => {
    const held = new VaultHandles();
    expect(held.view(CUSTOMER)).toEqual({ handle: null, ciphertextHash: null, status: "none" });
    expect(held.apply({ event: "stored", handle: HANDLE, principal: CUSTOMER, purposeCode: "credit_check", ciphertextHash: HASH })).toBe(true);
    expect(held.view(CUSTOMER.toLowerCase())).toEqual({ handle: HANDLE, ciphertextHash: HASH, status: "stored" });

    const newer = "0x" + "ef".repeat(32);
    held.apply({ event: "stored", handle: newer, principal: CUSTOMER, purposeCode: "credit_check", ciphertextHash: HASH });
    held.apply({ event: "erased", handle: HANDLE, principal: CUSTOMER, purposeCode: "credit_check", ciphertextHash: HASH }); // the old copy: ignored
    expect(held.view(CUSTOMER).status).toBe("stored");
    held.apply({ event: "erased", handle: newer, principal: CUSTOMER, purposeCode: "credit_check", ciphertextHash: HASH });
    expect(held.view(CUSTOMER)).toEqual({ handle: newer, ciphertextHash: HASH, status: "erased" });
  });

  it.each([
    ["an unknown event", { event: "leaked", handle: HANDLE, principal: CUSTOMER, purposeCode: "credit_check", ciphertextHash: HASH }],
    ["free text as a handle", { event: "stored", handle: "ABCDE1234F", principal: CUSTOMER, purposeCode: "credit_check", ciphertextHash: HASH }],
    ["no principal", { event: "stored", handle: HANDLE, purposeCode: "credit_check", ciphertextHash: HASH }],
    ["not an object", "stored"],
  ])("ignores %s", (_name, body) => {
    const held = new VaultHandles();
    expect(held.apply(body)).toBe(false);
    expect(held.view(CUSTOMER).status).toBe("none");
  });
});
