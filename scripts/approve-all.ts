const CORE = "http://localhost:4000";
const REGULATOR_HEADERS = { "x-sammati-regulator-key": "demo-regulator-key" };

async function run() {
    const listRes = await fetch(`${CORE}/v1/regulator/registrations`, {
        headers: REGULATOR_HEADERS
    });
    if (!listRes.ok) {
        console.error("Failed to list", await listRes.text());
        return;
    }
    const list = await listRes.json();
    console.log(list);
    const apps = Array.isArray(list) ? list : (list.result || list.applications || []);
    for (const app of apps) {
        if (app.status === 'pending') {
            console.log(`Approving ${app.name} (${app.id})...`);
            const approveRes = await fetch(`${CORE}/v1/regulator/registrations/${app.id}/approve`, {
                method: "POST",
                headers: { "content-type": "application/json", ...REGULATOR_HEADERS },
                body: JSON.stringify({ note: "auto approved", sandbox: false })
            });
            if (!approveRes.ok) {
                console.error(`Failed to approve ${app.name}:`, await approveRes.text());
            } else {
                console.log(`${app.name} approved!`);
                const statusRes = await fetch(`${CORE}/v1/registrations/${app.id}`);
                const status = await statusRes.json();
                console.log(`API Key for ${app.name}:`, status.result?.apiKey);
            }
        }
    }
}
run().catch(console.error);
