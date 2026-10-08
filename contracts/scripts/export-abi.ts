// Writes the compiled ABIs to shared/abi/ for Core, the Auditor and tests.
// Tests fail when a committed file drifts from its contract.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { artifacts } from "hardhat";

const CONTRACTS = ["ConsentRegistry", "AccessAnchor"];

async function main() {
  for (const name of CONTRACTS) {
    const { abi } = await artifacts.readArtifact(name);
    const file = resolve(__dirname, `../../shared/abi/${name}.json`);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(abi, null, 2) + "\n");
    console.log(`wrote ${abi.length} ${name} ABI entries to ${file}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
