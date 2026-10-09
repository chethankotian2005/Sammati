import react from "@vitejs/plugin-react";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

export default defineConfig(({ command, mode }) => {
  // A hosted build with no Core address would ship a site that calls localhost: refuse to build it (trd.md §10.2).
  if (command === "build" && mode === "production") {
    const core = loadEnv(mode, process.cwd(), "VITE_").VITE_CORE_URL;
    if (!core || !/^https:\/\//.test(core)) throw new Error("VITE_CORE_URL must be set to Core's public https:// URL for a production build");
  }
  return {
  plugins: [react()],
  // host: true so the console and Auditor are reachable from other devices on the local network.
  server: { port: 5173, strictPort: true, host: true },
  test: { environment: "jsdom" },
  };
});
