import assert from "node:assert";

const BASE = "http://localhost:4000";
const FID = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"; // QuickLoan
const PRINCIPAL = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

async function run() {
  console.log("1. Health check...");
  const hRes = await fetch(`${BASE}/v1/health`);
  const health = await hRes.json();
  assert.equal(health.ok, true);
  console.log("   ✓ Health:", health);

  console.log("2. Fetch purposes (C-01)...");
  const pRes = await fetch(`${BASE}/v1/fiduciaries/${FID}/purposes`);
  const pData = await pRes.json();
  assert(pData.purposes.length >= 3);
  console.log(`   ✓ Found ${pData.purposes.length} purposes for QuickLoan`);

  console.log("3. Create consent request (C-02)...");
  const rRes = await fetch(`${BASE}/v1/fiduciaries/${FID}/requests`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      purposes: ["credit_check", "marketing"],
      customerAlias: "Customer #4821",
    }),
  });
  const rData = await rRes.json();
  assert(rData.requestId, "Missing requestId");
  assert(rData.qrPayload, "Missing qrPayload");
  assert.equal(rData.qrPayload.v, 1);
  console.log("   ✓ QR request generated:", rData.requestId);

  console.log("4. Fetch consents (C-07)...");
  const cRes = await fetch(`${BASE}/v1/fiduciaries/${FID}/consents`);
  const cData = await cRes.json();
  console.log(`   ✓ Found ${cData.rows.length} consent rows`);

  console.log("5. Fire simulator request (C-04, C-05)...");
  const fRes = await fetch(`${BASE}/v1/demo/fire`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fiduciary: FID,
      purposeCode: "credit_check",
      principal: PRINCIPAL,
      endpoint: "GET /customers/4821/credit-profile",
    }),
  });
  const fData = await fRes.json();
  assert(fData.decision, "Missing decision");
  console.log(`   ✓ Simulator decision: ${fData.decision} (${fData.reason})`);

  console.log("6. Fetch access logs (C-04)...");
  const aRes = await fetch(`${BASE}/v1/fiduciaries/${FID}/access?limit=5`);
  const aData = await aRes.json();
  assert(aData.items.length > 0);
  console.log(`   ✓ Access logs retrieved: ${aData.items.length} recent entries`);

  console.log("7. Export compliance pack (C-08)...");
  const expRes = await fetch(`${BASE}/v1/fiduciaries/${FID}/export`, {
    method: "POST",
  });
  const expData = await expRes.json();
  assert(expData.ledgerHead, "Missing ledgerHead");
  console.log(`   ✓ Compliance pack generated with ledgerHead ${expData.ledgerHead.slice(0, 10)}...`);

  console.log("\nALL CONSOLE FLOW APIS PASSED! 🎉");
}

run().catch((err) => {
  console.error("FAIL:", err);
  process.exit(1);
});
