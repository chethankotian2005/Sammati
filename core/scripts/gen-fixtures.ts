// Regenerates core/fixtures/*.json from shared/seed.ts. Deterministic: fixed
// clock, hashes derived from labels. Run with `pnpm --filter @sammati/core fixtures`.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEMO_PRINCIPAL,
  SEED_FIDUCIARIES,
  ZERO_HASH,
  chainEntry,
  keccakUtf8,
  merkleRoot,
  purposeIdOf,
  type AccessLogEntry,
  type AnchorBatchView,
  type CascadeItem,
  type ConsentView,
  type Decision,
  type FiduciaryConsents,
  type LedgerEventView,
  type PrincipalConsentsResponse,
  type Status,
  type StoredAccessLogEntry,
} from "@sammati/shared";
import type { DirectoryFile } from "../src/fixtures";

const T0 = 1760000000; // fixed clock so regenerated fixtures diff cleanly
const FAR_FUTURE = 1893456000; // 2030-01-01: demo consents never expire mid-demo
const CHAIN_ID = 31337;
const VERIFYING_CONTRACT = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
const EXPLORER = "https://amoy.polygonscan.com";
const NOTICE_VERSION = 1;

const tx = (label: string) => keccakUtf8(`tx:${label}`);
const outDir = resolve(dirname(fileURLToPath(import.meta.url)), "../fixtures");
mkdirSync(outDir, { recursive: true });
const write = (name: string, data: unknown) =>
  writeFileSync(resolve(outDir, name), JSON.stringify(data, null, 2) + "\n");

// --- directory ---
const directory: DirectoryFile = {
  chainId: CHAIN_ID,
  verifyingContract: VERIFYING_CONTRACT,
  noticeVersion: NOTICE_VERSION,
  demoPrincipal: DEMO_PRINCIPAL,
  fiduciaries: SEED_FIDUCIARIES.map((f) => {
    const purposes = f.purposes.map((p) => ({ id: purposeIdOf(f.address, p.code), ...p }));
    const idOf = (code: string) => purposes.find((p) => p.code === code)!.id;
    return {
      slug: f.slug,
      name: f.name,
      sector: f.sector,
      color: f.color,
      address: f.address,
      purposes,
      processors: f.processors.map((p) => ({
        name: p.name,
        address: p.address,
        purposeId: idOf(p.purposeCode),
      })),
    };
  }),
};
write("directory.json", directory);

const fid = (slug: string) => directory.fiduciaries.find((f) => f.slug === slug)!;
const pid = (slug: string, code: string) => fid(slug).purposes.find((p) => p.code === code)!.id;

// --- consent states for the demo principal ---
interface Seeded {
  slug: string;
  code: string;
  status: Status;
  at: number;
}
const seeded: Seeded[] = [
  { slug: "quickloan", code: "credit_check", status: "Active", at: T0 + 100 },
  { slug: "quickloan", code: "marketing", status: "Withdrawn", at: T0 + 400 },
  { slug: "quickloan", code: "bureau_share", status: "Active", at: T0 + 110 },
  { slug: "medicare", code: "treatment", status: "Active", at: T0 + 120 },
  { slug: "medicare", code: "insurance_claim", status: "Withdrawn", at: T0 + 420 },
  { slug: "foodrush", code: "delivery", status: "Active", at: T0 + 130 },
  { slug: "foodrush", code: "ad_targeting", status: "Active", at: T0 + 140 },
];

const consentViews = (slug: string): ConsentView[] =>
  seeded
    .filter((s) => s.slug === slug)
    .map((s) => {
      const purpose = fid(slug).purposes.find((p) => p.code === s.code)!;
      const grantedAt = T0 + 100 + seeded.indexOf(s) * 10;
      return {
        purposeId: purpose.id,
        code: s.code,
        title: purpose.title,
        status: s.status,
        grantedAt,
        expiresAt: FAR_FUTURE,
        updatedAt: s.at,
        noticeHash: keccakUtf8(`notice:${slug}:${s.code}`),
        lastTx: tx(`${s.status}:${slug}:${s.code}`),
        required: purpose.required,
      };
    });

const consents: Omit<PrincipalConsentsResponse, "nonce" | "domain"> = {
  principal: DEMO_PRINCIPAL,
  fiduciaries: directory.fiduciaries.map(
    (f): FiduciaryConsents => ({
      fiduciary: { address: f.address, name: f.name, sector: f.sector, color: f.color },
      consents: consentViews(f.slug),
    }),
  ),
};
write("consents.json", consents);

// --- access logs, hash-chained, with one anchored batch each ---
type Spec = [code: string, decision: Decision, reason: AccessLogEntry["reason"], endpoint: string];
const specs: Record<string, Spec[]> = {
  quickloan: [
    ["credit_check", "ALLOWED", "OK", "GET /customers/:id/credit-profile"],
    ["credit_check", "ALLOWED", "OK", "GET /customers/:id/credit-profile"],
    ["marketing", "ALLOWED", "OK", "GET /customers/:id/credit-profile"],
    ["marketing", "BLOCKED", "CONSENT_WITHDRAWN", "GET /customers/:id/credit-profile"],
    ["credit_check", "ALLOWED", "OK", "GET /customers/:id/credit-profile"],
    ["marketing", "BLOCKED", "CONSENT_WITHDRAWN", "GET /customers/:id/credit-profile"],
  ],
  medicare: [
    ["treatment", "ALLOWED", "OK", "GET /patients/:id/records"],
    ["insurance_claim", "ALLOWED", "OK", "GET /patients/:id/records"],
    ["insurance_claim", "BLOCKED", "CONSENT_WITHDRAWN", "GET /patients/:id/records"],
    ["treatment", "ALLOWED", "OK", "GET /patients/:id/records"],
  ],
  foodrush: [
    ["delivery", "ALLOWED", "OK", "GET /customers/:id/profile"],
    ["delivery", "ALLOWED", "OK", "GET /customers/:id/profile"],
    ["ad_targeting", "ALLOWED", "OK", "GET /customers/:id/profile"],
    ["delivery", "ALLOWED", "OK", "GET /customers/:id/profile"],
  ],
};
const UNANCHORED_TAIL = { quickloan: 1 } as Record<string, number>; // newest QuickLoan entry is still pending

