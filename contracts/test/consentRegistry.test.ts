import { expect } from "chai";
import type { ContractTransactionResponse } from "ethers";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { artifacts, ethers } from "hardhat";
import { loadFixture, takeSnapshot, time } from "@nomicfoundation/hardhat-network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { ACTION, ZERO_HASH, purposeIdOf, replayLedger, type LedgerAction } from "@sammati/shared";
import {
  CODE,
  DAY,
  DESC_HASH,
  META,
  NOTICE_HASH,
  actors,
  deployRegistry,
  deployWithPurpose,
  eventOf,
  grantMessage,
  mined,
  now,
  signGrant,
  signWithdraw,
  withdrawMessage,
} from "./helpers";

const Status = { None: 0n, Active: 1n, Withdrawn: 2n };

describe("ConsentRegistry", () => {
  // --- trd.md §3.3 test 1 ---
  describe("grant", () => {
    it("accepts a valid signature submitted by a relayer and stores the consent", async () => {
      const { registry, domain, alice, fiduciary, relayer, purposeId } = await loadFixture(deployWithPurpose);
      const msg = await grantMessage({ principal: alice.address, fiduciary: fiduciary.address, purposeId });
      const sig = await signGrant(alice, domain, msg);

      await expect(registry.connect(relayer).grantConsent(msg, sig))
        .to.emit(registry, "ConsentGranted")
        .withArgs(alice.address, fiduciary.address, purposeId, msg.expiresAt, NOTICE_HASH, anyValue);

      const c = await registry.getConsent(alice.address, fiduciary.address, purposeId);
      expect(c.status).to.equal(Status.Active);
      expect(c.expiresAt).to.equal(msg.expiresAt);
      expect(c.noticeHash).to.equal(NOTICE_HASH);
      expect(c.noticeVersion).to.equal(1n);
      expect(c.grantedAt).to.equal(BigInt(await now()));
      expect(await registry.hasValidConsent(alice.address, fiduciary.address, purposeId)).to.equal(true);
      expect(await registry.nonces(alice.address)).to.equal(1n);
    });

    it("reverts when someone other than the principal signed", async () => {
      const { registry, domain, alice, bob, fiduciary, relayer, purposeId } = await loadFixture(deployWithPurpose);
      const msg = await grantMessage({ principal: alice.address, fiduciary: fiduciary.address, purposeId });
      const sig = await signGrant(bob, domain, msg);
      await expect(registry.connect(relayer).grantConsent(msg, sig)).to.be.revertedWithCustomError(registry, "InvalidSignature");
    });

    it("reverts when the signed message was changed after signing", async () => {
      const { registry, domain, alice, fiduciary, relayer, purposeId } = await loadFixture(deployWithPurpose);
      const msg = await grantMessage({ principal: alice.address, fiduciary: fiduciary.address, purposeId });
      const sig = await signGrant(alice, domain, msg);
      const longer = { ...msg, expiresAt: msg.expiresAt + DAY };
      await expect(registry.connect(relayer).grantConsent(longer, sig)).to.be.revertedWithCustomError(registry, "InvalidSignature");
    });

    it("reverts when the signature is for another chain or contract (domain separation)", async () => {
      const { registry, domain, alice, fiduciary, relayer, purposeId } = await loadFixture(deployWithPurpose);
      const msg = await grantMessage({ principal: alice.address, fiduciary: fiduciary.address, purposeId });
      const other = { ...domain, chainId: domain.chainId + 1 };
      const sig = await signGrant(alice, other, msg);
      await expect(registry.connect(relayer).grantConsent(msg, sig)).to.be.revertedWithCustomError(registry, "InvalidSignature");
    });

    it("reverts on a malformed signature", async () => {
      const { registry, alice, fiduciary, relayer, purposeId } = await loadFixture(deployWithPurpose);
      const msg = await grantMessage({ principal: alice.address, fiduciary: fiduciary.address, purposeId });
      await expect(registry.connect(relayer).grantConsent(msg, "0x1234")).to.be.revertedWithCustomError(registry, "InvalidSignature");
    });

    it("reverts on a replayed nonce", async () => {
      const { registry, domain, alice, fiduciary, relayer, purposeId } = await loadFixture(deployWithPurpose);
      const msg = await grantMessage({ principal: alice.address, fiduciary: fiduciary.address, purposeId });
      const sig = await signGrant(alice, domain, msg);
      await registry.connect(relayer).grantConsent(msg, sig);
      await expect(registry.connect(relayer).grantConsent(msg, sig))
        .to.be.revertedWithCustomError(registry, "InvalidNonce")
        .withArgs(1n, 0n);
    });

    it("reverts on a nonce from the future", async () => {
      const { registry, domain, alice, fiduciary, relayer, purposeId } = await loadFixture(deployWithPurpose);
      const msg = await grantMessage({ principal: alice.address, fiduciary: fiduciary.address, purposeId, nonce: "5" });
      const sig = await signGrant(alice, domain, msg);
      await expect(registry.connect(relayer).grantConsent(msg, sig))
        .to.be.revertedWithCustomError(registry, "InvalidNonce")
        .withArgs(0n, 5n);
    });

    it("reverts after the signature deadline", async () => {
      const { registry, domain, alice, fiduciary, relayer, purposeId } = await loadFixture(deployWithPurpose);
      const msg = await grantMessage({ principal: alice.address, fiduciary: fiduciary.address, purposeId });
      const sig = await signGrant(alice, domain, msg);
      await time.increaseTo(msg.deadline + 1);
      await expect(registry.connect(relayer).grantConsent(msg, sig))
        .to.be.revertedWithCustomError(registry, "SignatureExpired")
        .withArgs(msg.deadline);
    });

    it("accepts a signature exactly at its deadline", async () => {
      const { registry, domain, alice, fiduciary, relayer, purposeId } = await loadFixture(deployWithPurpose);
      const t = await now();
      const msg = await grantMessage({ principal: alice.address, fiduciary: fiduciary.address, purposeId, deadline: t + 100 });
      const sig = await signGrant(alice, domain, msg);
      await time.setNextBlockTimestamp(t + 100);
      await registry.connect(relayer).grantConsent(msg, sig);
    });

    it("reverts when the consent would already be expired", async () => {
      const { registry, domain, alice, fiduciary, relayer, purposeId } = await loadFixture(deployWithPurpose);
      const t = await now();
      const msg = await grantMessage({ principal: alice.address, fiduciary: fiduciary.address, purposeId, expiresAt: t });
      const sig = await signGrant(alice, domain, msg);
      await expect(registry.connect(relayer).grantConsent(msg, sig)).to.be.revertedWithCustomError(registry, "InvalidExpiry");
    });

    it("reverts for an unknown purpose, a mismatched fiduciary and an inactive purpose", async () => {
      const { registry, domain, alice, fiduciary, relayer, admin, purposeId } = await loadFixture(deployWithPurpose);
      const unknown = ethers.id("nope");
      let msg = await grantMessage({ principal: alice.address, fiduciary: fiduciary.address, purposeId: unknown });
      await expect(registry.connect(relayer).grantConsent(msg, await signGrant(alice, domain, msg)))
        .to.be.revertedWithCustomError(registry, "UnknownPurpose")
        .withArgs(unknown);

      msg = await grantMessage({ principal: alice.address, fiduciary: admin.address, purposeId });
      await expect(registry.connect(relayer).grantConsent(msg, await signGrant(alice, domain, msg))).to.be.revertedWithCustomError(
        registry,
        "WrongFiduciary",
      );

      await registry.connect(fiduciary).setPurposeActive(purposeId, false);
      msg = await grantMessage({ principal: alice.address, fiduciary: fiduciary.address, purposeId });
      await expect(registry.connect(relayer).grantConsent(msg, await signGrant(alice, domain, msg)))
        .to.be.revertedWithCustomError(registry, "PurposeInactive")
        .withArgs(purposeId);
    });

    it("does not consume the nonce when a grant reverts", async () => {
      const { registry, domain, alice, bob, fiduciary, relayer, purposeId } = await loadFixture(deployWithPurpose);
      const msg = await grantMessage({ principal: alice.address, fiduciary: fiduciary.address, purposeId });
      await expect(registry.connect(relayer).grantConsent(msg, await signGrant(bob, domain, msg))).to.be.reverted;
      expect(await registry.nonces(alice.address)).to.equal(0n);
    });
  });

  // --- test 2 ---
  describe("withdraw", () => {
    async function granted() {
      const f = await deployWithPurpose();
      const msg = await grantMessage({ principal: f.alice.address, fiduciary: f.fiduciary.address, purposeId: f.purposeId });
      await f.registry.connect(f.relayer).grantConsent(msg, await signGrant(f.alice, f.domain, msg));
      return f;
    }

    it("flips the state and hasValidConsent is false immediately", async () => {
      const { registry, domain, alice, fiduciary, relayer, purposeId } = await loadFixture(granted);
      const msg = await withdrawMessage({ principal: alice.address, fiduciary: fiduciary.address, purposeId, nonce: "1" });
      await expect(registry.connect(relayer).withdrawConsent(msg, await signWithdraw(alice, domain, msg)))
        .to.emit(registry, "ConsentWithdrawn")
        .withArgs(alice.address, fiduciary.address, purposeId, anyValue);

      const c = await registry.getConsent(alice.address, fiduciary.address, purposeId);
      expect(c.status).to.equal(Status.Withdrawn);
      expect(c.updatedAt).to.equal(BigInt(await now()));
      expect(await registry.hasValidConsent(alice.address, fiduciary.address, purposeId)).to.equal(false);
    });

    it("works even after the fiduciary deactivates the purpose (withdrawal is unconditional)", async () => {
      const { registry, domain, alice, fiduciary, relayer, purposeId } = await loadFixture(granted);
      await registry.connect(fiduciary).setPurposeActive(purposeId, false);
      const msg = await withdrawMessage({ principal: alice.address, fiduciary: fiduciary.address, purposeId, nonce: "1" });
      await registry.connect(relayer).withdrawConsent(msg, await signWithdraw(alice, domain, msg));
      expect(await registry.hasValidConsent(alice.address, fiduciary.address, purposeId)).to.equal(false);
    });

    it("works on a consent that has expired but was never withdrawn", async () => {
      const { registry, domain, alice, fiduciary, relayer, purposeId } = await loadFixture(granted);
      await time.increase(31 * DAY);
      const msg = await withdrawMessage({ principal: alice.address, fiduciary: fiduciary.address, purposeId, nonce: "1" });
      await registry.connect(relayer).withdrawConsent(msg, await signWithdraw(alice, domain, msg));
      expect((await registry.getConsent(alice.address, fiduciary.address, purposeId)).status).to.equal(Status.Withdrawn);
    });

    it("requires an active consent", async () => {
      const { registry, domain, alice, bob, fiduciary, relayer, purposeId } = await loadFixture(granted);
      // never granted
      let msg = await withdrawMessage({ principal: bob.address, fiduciary: fiduciary.address, purposeId });
      await expect(registry.connect(relayer).withdrawConsent(msg, await signWithdraw(bob, domain, msg))).to.be.revertedWithCustomError(
        registry,
        "NotActive",
      );
      // already withdrawn
      msg = await withdrawMessage({ principal: alice.address, fiduciary: fiduciary.address, purposeId, nonce: "1" });
      await registry.connect(relayer).withdrawConsent(msg, await signWithdraw(alice, domain, msg));
      msg = await withdrawMessage({ principal: alice.address, fiduciary: fiduciary.address, purposeId, nonce: "2" });
      await expect(registry.connect(relayer).withdrawConsent(msg, await signWithdraw(alice, domain, msg))).to.be.revertedWithCustomError(
        registry,
        "NotActive",
      );
    });

    it("rejects a wrong signer, a replayed nonce and an expired deadline", async () => {
      const { registry, domain, alice, bob, fiduciary, relayer, purposeId } = await loadFixture(granted);
      const msg = await withdrawMessage({ principal: alice.address, fiduciary: fiduciary.address, purposeId, nonce: "1" });
      await expect(registry.connect(relayer).withdrawConsent(msg, await signWithdraw(bob, domain, msg))).to.be.revertedWithCustomError(
        registry,
        "InvalidSignature",
      );

      const stale = await withdrawMessage({ principal: alice.address, fiduciary: fiduciary.address, purposeId, nonce: "0" });
      await expect(registry.connect(relayer).withdrawConsent(stale, await signWithdraw(alice, domain, stale)))
        .to.be.revertedWithCustomError(registry, "InvalidNonce")
        .withArgs(1n, 0n);

      const sig = await signWithdraw(alice, domain, msg);
      await time.increaseTo(msg.deadline + 1);
      await expect(registry.connect(relayer).withdrawConsent(msg, sig)).to.be.revertedWithCustomError(registry, "SignatureExpired");
    });

    it("a grant signature cannot be replayed as a withdrawal (distinct type hashes)", async () => {
      const { registry, domain, alice, fiduciary, relayer, purposeId } = await loadFixture(granted);
      const msg = await withdrawMessage({ principal: alice.address, fiduciary: fiduciary.address, purposeId, nonce: "1" });
      const wrongType = await signGrant(alice, domain, {
        ...msg,
        expiresAt: 0,
        noticeHash: ZERO_HASH,
      });
      await expect(registry.connect(relayer).withdrawConsent(msg, wrongType)).to.be.revertedWithCustomError(registry, "InvalidSignature");
    });
  });

  // --- test 3 ---
  describe("expiry", () => {
    it("makes hasValidConsent false without any transaction", async () => {
      const { registry, domain, alice, fiduciary, relayer, purposeId } = await loadFixture(deployWithPurpose);
      const msg = await grantMessage({ principal: alice.address, fiduciary: fiduciary.address, purposeId });
      await registry.connect(relayer).grantConsent(msg, await signGrant(alice, domain, msg));

      await time.setNextBlockTimestamp(msg.expiresAt - 1);
      await ethers.provider.send("evm_mine", []);
      expect(await registry.hasValidConsent(alice.address, fiduciary.address, purposeId)).to.equal(true);

      await time.increaseTo(msg.expiresAt);
      expect(await registry.hasValidConsent(alice.address, fiduciary.address, purposeId)).to.equal(false);
      expect((await registry.getConsent(alice.address, fiduciary.address, purposeId)).status).to.equal(Status.Active);
    });
  });

  // --- test 4 ---
  describe("re-grant", () => {
    it("works after a withdrawal and bumps noticeVersion", async () => {
      const { registry, domain, alice, fiduciary, relayer, purposeId } = await loadFixture(deployWithPurpose);
      const grant = async (nonce: string) => {
        const msg = await grantMessage({ principal: alice.address, fiduciary: fiduciary.address, purposeId, nonce });
        await registry.connect(relayer).grantConsent(msg, await signGrant(alice, domain, msg));
      };
      await grant("0");
      const w = await withdrawMessage({ principal: alice.address, fiduciary: fiduciary.address, purposeId, nonce: "1" });
      await registry.connect(relayer).withdrawConsent(w, await signWithdraw(alice, domain, w));
      expect(await registry.hasValidConsent(alice.address, fiduciary.address, purposeId)).to.equal(false);

      await grant("2");
      const c = await registry.getConsent(alice.address, fiduciary.address, purposeId);
      expect(c.status).to.equal(Status.Active);
      expect(c.noticeVersion).to.equal(2n);
      expect(await registry.hasValidConsent(alice.address, fiduciary.address, purposeId)).to.equal(true);
    });

    it("keeps consents independent per principal", async () => {
      const { registry, domain, alice, bob, fiduciary, relayer, purposeId } = await loadFixture(deployWithPurpose);
      const msg = await grantMessage({ principal: alice.address, fiduciary: fiduciary.address, purposeId });
      await registry.connect(relayer).grantConsent(msg, await signGrant(alice, domain, msg));
      expect(await registry.hasValidConsent(bob.address, fiduciary.address, purposeId)).to.equal(false);
      expect((await registry.getConsent(bob.address, fiduciary.address, purposeId)).status).to.equal(Status.None);
    });
  });

  // --- test 5 ---
  describe("ledgerHead", () => {
    it("starts at zero, changes on every action and matches the off-chain replay", async () => {
      const a = await actors();
      const { registry, domain } = await deployRegistry(a.admin);
      expect(await registry.ledgerHead()).to.equal(ZERO_HASH);

      const actions: LedgerAction[] = [];
      const heads: string[] = [];
      const step = async (tx: Promise<ContractTransactionResponse>, action: Pick<LedgerAction, "actionType"> & Partial<LedgerAction>) => {
        const blockTimestamp = await mined(tx);
        actions.push({ principal: ethers.ZeroAddress, fiduciary: ethers.ZeroAddress, purposeId: ZERO_HASH, expiresAtOrZero: 0, ...action, blockTimestamp });
        const head = await registry.ledgerHead();
        expect(head).to.not.equal(heads[heads.length - 1] ?? ZERO_HASH);
        expect(head).to.equal(replayLedger(actions));
        heads.push(head);
      };

      const purposeId = purposeIdOf(a.fiduciary.address, CODE);
      await step(registry.connect(a.admin).registerFiduciary(a.fiduciary.address, "QuickLoan", META), {
        actionType: ACTION.RegisterFiduciary,
        fiduciary: a.fiduciary.address,
      });
      await step(registry.connect(a.fiduciary).registerPurpose(purposeId, DESC_HASH, 365, false), {
        actionType: ACTION.RegisterPurpose,
        fiduciary: a.fiduciary.address,
        purposeId,
      });
      await step(registry.connect(a.fiduciary).registerProcessor(purposeId, a.processor.address, META), {
        actionType: ACTION.RegisterProcessor,
        principal: a.processor.address,
        fiduciary: a.fiduciary.address,
        purposeId,
      });
      await step(registry.connect(a.fiduciary).setPurposeActive(purposeId, false), {
        actionType: ACTION.SetPurposeActive,
        fiduciary: a.fiduciary.address,
        purposeId,
        expiresAtOrZero: 0,
      });
      await step(registry.connect(a.fiduciary).setPurposeActive(purposeId, true), {
        actionType: ACTION.SetPurposeActive,
        fiduciary: a.fiduciary.address,
        purposeId,
        expiresAtOrZero: 1,
      });

      const g = await grantMessage({ principal: a.alice.address, fiduciary: a.fiduciary.address, purposeId });
      await step(registry.connect(a.relayer).grantConsent(g, await signGrant(a.alice, domain, g)), {
        actionType: ACTION.Grant,
        principal: a.alice.address,
        fiduciary: a.fiduciary.address,
        purposeId,
        expiresAtOrZero: g.expiresAt,
      });

      const w = await withdrawMessage({ principal: a.alice.address, fiduciary: a.fiduciary.address, purposeId, nonce: "1" });
      await step(registry.connect(a.relayer).withdrawConsent(w, await signWithdraw(a.alice, domain, w)), {
        actionType: ACTION.Withdraw,
        principal: a.alice.address,
        fiduciary: a.fiduciary.address,
        purposeId,
      });

      await step(registry.connect(a.processor).acknowledgeWithdrawal(a.alice.address, a.fiduciary.address, purposeId), {
        actionType: ACTION.Acknowledge,
        principal: a.alice.address,
        fiduciary: a.fiduciary.address,
        purposeId,
      });

      expect(new Set(heads).size).to.equal(heads.length);
    });

    it("emits the new head on grant and withdraw events", async () => {
      const { registry, domain, alice, fiduciary, relayer, purposeId } = await loadFixture(deployWithPurpose);
      const g = await grantMessage({ principal: alice.address, fiduciary: fiduciary.address, purposeId });
      const granted = await eventOf(registry, registry.connect(relayer).grantConsent(g, await signGrant(alice, domain, g)), "ConsentGranted");
      expect(granted.args.ledgerHead).to.equal(await registry.ledgerHead());

      const w = await withdrawMessage({ principal: alice.address, fiduciary: fiduciary.address, purposeId, nonce: "1" });
      const withdrawn = await eventOf(registry, registry.connect(relayer).withdrawConsent(w, await signWithdraw(alice, domain, w)), "ConsentWithdrawn");
      expect(withdrawn.args.ledgerHead).to.equal(await registry.ledgerHead());
      expect(withdrawn.args.ledgerHead).to.not.equal(granted.args.ledgerHead);
    });

    it("is deterministic: identical histories on two registries give the same head", async () => {
      const a = await actors();
      const t0 = (await now()) + 100;
      const snapshot = await takeSnapshot();
      const run = async () => {
        const { registry } = await deployRegistry(a.admin);
        const pid = purposeIdOf(a.fiduciary.address, CODE);
        await time.setNextBlockTimestamp(t0);
        await registry.connect(a.admin).registerFiduciary(a.fiduciary.address, "QuickLoan", META);
        await time.setNextBlockTimestamp(t0 + 10);
        await registry.connect(a.fiduciary).registerPurpose(pid, DESC_HASH, 365, false);
        return registry.ledgerHead();
      };
      const first = await run();
      await snapshot.restore(); // same chain state and clock, so the same history can be replayed
      expect(await run()).to.equal(first);
    });
  });

  // --- test 6 ---
  describe("processor acknowledgement", () => {
    async function withdrawn() {
      const f = await deployWithPurpose();
      const g = await grantMessage({ principal: f.alice.address, fiduciary: f.fiduciary.address, purposeId: f.purposeId });
      await f.registry.connect(f.relayer).grantConsent(g, await signGrant(f.alice, f.domain, g));
      const w = await withdrawMessage({ principal: f.alice.address, fiduciary: f.fiduciary.address, purposeId: f.purposeId, nonce: "1" });
      await f.registry.connect(f.relayer).withdrawConsent(w, await signWithdraw(f.alice, f.domain, w));
      return f;
    }

    it("accepts a registered processor once and emits WithdrawalAcknowledged", async () => {
      const { registry, alice, fiduciary, processor, purposeId } = await loadFixture(withdrawn);
      await expect(registry.connect(processor).acknowledgeWithdrawal(alice.address, fiduciary.address, purposeId))
        .to.emit(registry, "WithdrawalAcknowledged")
        .withArgs(alice.address, purposeId, processor.address, anyValue);
      await expect(
        registry.connect(processor).acknowledgeWithdrawal(alice.address, fiduciary.address, purposeId),
      ).to.be.revertedWithCustomError(registry, "AlreadyAcknowledged");
    });

    it("acknowledges each withdrawal separately: a consent withdrawn a second time needs a second acknowledgement", async () => {
      const { registry, domain, alice, fiduciary, relayer, processor, purposeId } = await loadFixture(withdrawn);
      await registry.connect(processor).acknowledgeWithdrawal(alice.address, fiduciary.address, purposeId);

      // the user grants again, then withdraws again
      const g = await grantMessage({ principal: alice.address, fiduciary: fiduciary.address, purposeId, nonce: "2" });
      await registry.connect(relayer).grantConsent(g, await signGrant(alice, domain, g));
      await expect(registry.connect(processor).acknowledgeWithdrawal(alice.address, fiduciary.address, purposeId)).to.be.revertedWithCustomError(
        registry,
        "NotWithdrawn",
      );
      const w = await withdrawMessage({ principal: alice.address, fiduciary: fiduciary.address, purposeId, nonce: "3" });
      await registry.connect(relayer).withdrawConsent(w, await signWithdraw(alice, domain, w));

      await expect(registry.connect(processor).acknowledgeWithdrawal(alice.address, fiduciary.address, purposeId))
        .to.emit(registry, "WithdrawalAcknowledged")
        .withArgs(alice.address, purposeId, processor.address, anyValue);
      // and still only once per withdrawal
      await expect(registry.connect(processor).acknowledgeWithdrawal(alice.address, fiduciary.address, purposeId)).to.be.revertedWithCustomError(
        registry,
        "AlreadyAcknowledged",
      );
    });

    it("rejects anyone who is not a registered processor of that purpose", async () => {
      const { registry, alice, fiduciary, stranger, purposeId } = await loadFixture(withdrawn);
      await expect(
        registry.connect(stranger).acknowledgeWithdrawal(alice.address, fiduciary.address, purposeId),
      ).to.be.revertedWithCustomError(registry, "NotProcessor");
      await expect(
        registry.connect(fiduciary).acknowledgeWithdrawal(alice.address, fiduciary.address, purposeId),
      ).to.be.revertedWithCustomError(registry, "NotProcessor");
    });

    it("rejects an acknowledgement while the consent is still active or was never given", async () => {
      const { registry, domain, alice, bob, fiduciary, relayer, processor, purposeId } = await loadFixture(deployWithPurpose);
      await expect(
        registry.connect(processor).acknowledgeWithdrawal(bob.address, fiduciary.address, purposeId),
      ).to.be.revertedWithCustomError(registry, "NotWithdrawn");

      const g = await grantMessage({ principal: alice.address, fiduciary: fiduciary.address, purposeId });
      await registry.connect(relayer).grantConsent(g, await signGrant(alice, domain, g));
      await expect(
        registry.connect(processor).acknowledgeWithdrawal(alice.address, fiduciary.address, purposeId),
      ).to.be.revertedWithCustomError(registry, "NotWithdrawn");
    });
  });

  // --- registration, access control and events ---
  describe("registration", () => {
    it("lets only the admin register fiduciaries, once, and emits the event", async () => {
      const a = await actors();
      const { registry } = await deployRegistry(a.admin);
      expect(await registry.admin()).to.equal(a.admin.address);
      await expect(registry.connect(a.stranger).registerFiduciary(a.fiduciary.address, "X", META)).to.be.revertedWithCustomError(registry, "NotAdmin");
      await expect(registry.connect(a.admin).registerFiduciary(ethers.ZeroAddress, "X", META)).to.be.revertedWithCustomError(registry, "ZeroAddress");
      await expect(registry.connect(a.admin).registerFiduciary(a.fiduciary.address, "QuickLoan", META))
        .to.emit(registry, "FiduciaryRegistered")
        .withArgs(a.fiduciary.address, "QuickLoan");
      expect(await registry.isFiduciary(a.fiduciary.address)).to.equal(true);
      await expect(registry.connect(a.admin).registerFiduciary(a.fiduciary.address, "QuickLoan", META)).to.be.revertedWithCustomError(
        registry,
        "FiduciaryAlreadyRegistered",
      );
    });

    it("lets only registered fiduciaries register purposes, once, and stores them active", async () => {
      const a = await actors();
      const { registry } = await deployRegistry(a.admin);
      const pid = purposeIdOf(a.fiduciary.address, CODE);
      await expect(registry.connect(a.fiduciary).registerPurpose(pid, DESC_HASH, 365, true)).to.be.revertedWithCustomError(registry, "NotFiduciary");
      await registry.connect(a.admin).registerFiduciary(a.fiduciary.address, "QuickLoan", META);
      await expect(registry.connect(a.fiduciary).registerPurpose(pid, DESC_HASH, 365, true))
        .to.emit(registry, "PurposeRegistered")
        .withArgs(a.fiduciary.address, pid, DESC_HASH);
      const p = await registry.getPurpose(pid);
      expect(p.fiduciary).to.equal(a.fiduciary.address);
      expect(p.descHash).to.equal(DESC_HASH);
      expect(p.retentionDays).to.equal(365n);
      expect(p.sharesWithThirdParties).to.equal(true);
      expect(p.active).to.equal(true);
      await expect(registry.connect(a.fiduciary).registerPurpose(pid, DESC_HASH, 365, true)).to.be.revertedWithCustomError(
        registry,
        "PurposeAlreadyRegistered",
      );
    });

    it("lets only the purpose owner register processors and toggle the purpose", async () => {
      const f = await loadFixture(deployWithPurpose);
      const { registry, admin, fiduciary, stranger, processor, purposeId } = f;
      expect(await registry.isProcessor(purposeId, processor.address)).to.equal(true);
      await expect(registry.connect(fiduciary).registerProcessor(purposeId, processor.address, META)).to.be.revertedWithCustomError(
        registry,
        "ProcessorAlreadyRegistered",
      );
      await expect(registry.connect(stranger).registerProcessor(purposeId, stranger.address, META)).to.be.revertedWithCustomError(registry, "NotFiduciary");
      await expect(registry.connect(fiduciary).registerProcessor(ethers.id("nope"), stranger.address, META)).to.be.revertedWithCustomError(
        registry,
        "UnknownPurpose",
      );
      // a different registered fiduciary cannot touch someone else's purpose
      await registry.connect(admin).registerFiduciary(stranger.address, "Rival", META);
      await expect(registry.connect(stranger).registerProcessor(purposeId, stranger.address, META)).to.be.revertedWithCustomError(registry, "WrongFiduciary");
      await expect(registry.connect(stranger).setPurposeActive(purposeId, false)).to.be.revertedWithCustomError(registry, "WrongFiduciary");

      await expect(registry.connect(fiduciary).setPurposeActive(purposeId, false))
        .to.emit(registry, "PurposeActiveChanged")
        .withArgs(fiduciary.address, purposeId, false);
      expect((await registry.getPurpose(purposeId)).active).to.equal(false);
    });

    it("emits ProcessorRegistered", async () => {
      const { registry, fiduciary, purposeId, stranger } = await loadFixture(deployWithPurpose);
      await expect(registry.connect(fiduciary).registerProcessor(purposeId, stranger.address, META))
        .to.emit(registry, "ProcessorRegistered")
        .withArgs(purposeId, stranger.address);
    });
  });

  describe("shared ABI", () => {
    it("shared/abi/ConsentRegistry.json is the compiled ABI (run `pnpm --filter @sammati/contracts abi`)", async () => {
      const { abi } = await artifacts.readArtifact("ConsentRegistry");
      const file = resolve(__dirname, "../../shared/abi/ConsentRegistry.json");
      expect(JSON.parse(readFileSync(file, "utf8"))).to.deep.equal(abi);
    });
  });
});
