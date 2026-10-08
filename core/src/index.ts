import { createServer } from "node:http";
import { createRealApp } from "./app";
import { loadDotEnv, readConfig } from "./config";
import { createRealCore } from "./real/core";
import { WsHub } from "./ws";

loadDotEnv();
const config = readConfig();

const server = createServer();
const hub = new WsHub(server);
const core = await createRealCore(config, (e) => hub.publish(e));
server.on("request", createRealApp(core));
core.start();
console.log(`Relayer ${core.relayer.address}, registry ${core.chain.deployment.consentRegistry}, db ${config.dbPath}`);

server.listen(config.port, () => {
  console.log(`Sammati Core on http://localhost:${config.port}  ws://localhost:${config.port}/ws`);
  console.log(`QR payloads point wallets at ${config.publicUrl}`);
  if (/\/\/(localhost|127\.)/.test(config.publicUrl)) {
    console.warn("WARNING: that address is this laptop's own. A phone cannot reach it: set CORE_PUBLIC_URL to the laptop's LAN address (`pnpm demo:up` does this for you).");
  }
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    core.stop();
    process.exit(0);
  });
}
