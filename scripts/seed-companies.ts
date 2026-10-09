import { TEST_COMPANIES } from "@sammati/test-fixtures";

const CORE = "http://localhost:4000";
const REGULATOR_HEADERS = { "x-sammati-regulator-key": "demo-regulator-key" };

async function run() {
  const [quickLoan, medicare] = TEST_COMPANIES;
  
  for (const company of [quickLoan, medicare]) {
    console.log(`Registering ${company.name}...`);
    const input = {
      name: company.name,
      sector: company.sector,
      contactEmail: `ops@${company.slug}.test`,
      password: "demo-password",
      purposes: company.purposes.map((p) => ({
        code: p.code,
        title: p.title,
        description: p.description,
        dataCategories: p.dataCategories,
        retentionDays: p.retentionDays,
        sharesThirdParty: p.sharesThirdParty,
        required: p.required,
      })),
      processors: company.processors.map((p) => ({ name: p.name, purposeCode: p.purposeCode })),
    };

    const sentRes = await fetch(`${CORE}/v1/registrations`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input)
    });
    
    if (!sentRes.ok) {
        console.error(`Failed to register ${company.name}:`, await sentRes.text());
        continue;
    }
    
    const sent = await sentRes.json();
    console.log(`Approval pending for ${company.name} (App ID: ${sent.applicationId})...`);

    const approveRes = await fetch(`${CORE}/v1/regulator/registrations/${sent.applicationId}/approve`, {
      method: "POST",
      headers: { "content-type": "application/json", ...REGULATOR_HEADERS },
      body: JSON.stringify({ note: "demo seeded", sandbox: false })
    });
    
    if (!approveRes.ok) {
        console.error(`Failed to approve ${company.name}:`, await approveRes.text());
        continue;
    }
    
    const statusRes = await fetch(`${CORE}/v1/registrations/${sent.applicationId}`);
    const status = await statusRes.json();
    console.log(`${company.name} Approved! API Key: ${status.result.apiKey}`);
    console.log(`Fiduciary Key: ${status.result.application.fiduciary}\n`);
  }
}

run().catch(console.error);
