import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  // host: true so the Stage view and Auditor are reachable from other devices on the demo network.
  server: { port: 5173, strictPort: true, host: true },
  test: { environment: "jsdom" },
});
