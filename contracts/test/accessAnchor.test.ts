import { expect } from "chai";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { artifacts, ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { chainEntry, merkleProof, merkleRoot, verifyMerkleProof, type AccessLogEntry } from "@sammati/shared";
import { META, actors, deployAnchor, deployRegistry, now } from "./helpers";

const root = (label: string) => ethers.id(label);

async function setup() {
  const a = await actors();
  const { registry } = await deployRegistry(a.admin);
  await registry.connect(a.admin).registerFiduciary(a.fiduciary.address, "QuickLoan", META);
  await registry.connect(a.admin).registerFiduciary(a.bob.address, "MediCare+", META);
  const anchor = await deployAnchor(registry, a.admin);
  return { ...a, registry, anchor };
}

describe("AccessAnchor", () => {
  // --- trd.md §3.3 test 7 ---
  describe("anchorAccessBatch", () => {
    it("stores the root with its range and time, and emits AccessBatchAnchored", async () => {
      const { anchor, fiduciary } = await loadFixture(setup);
      expect(await anchor.batchCount(fiduciary.address)).to.equal(0n);

      await expect(anchor.connect(fiduciary).anchorAccessBatch(root("a"), 1, 20, 20))
        .to.emit(anchor, "AccessBatchAnchored")
        .withArgs(fiduciary.address, 0n, root("a"), 1n, 20n, 20n);

      expect(await anchor.batchCount(fiduciary.address)).to.equal(1n);
      const batch = await anchor.getBatch(fiduciary.address, 0);
      expect(batch.root).to.equal(root("a"));
      expect(batch.fromSeq).to.equal(1n);
      expect(batch.toSeq).to.equal(20n);
      expect(batch.count).to.equal(20n);
      // `batch.at` is Array.prototype.at on ethers' Result, so read the output by position.
      expect(batch[4]).to.equal(BigInt(await now()));
    });

    it("indexes batches in order and keeps every earlier one intact", async () => {
      const { anchor, fiduciary } = await loadFixture(setup);
      await anchor.connect(fiduciary).anchorAccessBatch(root("a"), 1, 20, 20);
      await expect(anchor.connect(fiduciary).anchorAccessBatch(root("b"), 21, 25, 5))
        .to.emit(anchor, "AccessBatchAnchored")
        .withArgs(fiduciary.address, 1n, root("b"), 21n, 25n, 5n);

      expect(await anchor.batchCount(fiduciary.address)).to.equal(2n);
      expect((await anchor.getBatch(fiduciary.address, 0)).root).to.equal(root("a"));
      expect((await anchor.getBatch(fiduciary.address, 1)).root).to.equal(root("b"));
    });

    it("accepts a single-entry batch", async () => {
      const { anchor, fiduciary } = await loadFixture(setup);
      await anchor.connect(fiduciary).anchorAccessBatch(root("a"), 1, 1, 1);
      expect((await anchor.getBatch(fiduciary.address, 0)).count).to.equal(1n);
    });

    it("keeps each fiduciary's sequence independent", async () => {
      const { anchor, fiduciary, bob } = await loadFixture(setup);
      await anchor.connect(fiduciary).anchorAccessBatch(root("a"), 1, 10, 10);
      await anchor.connect(bob).anchorAccessBatch(root("b"), 1, 3, 3); // starts at 1 again
      expect(await anchor.batchCount(fiduciary.address)).to.equal(1n);
      expect(await anchor.batchCount(bob.address)).to.equal(1n);
      expect((await anchor.getBatch(bob.address, 0)).root).to.equal(root("b"));
    });

    it("rejects a gap (fromSeq must follow the previous toSeq)", async () => {
      const { anchor, fiduciary } = await loadFixture(setup);
      await anchor.connect(fiduciary).anchorAccessBatch(root("a"), 1, 20, 20);
      await expect(anchor.connect(fiduciary).anchorAccessBatch(root("b"), 22, 30, 9))
        .to.be.revertedWithCustomError(anchor, "NonContiguous")
        .withArgs(21n, 22n);
    });

    it("rejects an overlap and a replay of an anchored range", async () => {
      const { anchor, fiduciary } = await loadFixture(setup);
      await anchor.connect(fiduciary).anchorAccessBatch(root("a"), 1, 20, 20);
      await expect(anchor.connect(fiduciary).anchorAccessBatch(root("b"), 20, 30, 11))
        .to.be.revertedWithCustomError(anchor, "NonContiguous")
        .withArgs(21n, 20n);
      await expect(anchor.connect(fiduciary).anchorAccessBatch(root("a"), 1, 20, 20))
        .to.be.revertedWithCustomError(anchor, "NonContiguous")
        .withArgs(21n, 1n);
    });

    it("requires the first batch to start at seq 1", async () => {
      const { anchor, fiduciary } = await loadFixture(setup);
      await expect(anchor.connect(fiduciary).anchorAccessBatch(root("a"), 5, 10, 6))
        .to.be.revertedWithCustomError(anchor, "NonContiguous")
        .withArgs(1n, 5n);
    });

    it("rejects an inconsistent range or count", async () => {
      const { anchor, fiduciary } = await loadFixture(setup);
      await expect(anchor.connect(fiduciary).anchorAccessBatch(root("a"), 10, 5, 1)).to.be.revertedWithCustomError(anchor, "InvalidRange");
      await expect(anchor.connect(fiduciary).anchorAccessBatch(root("a"), 1, 20, 19)).to.be.revertedWithCustomError(anchor, "InvalidRange");
      await expect(anchor.connect(fiduciary).anchorAccessBatch(root("a"), 1, 20, 0)).to.be.revertedWithCustomError(anchor, "InvalidRange");
    });

    it("rejects a zero root", async () => {
      const { anchor, fiduciary } = await loadFixture(setup);
      await expect(anchor.connect(fiduciary).anchorAccessBatch(ethers.ZeroHash, 1, 1, 1)).to.be.revertedWithCustomError(anchor, "InvalidRoot");
    });

    it("lets only registered fiduciaries anchor, including not the admin or a relayer", async () => {
      const { anchor, admin, relayer, stranger } = await loadFixture(setup);
      for (const who of [stranger, admin, relayer]) {
        await expect(anchor.connect(who).anchorAccessBatch(root("a"), 1, 1, 1)).to.be.revertedWithCustomError(anchor, "NotFiduciary");
      }
    });

    it("follows the registry: a fiduciary registered later can anchor", async () => {
      const { anchor, registry, admin, stranger } = await loadFixture(setup);
      await expect(anchor.connect(stranger).anchorAccessBatch(root("a"), 1, 1, 1)).to.be.revertedWithCustomError(anchor, "NotFiduciary");
      await registry.connect(admin).registerFiduciary(stranger.address, "Late", META);
      await anchor.connect(stranger).anchorAccessBatch(root("a"), 1, 1, 1);
      expect(await anchor.batchCount(stranger.address)).to.equal(1n);
    });
  });

  describe("views", () => {
    it("reverts for a batch that does not exist", async () => {
      const { anchor, fiduciary, stranger } = await loadFixture(setup);
      await expect(anchor.getBatch(fiduciary.address, 0)).to.be.revertedWithCustomError(anchor, "BatchNotFound").withArgs(fiduciary.address, 0n);
      await anchor.connect(fiduciary).anchorAccessBatch(root("a"), 1, 1, 1);
      await expect(anchor.getBatch(fiduciary.address, 1)).to.be.revertedWithCustomError(anchor, "BatchNotFound");
      expect(await anchor.batchCount(stranger.address)).to.equal(0n);
    });

    it("exposes the registry it follows", async () => {
      const { anchor, registry } = await loadFixture(setup);
      expect(await anchor.registry()).to.equal(await registry.getAddress());
    });

    it("cannot be deployed without a registry", async () => {
      const { admin } = await actors();
      const factory = await ethers.getContractFactory("AccessAnchor", admin);
      await expect(factory.deploy(ethers.ZeroAddress)).to.be.revertedWithCustomError(factory, "ZeroAddress");
    });
  });

  describe("with real log entries (what Core will anchor)", () => {
    it("an anchored root verifies Merkle proofs built by shared/, and a tampered entry no longer does", async () => {
      const { anchor, fiduciary } = await loadFixture(setup);
      const entries: AccessLogEntry[] = Array.from({ length: 5 }, (_, i) => ({
        at: 1760000000 + i,
        decision: i % 2 ? "BLOCKED" : "ALLOWED",
        endpoint: "GET /customers/:id/credit-profile",
        fiduciary: fiduciary.address,
        id: `entry-${i + 1}`,
        latencyMs: 10,
        principal: ethers.ZeroAddress,
        purposeCode: "credit_check",
        reason: i % 2 ? "CONSENT_WITHDRAWN" : "OK",
        seq: i + 1,
      }));
      const hashes: string[] = [];
      let prev: string | null = null;
      for (const e of entries) {
        const chained = chainEntry(prev, e);
        hashes.push(chained.hash);
        prev = chained.hash;
      }

      await anchor.connect(fiduciary).anchorAccessBatch(merkleRoot(hashes), 1, 5, 5);
      const onChain = (await anchor.getBatch(fiduciary.address, 0)).root;

      hashes.forEach((leaf, i) => expect(verifyMerkleProof(leaf, merkleProof(hashes, i), onChain)).to.equal(true));

      const edited = chainEntry(null, { ...entries[0]!, decision: "BLOCKED" }).hash;
      expect(verifyMerkleProof(edited, merkleProof(hashes, 0), onChain)).to.equal(false);
    });
  });

  describe("shared ABI", () => {
    it("shared/abi/AccessAnchor.json is the compiled ABI (run `pnpm --filter @sammati/contracts abi`)", async () => {
      const { abi } = await artifacts.readArtifact("AccessAnchor");
      const file = resolve(__dirname, "../../shared/abi/AccessAnchor.json");
      expect(JSON.parse(readFileSync(file, "utf8"))).to.deep.equal(abi);
    });
  });
});
