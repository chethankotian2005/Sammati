import assert from "node:assert";

const DEMO_PRINCIPAL = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const UNCONSENTED_PRINCIPAL = "0x0000000000000000000000000000000000000001";

const COMPANIES = [
  {
    name: "QuickLoan",
    port: 4101,
    purpose: "credit_check",
    path: "/customers/4821/credit-profile",
    method: "GET",
    verifyPayload: (p) => {
      assert.equal(p.pan, "ABCDE1234F");
      assert.equal(p.score, 742);
      assert.equal(p.incomeBand, "6-9 LPA");
    },
  },
  {
    name: "QuickLoan (marketing)",
    port: 4101,
    purpose: "marketing",
    path: "/marketing/campaign/sms",
    method: "POST",
    expectedStatus: 451,
    verifyPayload: (p) => {
      assert.equal(p.code, "CONSENT_WITHDRAWN");
      assert.match(p.message, /withdrew consent/i);
    },
  },
  {
    name: "QuickLoan (bureau)",
    port: 4101,
    purpose: "bureau_share",
    path: "/bureau/sync",
    method: "POST",
    verifyPayload: (p) => {
      assert.equal(p.bureau, "CreditBureauX");
      assert.equal(p.batchId, "CBX-2026-8921");
    },
  },
  {
    name: "MediCare+",
    port: 4102,
    purpose: "treatment",
    path: "/patients/4821/records",
    method: "GET",
    verifyPayload: (p) => {
      assert.equal(p.bloodGroup, "B+");
      assert.equal(p.diagnosis, "Hypertension (managed)");
    },
  },
  {
    name: "MediCare+ (claims)",
    port: 4102,
    purpose: "insurance_claim",
    path: "/claims/file",
    method: "POST",
    expectedStatus: 451,
    verifyPayload: (p) => {
      assert.equal(p.code, "CONSENT_WITHDRAWN");
      assert.match(p.message, /withdrew consent/i);
    },
  },
  {
    name: "MediCare+ (research)",
    port: 4102,
    purpose: "research",
    path: "/research/export",
    method: "POST",
    expectedStatus: 451,
    verifyPayload: (p) => {
      assert.equal(p.code, "NO_CONSENT");
      assert.match(p.message, /not given consent/i);
    },
  },
  {
    name: "FoodRush",
    port: 4103,
    purpose: "delivery",
    path: "/customers/4821/profile",
    method: "GET",
    expectedStatus: 200,
    verifyPayload: (p) => {
      assert.equal(p.homeArea, "Indiranagar");
      assert.equal(p.lastOrders, 14);
      assert.equal(p.activeOrder.rider, "Ramesh K.");
    },
  },
  {
    name: "FoodRush (ads)",
    port: 4103,
    purpose: "ad_targeting",
    path: "/ads/recommendations",
    method: "POST",
    expectedStatus: 200,
    verifyPayload: (p) => {
      assert.equal(p.partner, "AdNetworkZ");
      assert.equal(p.discountCode, "WEEKEND50");
    },
  },
  {
    name: "FoodRush (partner)",
    port: 4103,
    purpose: "partner_share",
    path: "/orders/partner-dispatch",
    method: "POST",
    expectedStatus: 451,
    verifyPayload: (p) => {
      assert.equal(p.code, "NO_CONSENT");
      assert.match(p.message, /not given consent/i);
    },
  },
];

async function run() {
  console.log("=== 1. Health checks on all 3 company backends ===");
  for (const port of [4101, 4102, 4103]) {
    const res = await fetch(`http://localhost:${port}/health`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.ok, true);
    console.log(`   ✓ Port ${port} (${data.company}) is healthy`);
  }

  console.log("\n=== 2. Guarded endpoints with consented principal ===");
  for (const c of COMPANIES) {
    const url = `http://localhost:${c.port}${c.path}`;
    const res = await fetch(url, {
      method: c.method,
      headers: {
        "Content-Type": "application/json",
        "x-sammati-principal": DEMO_PRINCIPAL,
      },
      body: c.method === "POST" ? JSON.stringify({ principal: DEMO_PRINCIPAL }) : undefined,
    });

    const expected = c.expectedStatus ?? 200;
    assert.equal(res.status, expected, `Expected ${expected} for ${c.name} at ${c.path}, got ${res.status}`);
    const data = await res.json();
    c.verifyPayload(data);
    console.log(`   ✓ ${c.name} [${c.method} ${c.path}]: HTTP ${expected} ${expected === 200 ? "ALLOWED" : "BLOCKED"} (${expected === 200 ? "realistic payload" : data.code})`);
  }

  console.log("\n=== 3. Fail-closed check: No principal header -> HTTP 451 ===");
  const noPrincipalRes = await fetch("http://localhost:4101/customers/4821/credit-profile");
  assert.equal(noPrincipalRes.status, 451);
  const noPrincipalData = await noPrincipalRes.json();
  assert.equal(noPrincipalData.code, "NO_PRINCIPAL");
  console.log(`   ✓ QuickLoan without principal: HTTP 451 (${noPrincipalData.code})`);

  console.log("\n=== 4. Fail-closed check: Unconsented principal -> HTTP 451 ===");
  const unconsentedRes = await fetch("http://localhost:4101/customers/4821/credit-profile", {
    headers: { "x-sammati-principal": UNCONSENTED_PRINCIPAL },
  });
  assert.equal(unconsentedRes.status, 451);
  const unconsentedData = await unconsentedRes.json();
  assert(unconsentedData.code === "NO_CONSENT" || unconsentedData.code === "CONSENT_WITHDRAWN");
  console.log(`   ✓ QuickLoan with unconsented principal: HTTP 451 (${unconsentedData.code})`);

  console.log("\nALL GUARDED ENDPOINTS & FAIL-CLOSED CHECKS PASSED! 🎉");
}

run().catch((err) => {
  console.error("FAIL:", err);
  process.exit(1);
});
