import { ethers } from "hardhat";
import type { ContractTransactionResponse } from "ethers";
import type { Handle } from "../scripts/lib";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import {
  GRANT_CONSENT_TYPE,
  WITHDRAW_CONSENT_TYPE,
  buildDomain,
  purposeIdOf,
  type GrantConsent,
  type WithdrawConsent,
} from "@sammati/shared";

export const META = ethers.id("meta");
export const DESC_HASH = ethers.id("Check your credit eligibility");
export const NOTICE_HASH = ethers.id("notice v1");
export const CODE = "credit_check";
export const DAY = 24 * 60 * 60;

export type Registry = Handle;
export type Anchor = Handle;

export async function deployAnchor(registry: Registry, deployer: HardhatEthersSigner): Promise<Anchor> {
  const factory = await ethers.getContractFactory("AccessAnchor", deployer);
  const anchor = (await factory.deploy(await registry.getAddress())) as unknown as Anchor;
  await anchor.waitForDeployment();
  return anchor;
}

export async function deployRegistry(admin: HardhatEthersSigner) {
  const factory = await ethers.getContractFactory("ConsentRegistry", admin);
  const registry = (await factory.deploy(admin.address)) as unknown as Registry;
  await registry.waitForDeployment();
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  const domain = buildDomain(chainId, await registry.getAddress());
  return { registry, domain };
}

/** Standard actors. Index 0 is Hardhat account #0, the principal of the shared test vectors. */
export async function actors() {
  const [admin, fiduciary, relayer, alice, processor, stranger, bob] = await ethers.getSigners();
  return { admin: admin!, fiduciary: fiduciary!, relayer: relayer!, alice: alice!, processor: processor!, stranger: stranger!, bob: bob! };
}

export async function deployWithPurpose() {
  const a = await actors();
  const { registry, domain } = await deployRegistry(a.admin);
  await registry.connect(a.admin).registerFiduciary(a.fiduciary.address, "QuickLoan", META);
  const purposeId = purposeIdOf(a.fiduciary.address, CODE);
  await registry.connect(a.fiduciary).registerPurpose(purposeId, DESC_HASH, 365, false);
  await registry.connect(a.fiduciary).registerProcessor(purposeId, a.processor.address, META);
  return { ...a, registry, domain, purposeId };
}

export type Domain = Awaited<ReturnType<typeof deployRegistry>>["domain"];

export async function now(): Promise<number> {
  return (await ethers.provider.getBlock("latest"))!.timestamp;
}

export async function grantMessage(
  over: Partial<GrantConsent> & Pick<GrantConsent, "principal" | "fiduciary" | "purposeId">,
): Promise<GrantConsent> {
  const t = await now();
  return {
    expiresAt: t + 30 * DAY,
    noticeHash: NOTICE_HASH,
    nonce: "0",
    deadline: t + 3600,
    ...over,
  };
}

export async function withdrawMessage(
  over: Partial<WithdrawConsent> & Pick<WithdrawConsent, "principal" | "fiduciary" | "purposeId">,
): Promise<WithdrawConsent> {
  const t = await now();
  return { nonce: "0", deadline: t + 3600, ...over };
}

export const signGrant = (signer: HardhatEthersSigner, domain: Domain, msg: GrantConsent) =>
  signer.signTypedData(domain, { GrantConsent: [...GRANT_CONSENT_TYPE] }, msg);

export const signWithdraw = (signer: HardhatEthersSigner, domain: Domain, msg: WithdrawConsent) =>
  signer.signTypedData(domain, { WithdrawConsent: [...WITHDRAW_CONSENT_TYPE] }, msg);

/** The first event with this name emitted by a transaction. */
export async function eventOf(registry: Registry, tx: Promise<ContractTransactionResponse>, name: string) {
  const receipt = (await (await tx).wait())!;
  const parsed = receipt.logs.map((l) => registry.interface.parseLog(l)).find((l) => l?.name === name);
  if (!parsed) throw new Error(`no ${name} event in transaction`);
  return parsed;
}

/** Block timestamp of a sent transaction, for replaying the ledger head off chain. */
export async function mined(tx: Promise<ContractTransactionResponse>): Promise<number> {
  const receipt = (await (await tx).wait())!;
  return (await receipt.getBlock()).timestamp;
}
