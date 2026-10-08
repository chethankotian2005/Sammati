// The Processor's key and the one place plaintext exists (trd.md §6.7, "No plaintext outside the Processor").
//
// This is a *simulated* enclave: an ordinary object with a private field. Nothing here is hardware protection,
// and the UI and the docs say so. What it does enforce in code is the shape of the boundary: the private key
// and the decrypted profile never leave this file. `decide` returns a decision, and that is all.
import { hexlify } from "ethers";
import { generateKeyPair, openJson, publicKeyOf, type Envelope, type EnvelopeContext } from "@sammati/shared/src/envelope";
import type { Hex, LoanDecision } from "@sammati/shared";
import { decideLoan } from "./rules";

export class Enclave {
  readonly #privateKey: Uint8Array;
  readonly publicKey: Hex;

  constructor(privateKey: Uint8Array | null) {
    const pair = generateKeyPair(privateKey ?? undefined);
    this.#privateKey = pair.privateKey;
    this.publicKey = hexlify(publicKeyOf(pair.privateKey)) as Hex;
  }

  /**
   * Opens the envelope, applies the loan rules and returns the decision. The profile is a local variable of this
   * call: it is not stored, logged or returned. Throws EnvelopeError (fixed message) if the envelope does not
   * open or is not a profile; the cause, which could mention data, is never attached.
   */
  decide(envelope: Envelope, ctx: EnvelopeContext): LoanDecision {
    const profile = openJson(envelope, this.#privateKey, ctx);
    return decideLoan(profile);
  }

  // Printing the enclave (console.log, util.inspect, JSON) must not reveal the key.
  toJSON(): { publicKey: Hex } {
    return { publicKey: this.publicKey };
  }
}