const access: Record<string, StoredAccessLogEntry[]> = {};
const anchors: Record<string, AnchorBatchView[]> = {};

for (const f of directory.fiduciaries) {
  const rows: StoredAccessLogEntry[] = [];
  let prev: string | null = null;
  specs[f.slug]!.forEach(([code, decision, reason, endpoint], i) => {
    const entry: AccessLogEntry = {
      at: T0 + 200 + i * 60,
      decision,
      endpoint,
      fiduciary: f.address,
      id: `00000000-0000-4000-8000-${f.slug.length}${String(i + 1).padStart(11, "0")}`,
      latencyMs: 8 + ((i * 7) % 15),
      principal: DEMO_PRINCIPAL,
      purposeCode: code,
      reason,
      seq: i + 1,
    };
    const chained = chainEntry(prev, entry);
    prev = chained.hash;
    rows.push({ ...entry, prevHash: chained.prevHash, hash: chained.hash, batchIndex: null });
  });
  const anchoredCount = rows.length - (UNANCHORED_TAIL[f.slug] ?? 0);
  const batch = rows.slice(0, anchoredCount);
  batch.forEach((r) => (r.batchIndex = 0));
  access[f.address] = rows;
  anchors[f.address] = [
    {
      index: 0,
      merkleRoot: merkleRoot(batch.map((r) => r.hash)),
      fromSeq: 1,
      toSeq: anchoredCount,
      count: anchoredCount,
      txHash: tx(`anchor:${f.slug}:0`),
      at: T0 + 200 + anchoredCount * 60 + 10,
    },
  ];
}
write("access.json", access);
write("anchors.json", anchors);

// --- ledger explorer events ---
let block = 10;
let head = ZERO_HASH;
const events: Omit<LedgerEventView, "id" | "explorerUrl">[] = [];
const push = (e: Omit<LedgerEventView, "id" | "explorerUrl" | "blockNumber" | "ledgerHead"> & { ledgerHead?: boolean }) => {
  if (e.ledgerHead) head = keccakUtf8(`${head}:${e.txHash}`);
  const { ledgerHead, ...rest } = e;
  events.push({ ...rest, blockNumber: block++, ledgerHead: ledgerHead ? head : null });
};

for (const f of directory.fiduciaries) {
  for (const p of f.purposes) {
    push({ type: "purpose", principal: null, fiduciary: f.address, purposeId: p.id, txHash: tx(`purpose:${p.id}`), at: T0 + 10, payload: { code: p.code }, ledgerHead: true });
  }
}
for (const s of [...seeded].sort((a, b) => a.at - b.at)) {
  const f = fid(s.slug);
  const view = consentViews(s.slug).find((c) => c.code === s.code)!;
  if (s.status === "Withdrawn") {
    push({ type: "granted", principal: DEMO_PRINCIPAL, fiduciary: f.address, purposeId: view.purposeId, txHash: tx(`Active:${s.slug}:${s.code}`), at: view.grantedAt!, payload: { expiresAt: FAR_FUTURE, noticeHash: view.noticeHash }, ledgerHead: true });
  }
}
for (const s of seeded.filter((x) => x.status === "Active")) {
  const view = consentViews(s.slug).find((c) => c.code === s.code)!;
  push({ type: "granted", principal: DEMO_PRINCIPAL, fiduciary: fid(s.slug).address, purposeId: view.purposeId, txHash: view.lastTx!, at: view.grantedAt!, payload: { expiresAt: FAR_FUTURE, noticeHash: view.noticeHash }, ledgerHead: true });
}
for (const s of seeded.filter((x) => x.status === "Withdrawn")) {
  const view = consentViews(s.slug).find((c) => c.code === s.code)!;
  push({ type: "withdrawn", principal: DEMO_PRINCIPAL, fiduciary: fid(s.slug).address, purposeId: view.purposeId, txHash: view.lastTx!, at: s.at, payload: null, ledgerHead: true });
}
for (const f of directory.fiduciaries) {
  const b = anchors[f.address]![0]!;
  push({ type: "anchor", principal: null, fiduciary: f.address, purposeId: null, txHash: b.txHash, at: b.at, payload: { merkleRoot: b.merkleRoot, fromSeq: b.fromSeq, toSeq: b.toSeq, count: b.count } });
}
write(
  "ledger.json",
  events.map((e, i) => ({ id: i + 1, ...e, explorerUrl: `${EXPLORER}/tx/${e.txHash}` })),
);

// --- cascade acks for the withdrawn purposes ---
const cascade: Record<string, CascadeItem[]> = {};
for (const s of seeded.filter((x) => x.status === "Withdrawn")) {
  const f = fid(s.slug);
  const purposeId = pid(s.slug, s.code);
  cascade[`${DEMO_PRINCIPAL}|${purposeId}`] = f.processors
    .filter((p) => p.purposeId === purposeId)
    .map((p) => ({
      processor: p.address,
      name: p.name,
      notifiedAt: s.at + 1,
      ackedAt: s.at + 3,
      txHash: tx(`ack:${p.name}`),
    }));
}
write("cascade.json", cascade);

console.log("fixtures written to", outDir);
