import type { HardhatUserConfig } from "hardhat/config";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: { optimizer: { enabled: true, runs: 200 } },
  },
  paths: { sources: "./src" },
  networks: {
    // Local demo chain: `pnpm --filter @sammati/contracts node` (trd.md §10).
    hardhat: { chainId: 31337 },
  },
};

export default config;
