import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { closeServer, listen, shutdownOnSignal } from "@sammati/shared/src/server";
import { createBootApp, createRealApp } from "./app";
import { loadDotEnv, readConfig } from "./config";
import { createRealCore, type RealCore } from "./real/core";
import { WsHub } from "./ws";

function fatal(err: unknown): never {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}

loadDotEnv();
const config = (() => {
  try {
    return readConfig();
  } catch (err) {
    return fatal(err);
  }
})();

// Listen first: the platform's health check (/healthz) must be answered while the database opens and the chain is
// found, and every other route says 503 STARTING until Core is ready (trd.md §10.3, §10.5).
const server = createServer();
const hub = new WsHub(server, config.corsOrigins);
let serving: (req: IncomingMessage, res: ServerResponse) => void = createBootApp(config);
server.on("request", (req, res) => serving(req, res));

let core: RealCore | null = null;
shutdownOnSignal(async () => {
  await hub.close();
  await closeServer(server);
  core?.stop();
});

await listen(server, config.port, config.host);
console.log(`Sammati Core listening on ${config.host}:${config.port}`);

try {
  core = await createRealCore(config, (e) => hub.publish(e));
} catch (err) {
  fatal(err);
}
serving = createRealApp(core);
core.start();
console.log(`Relayer ${core.relayer.address}, registry ${core.chain.deployment.consentRegistry}, db ${config.dbPath}`);
console.log(`QR payloads point wallets at ${config.publicUrl}`);
if (!config.production && /\/\/(localhost|127\.)/.test(config.publicUrl)) {
  console.warn("WARNING: that address is this laptop's own. A phone cannot reach it: set PUBLIC_CORE_URL to the laptop's LAN address (`pnpm demo:up` does this for you).");
}
