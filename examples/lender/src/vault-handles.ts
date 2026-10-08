// What QuickLoan keeps about a customer's vault entry: the handle the Processor gave it, its hash, and whether
// the ciphertext still exists. Never the data (trd.md §6.8). In memory, like the rest of this demo backend.
import type { Hex, VaultView } from "@sammati/shared";

export interface HeldHandle {
  handle: Hex;
  ciphertextHash: Hex;
  status: "stored" | "erased";
}

const BYTES32 = /^0x[0-9a-f]{64}$/;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

export class VaultHandles {
  private readonly byPrincipal = new Map<string, HeldHandle>();

  get(principal: string): HeldHandle | undefined {
    return this.byPrincipal.get(principal.toLowerCase());
  }

  /** Applies the Processor's webhook `{ event, handle, principal, purposeCode, ciphertextHash }`. False if it is malformed. */
  apply(body: unknown): boolean {
    if (typeof body !== "object" || body === null) return false;
    const e = body as Record<string, unknown>;
    if ((e.event !== "stored" && e.event !== "erased") || e.purposeCode !== "credit_check") return false;
    if (typeof e.principal !== "string" || !ADDRESS.test(e.principal)) return false;
    if (typeof e.handle !== "string" || !BYTES32.test(e.handle) || typeof e.ciphertextHash !== "string" || !BYTES32.test(e.ciphertextHash)) return false;

    const key = e.principal.toLowerCase();
    if (e.event === "stored") {
      this.byPrincipal.set(key, { handle: e.handle as Hex, ciphertextHash: e.ciphertextHash as Hex, status: "stored" });
    } else {
      // An erase for a handle that has since been replaced is old news.
      const current = this.byPrincipal.get(key);
      if (current?.handle === e.handle) current.status = "erased";
    }
    return true;
  }

  view(principal: string): VaultView {
    const held = this.get(principal);
    return { handle: held?.handle ?? null, ciphertextHash: held?.ciphertextHash ?? null, status: held?.status ?? "none" };
  }
}
