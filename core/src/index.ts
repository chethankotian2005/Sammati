import { createServer } from "node:http";
import { createApp, createRealApp } from "./app";
import { loadDotEnv, readConfig } from "./config";
import { createRealCore } from "./real/core";
import { StubStore } from "./store";
import { startStubEmitter } from "./stub-events";
import { WsHub } from "./ws";

loadDotEnv();
const config = readConfig();

const server = createServer();
const hub = new WsHub(server);
const publish = (e: Parameters<WsHub["publish"]>[0]) => hub.publish(e);

let shutdown = () => {};

if (config.stubMode) {
  const store = new StubStore(config);
  server.on("request", createApp({ store, config, publish }));
  startStubEmitter(hub, store);
} else {
  const core = await createRealCore(config, publish);
  server.on("request", createRealApp(core));
  core.start();
  shutdown = () => core.stop();
  console.log(`Real mode: relayer ${core.relayer.address}, registry ${core.chain.deployment.consentRegistry}, db ${config.dbPath}`);
}

server.listen(config.port, () => {
  console.log(`Sammati Core (${config.stubMode ? "stub" : "real"}) on http://localhost:${config.port}  ws://localhost:${config.port}/ws`);
  console.log(`QR payloads point wallets at ${config.publicUrl}`);
  if (/\/\/(localhost|127\.)/.test(config.publicUrl)) {
    console.warn("WARNING: that address is this laptop's own. A phone cannot reach it: set CORE_PUBLIC_URL to the laptop's LAN address (`pnpm demo:up` does this for you).");
  }
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    shutdown();
    process.exit(0);
  });
}
