// Regenerates test-vectors/eip712.json. Deterministic (RFC 6979), so reruns
// produce identical output. The key is Hardhat's public account #0: never
// use it for anything real.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SigningKey, computeAddress, recoverAddress } from "ethers";
import {
  buildDomain,
  eip712Digest,
  grantTypedData,
  noticeHash,
  purposeIdOf,
  withdrawTypedData,
  type NoticeInput,
} from "../src/index";

const PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const FIDUCIARY = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"; // Hardhat #1
const VERIFYING_CONTRACT = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
const CHAIN_ID = 31337;

const principal = computeAddress(PRIVATE_KEY);
const domain = buildDomain(CHAIN_ID, VERIFYING_CONTRACT);
const purposeId = purposeIdOf(FIDUCIARY, "credit_check");

const notice: NoticeInput = {
  fiduciary: FIDUCIARY,
  version: 1,
  purposes: [
    {
      id: purposeId,
      desc_en: "Check your credit eligibility",
      desc_hi: "[hi] Check your credit eligibility",
      desc_kn: "[kn] Check your credit eligibility",
      dataCategories: ["PAN", "income", "12 months of statements"],
      retentionDays: 365,
      sharesThirdParty: false,
    },
  ],
};

const key = new SigningKey(PRIVATE_KEY);

function sign(td: Parameters<typeof eip712Digest>[0]) {
  const digest = eip712Digest(td);
  const signature = key.sign(digest).serialized;
  if (recoverAddress(digest, signature) !== principal) throw new Error("recover mismatch");
  return { typedData: td, digest, signature };
}

const grant = sign(
  grantTypedData(domain, {
    principal,
    fiduciary: FIDUCIARY,
    purposeId,
    expiresAt: 1790000000,
    noticeHash: noticeHash(notice),
    nonce: "0",
    deadline: 1760003600,
  }),
);

const withdraw = sign(
  withdrawTypedData(domain, {
    principal,
    fiduciary: FIDUCIARY,
    purposeId,
    nonce: "1",
    deadline: 1760007200,
  }),
);

const out = {
  note: "Hardhat public test key #0. Digest is signed raw (no prefix); signature is r||s||v (65 bytes).",
  privateKey: PRIVATE_KEY,
  signer: principal,
  domain,
  notice: { input: notice, noticeHash: noticeHash(notice) },
  grant,
  withdraw,
};

const file = resolve(dirname(fileURLToPath(import.meta.url)), "../test-vectors/eip712.json");
mkdirSync(dirname(file), { recursive: true });
writeFileSync(file, JSON.stringify(out, null, 2) + "\n");
console.log("wrote", file);
