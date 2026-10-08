import { expect } from "chai";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ethers, network } from "hardhat";
import { buildDomain, purposeIdOf } from "@sammati/shared";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { META, type Registry } from "./helpers";

// Deliberately not helpers.deployRegistry: this test depends on the deployment being account #0's
// very first transaction (that is what fixes the vector's verifyingContract), so it stays visible here.
async function deploy(admin: HardhatEthersSigner): Promise<Registry> {
  const registry = (await (await ethers.getContractFactory("ConsentRegistry", admin)).deploy(admin.address)) as unknown as Registry;
  await registry.waitForDeployment();
  return registry;
}

// shared/test-vectors/eip712.json is the contract between the TS signer and the Dart wallet. If the
// registry accepts these exact signatures, the wallet's byte-for-byte copy will be accepted too.
const vectors = JSON.parse(readFileSync(resolve(__dirname, "../../shared/test-vectors/eip712.json"), "utf8"));

describe("shared EIP-712 test vectors", () => {
  before(async () => {
    // The vectors name a verifyingContract: the address account #0 gets for its first deployment
    // on a fresh chain. Reset so that deployment really is first (and the clock is back at the
    // test start date the vectors' deadlines assume).
    await network.provider.send("hardhat_reset");
  });

  it("are accepted by a ConsentRegistry deployed at the vector's address", async () => {
    const [admin, fiduciary, relayer] = await ethers.getSigners();
    expect(admin!.address).to.equal(vectors.signer);

    const registry = await deploy(admin!);

    // Nothing to adjust for the test chain: same chain id, and the deterministic deploy address.
    const chainId = Number((await ethers.provider.getNetwork()).chainId);
    expect(buildDomain(chainId, await registry.getAddress())).to.deep.equal(vectors.domain);

    const grant = vectors.grant.typedData.message;
    const withdraw = vectors.withdraw.typedData.message;
    expect(grant.fiduciary).to.equal(fiduciary!.address);
    expect(grant.purposeId).to.equal(purposeIdOf(fiduciary!.address, "credit_check"));

    await registry.connect(admin).registerFiduciary(fiduciary!.address, "QuickLoan", META);
    await registry.connect(fiduciary).registerPurpose(grant.purposeId, ethers.id("credit_check"), 365, false);

    // The contract's own digest must be the digest in the vector.
    expect(ethers.TypedDataEncoder.hash(vectors.domain, { GrantConsent: vectors.grant.typedData.types.GrantConsent }, grant)).to.equal(
      vectors.grant.digest,
    );

    await registry.connect(relayer).grantConsent(grant, vectors.grant.signature);
    const consent = await registry.getConsent(grant.principal, grant.fiduciary, grant.purposeId);
    expect(consent.status).to.equal(1n);
    expect(consent.expiresAt).to.equal(BigInt(grant.expiresAt));
    expect(consent.noticeHash).to.equal(grant.noticeHash);
    expect(await registry.hasValidConsent(grant.principal, grant.fiduciary, grant.purposeId)).to.equal(true);

    await registry.connect(relayer).withdrawConsent(withdraw, vectors.withdraw.signature);
    expect(await registry.hasValidConsent(grant.principal, grant.fiduciary, grant.purposeId)).to.equal(false);
    expect((await registry.getConsent(grant.principal, grant.fiduciary, grant.purposeId)).status).to.equal(2n);
    expect(await registry.nonces(grant.principal)).to.equal(2n);
  });

  it("are rejected if a single field is altered", async () => {
    const [admin, fiduciary, relayer] = await ethers.getSigners();
    const registry = await deploy(admin!);
    await registry.connect(admin).registerFiduciary(fiduciary!.address, "QuickLoan", META);
    const grant = vectors.grant.typedData.message;
    await registry.connect(fiduciary).registerPurpose(grant.purposeId, ethers.id("credit_check"), 365, false);

    await expect(
      registry.connect(relayer).grantConsent({ ...grant, expiresAt: grant.expiresAt + 1 }, vectors.grant.signature),
    ).to.be.revertedWithCustomError(registry, "InvalidSignature");
  });
});
