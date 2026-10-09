import type { Wallet } from "ethers";
import { notificationDigest, notificationSigner, signAck, type SignedAck, type SignedNotification } from "@sammati/shared";
import { now } from "../clock";

/**
 * A downstream processor living inside Core (trd.md §9). It does
 * what a real processor's webhook would: check that the notification really comes from the company
 * whose data it holds, take a moment, and answer with a signed acknowledgement. Its key is held by Core,
 * which is one of the two disclosed demo shortcuts (demo.md).
 */
export class InProcessProcessor {
  constructor(
    readonly name: string,
    readonly wallet: Wallet,
    /** Resolves after roughly `ms`; the engine supplies one it can cancel when it stops. */
    private readonly wait: (ms: number) => Promise<void>,
    private readonly delayMs: () => number,
  ) {}

  get address(): string {
    return this.wallet.address;
  }

  async receive(signed: SignedNotification): Promise<SignedAck> {
    const { notification } = signed;
    if (notification.processor.toLowerCase() !== this.address.toLowerCase()) {
      throw new Error(`${this.name}: notification is addressed to ${notification.processor}, not to this processor`);
    }
    // Anyone can POST to a webhook: only a notification signed by the fiduciary it names counts.
    const sender = notificationSigner(signed);
    if (!sender || sender.toLowerCase() !== notification.fiduciary.toLowerCase()) {
      throw new Error(`${this.name}: notification is not signed by ${notification.fiduciary}`);
    }
    await this.wait(this.delayMs());
    return signAck(
      {
        principal: notification.principal,
        purposeId: notification.purposeId,
        processor: notification.processor,
        notificationDigest: notificationDigest(notification),
        ackedAt: now(),
      },
      this.wallet,
    );
  }
}
