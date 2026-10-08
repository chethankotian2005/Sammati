import { createServer } from "node:http";
import { createApp } from "./app";
import { loadDotEnv, readConfig } from "./config";
import { StubStore } from "./store";
import { startStubEmitter } from "./stub-events";
import { WsHub } from "./ws";

loadDotEnv();
const config = readConfig();

if (!config.stubMode) {
  console.error("STUB_MODE=false: the real Core (chain, relayer, indexer) is not built yet. Set STUB_MODE=true.");
  process.exit(1);
}

const store = new StubStore(config);
const server = createServer();
const hub = new WsHub(server);
server.on("request", createApp({ store, config, publish: (e) => hub.publish(e) }));
startStubEmitter(hub, store);

server.listen(config.port, () => {
  console.log(`Sammati Core (stub) on http://localhost:${config.port}  ws://localhost:${config.port}/ws`);
  console.log(`QR payloads point wallets at ${config.publicUrl}`);
});
