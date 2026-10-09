import { createServer } from "node:http";
import { closeServer, listen, shutdownOnSignal } from "@sammati/shared/src/server";
import { createApp } from "./app";
import { readConfig } from "./config";
import { ChainConsentReader } from "./consent";
import { Enclave } from "./enclave";
import { CoreEventSink, SdkAccessLogger, WebhookNotifier, watchConsent } from "./io";
import { ProcessorService } from "./service";
import { Vault } from "./vault";

try {
  process.loadEnvFile(new URL("../../.env", import.meta.url));
} catch {
  // no .env
}

// Whatever goes wrong, the process may print the kind of failure but never its message: a message can quote data.
process.on("uncaughtException", (err) => {
  console.error(`[processor] fatal (${err.name})`);
  process.exit(1);
});
process.on("unhandledRejection", (reason) => {
  console.error(`[processor] unhandled rejection (${reason instanceof Error ? reason.name : "unknown"})`);
});

// A missing setting in production is a message the operator must read, so this one failure prints its text. It names
// variables, never values.
const config = (() => {
  try {
    return readConfig();
  } catch (err) {
    console.error(err instanceof Error ? err.message : "invalid configuration");
    return process.exit(1);
  }
})();

const vault = new Vault(config.dbPath);
const enclave = new Enclave(config.privateKey);
const consent = new ChainConsentReader(config);
const logger = new SdkAccessLogger(config);
const service = new ProcessorService(config, vault, enclave, consent, new CoreEventSink(config), new WebhookNotifier(config), logger);

const app = createApp(service, config, console.log, async () => {
  try {
    vault.ping();
  } catch {
    throw new Error("the vault did not answer");
  }
  await consent.ping();
});
const server = createServer(app);
await listen(server, config.port, config.host);
console.log(`Sammati Processor (simulated enclave) listening on ${config.host}:${config.port}`);
console.log(`public key ${enclave.publicKey}${config.privateKey ? " (from PROCESSOR_KEY)" : " (generated at start; lost on restart)"}`);

const stopWatching = watchConsent(config, service);
const sweep = setInterval(() => void service.sweep().catch(() => {}), config.sweepMs);

shutdownOnSignal(async () => {
  clearInterval(sweep);
  stopWatching();
  await closeServer(server);
  await logger.flush();
  logger.close();
  vault.close();
});
