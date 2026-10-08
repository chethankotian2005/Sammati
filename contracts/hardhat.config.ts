import "@nomicfoundation/hardhat-ethers";
import "@nomicfoundation/hardhat-chai-matchers";
import { resolve } from "node:path";
import type { HardhatUserConfig } from "hardhat/config";
import { amoyNetwork } from "./networks";

// The repo-root .env holds DEPLOYER_KEY and AMOY_RPC_URL; real environment variables win over it.
try {
  process.loadEnvFile(resolve(__dirname, "../.env"));
} catch {
  // no .env: the local chain needs nothing
}

// The EIP-712 vectors in shared/test-vectors were signed with deadlines around
// 2025-10-09, so `hardhat test` starts its chain clock just before that. The demo node
// (`hardhat node`) keeps real time: Core and the contract must agree on "now".
const isTestRun = process.argv.includes("test");

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: { optimizer: { enabled: true, runs: 200 } },
  },
  paths: { sources: "./src" },
  networks: {
    // allowBlocksWithSameTimestamp: by default a block's timestamp must exceed its parent's, so a burst of
    // transactions (the seed mines ~20 blocks in a few seconds) pushes chain time ahead of the wall clock.
    // The Auditor compares ledger time with the gateway's wall-clock log entries, so the demo chain must
    // keep real time. (Real networks like Polygon Amoy already do.)
    hardhat: { chainId: 31337, allowBlocksWithSameTimestamp: true, ...(isTestRun ? { initialDate: "2025-10-09T00:00:00Z" } : {}) },
    // Public proof deployment (trd.md §10): `pnpm deploy:amoy`.
    amoy: amoyNetwork(process.env),
  },
};

export default config;
