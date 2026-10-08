import { describe, expect, it } from "vitest";
import { Wallet } from "ethers";
import {
  SEED_FIDUCIARIES,
  ackDigest,
  ackSigner,
  notificationDigest,
  notificationSigner,
  purposeIdOf,
  signAck,
  signNotification,
  type CascadeAck,
  type CascadeNotification,
} from "../src";

const company = SEED_FIDUCIARIES[0]!;
const adPartner = company.processors.find((p) => p.name === "AdPartnerQ")!;
const fiduciaryWallet = new Wallet(company.demoKey);
const processorWallet = new Wallet(adPartner.demoKey);

const notification: CascadeNotification = {
  principal: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
  fiduciary: company.address,
  purposeId: purposeIdOf(company.address, "marketing"),
  purposeCode: "marketing",
  processor: adPartner.address,
  withdrawalTx: "0x" + "ab".repeat(32),
  withdrawnAt: 1760000000,
};

describe("cascade messages", () => {
  it("a notification is verifiably signed by the company that sent it", async () => {
    const signed = await signNotification(notification, fiduciaryWallet);
    expect(notificationSigner(signed)).toBe(company.address);
  });

  it("changing any field of a notification changes who it appears to be signed by", async () => {
    const signed = await signNotification(notification, fiduciaryWallet);
    for (const forged of [
      { ...notification, processor: SEED_FIDUCIARIES[1]!.processors[0]!.address },
      { ...notification, withdrawalTx: "0x" + "cd".repeat(32) },
      { ...notification, withdrawnAt: notification.withdrawnAt + 1 },
      { ...notification, principal: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" },
    ]) {
      expect(notificationSigner({ ...signed, notification: forged })).not.toBe(company.address);
    }
  });

  it("an acknowledgement is verifiably signed by the processor and bound to one notification", async () => {
    const ack: CascadeAck = {
      principal: notification.principal,
      purposeId: notification.purposeId,
      processor: adPartner.address,
      notificationDigest: notificationDigest(notification),
      ackedAt: 1760000002,
    };
    const signed = await signAck(ack, processorWallet);
    expect(ackSigner(signed)).toBe(adPartner.address);
    expect(ackSigner({ ...signed, ack: { ...ack, notificationDigest: notificationDigest({ ...notification, withdrawnAt: 1 }) } })).not.toBe(adPartner.address);
  });

  it("the digest is canonical: key order does not matter", () => {
    const reordered = Object.fromEntries(Object.entries(notification).reverse()) as unknown as CascadeNotification;
    expect(notificationDigest(reordered)).toBe(notificationDigest(notification));
    expect(ackDigest({ principal: "a", purposeId: "b", processor: "c", notificationDigest: "d", ackedAt: 1 })).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("returns null for a signature that is not even well-formed", () => {
    expect(notificationSigner({ notification, signature: "0x1234" })).toBeNull();
    expect(ackSigner({ ack: { principal: "", purposeId: "", processor: "", notificationDigest: "", ackedAt: 0 }, signature: "nonsense" })).toBeNull();
  });
});
