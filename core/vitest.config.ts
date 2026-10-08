import { defineConfig } from "vitest/config";

export default defineConfig({
  // Real-mode tests start a Hardhat node, which takes a few seconds.
  test: { testTimeout: 30_000, hookTimeout: 90_000 },
});
