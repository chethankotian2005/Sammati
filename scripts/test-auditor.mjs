import assert from "node:assert";

const BASE = "http://localhost:4000";
const FID = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"; // QuickLoan

async function testAuditor() {
  console.log("=== Testing Sammati Auditor (A-01..A-04) ===");

  // 0. Ensure clean state first
  console.log("\n0. Resetting demo store...");
  const resetRes = await fetch(`${BASE}/v1/demo/reset`, { method: "POST" });
  assert.equal(resetRes.status, 200);
  console.log("   ✓ Reset ok");

  // 1. A-01: Company scorecards
  console.log("\n1. Testing Scorecards (A-01): GET /v1/audit/fiduciaries");
  const fRes = await fetch(`${BASE}/v1/audit/fiduciaries`);
  assert.equal(fRes.status, 200);
  const fData = await fRes.json();
  assert(Array.isArray(fData.fiduciaries), "fiduciaries must be array");
  assert.equal(fData.fiduciaries.length, 3, "Expected 3 companies");
  const quickloan = fData.fiduciaries.find((f) => f.fiduciary.toLowerCase() === FID.toLowerCase());
  assert(quickloan, "QuickLoan must be in scorecards");
  assert(typeof quickloan.activeConsents === "number", "activeConsents count");
  assert(typeof quickloan.withdrawnConsents === "number", "withdrawnConsents count");
  assert(typeof quickloan.allowed === "number", "allowed count");
  assert(typeof quickloan.blocked === "number", "blocked count");
  assert(typeof quickloan.anchoredBatches === "number", "anchoredBatches count");
  assert(typeof quickloan.violations === "number", "violations count");
  assert.equal(quickloan.integrity, "unverified");
  console.log("   ✓ QuickLoan scorecard:", {
    name: quickloan.name,
    activeConsents: quickloan.activeConsents,
    withdrawnConsents: quickloan.withdrawnConsents,
    allowed: quickloan.allowed,
    blocked: quickloan.blocked,
    anchoredBatches: quickloan.anchoredBatches,
    integrity: quickloan.integrity,
  });

  // 2. A-02: Ledger explorer
  console.log("\n2. Testing Ledger Explorer (A-02): GET /v1/audit/ledger");
  const lRes = await fetch(`${BASE}/v1/audit/ledger?fid=${FID}`);
  assert.equal(lRes.status, 200);
  const lData = await lRes.json();
  assert(Array.isArray(lData.events), "events must be array");
  assert(lData.events.length > 0, "must have ledger events");
  console.log(`   ✓ Retrieved ${lData.events.length} ledger events for QuickLoan`);
  const firstEv = lData.events[0];
  assert(firstEv.type, "event type");
  assert(firstEv.txHash, "event txHash");
  console.log("   ✓ Sample event:", {
    type: firstEv.type,
    tx: firstEv.txHash.slice(0, 10) + "…",
    head: firstEv.ledgerHead ? firstEv.ledgerHead.slice(0, 10) + "…" : "genesis",
  });

  // 3. A-03: Verify integrity on CLEAN data
  console.log("\n3. Testing Verify Integrity on Clean Data (A-03): POST /v1/audit/verify/:fid");
  const vCleanRes = await fetch(`${BASE}/v1/audit/verify/${FID}`, { method: "POST" });
  assert.equal(vCleanRes.status, 200);
  const vClean = await vCleanRes.json();
  console.log("   ✓ Clean verify result:", {
    ok: vClean.ok,
    chainOk: vClean.chainOk,
    batchesCount: vClean.batches.length,
    allBatchesOk: vClean.batches.every((b) => b.ok),
  });
  assert.equal(vClean.ok, true, "Clean data must verify OK");
  assert.equal(vClean.chainOk, true, "Hash chain must be OK");
  assert(vClean.batches.length > 0, "Should have verified batches");
  assert(vClean.batches.every((b) => b.ok), "All batches must be ok on clean data");

  // 4. A-04: Report Generation
  console.log("\n4. Testing Audit Report (A-04): GET /v1/audit/report/:fid");
  const repRes = await fetch(`${BASE}/v1/audit/report/${FID}`);
  assert.equal(repRes.status, 200);
  const repData = await repRes.json();
  assert(repData.scorecard, "scorecard present");
  assert.equal(repData.fiduciary.toLowerCase(), FID.toLowerCase());
  assert.equal(repData.scorecard.name, "QuickLoan");
  assert.equal(repData.verification.ok, true);
  assert(Array.isArray(repData.recentEvents), "recentEvents present");
  console.log(`   ✓ Audit report generated with ${repData.recentEvents.length} recent events`);

  // 5. Presenter Shortcut / Tamper flow
  console.log("\n5. Testing Tamper Simulation: POST /v1/demo/tamper/:fid");
  const tRes = await fetch(`${BASE}/v1/demo/tamper/${FID}`, { method: "POST" });
  assert.equal(tRes.status, 200);
  const tData = await tRes.json();
  console.log("   ✓ Tamper executed on record seq #", tData.seq, {
    before: tData.before,
    after: tData.after,
  });

  // 6. Verify integrity on TAMPERED data -> must pinpoint record
  console.log("\n6. Testing Verify Integrity on Tampered Data: POST /v1/audit/verify/:fid");
  const vTamperRes = await fetch(`${BASE}/v1/audit/verify/${FID}`, { method: "POST" });
  assert.equal(vTamperRes.status, 200);
  const vTamper = await vTamperRes.json();
  const badBatch = vTamper.batches.find((b) => !b.ok);
  console.log("   ✓ Tamper verify result:", {
    ok: vTamper.ok,
    chainOk: vTamper.chainOk,
    badBatch: badBatch ? {
      index: badBatch.index,
      firstBadSeq: badBatch.firstBadSeq,
      anchoredRoot: badBatch.anchoredRoot?.slice(0, 10) + "…",
      recomputedRoot: badBatch.recomputedRoot?.slice(0, 10) + "…",
    } : null,
  });
  assert.equal(vTamper.ok, false, "Tampered data must FAIL verification");
  assert(badBatch, "badBatch must be found in batches");
  assert.equal(badBatch.ok, false, "badBatch.ok must be false");
  assert.equal(badBatch.firstBadSeq, tData.seq, "Must pinpoint the exact tampered record seq!");
  console.log(`   🎯 HERO MOMENT: Tampered record #${badBatch.firstBadSeq} precisely pinpointed!`);

  // 7. Cleanup: Reset store to clean state
  console.log("\n7. Restoring clean state: POST /v1/demo/reset");
  await fetch(`${BASE}/v1/demo/reset`, { method: "POST" });
  const vRestoredRes = await fetch(`${BASE}/v1/audit/verify/${FID}`, { method: "POST" });
  const vRestored = await vRestoredRes.json();
  assert.equal(vRestored.ok, true, "Restored state must verify OK");
  console.log("   ✓ Post-reset verify passes cleanly!");

  console.log("\n✨ ALL AUDITOR CHECKS PASSED (A-01..A-04 + Tamper hero moment) ✨\n");
}

testAuditor().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
