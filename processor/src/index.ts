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

const config = readConfig();
const vault = new Vault(config.dbPath);
const enclave = new Enclave(config.privateKey);
const logger = new SdkAccessLogger(config);
const service = new ProcessorService(config, vault, enclave, new ChainConsentReader(config), new CoreEventSink(config), new WebhookNotifier(config), logger);

const server = createApp(service, config).listen(config.port, () => {
  console.log(`Sammati Processor (simulated enclave) on http://localhost:${config.port}`);
  console.log(`public key ${enclave.publicKey}${config.privateKey ? " (from PROCESSOR_KEY)" : " (generated at start; lost on restart)"}`);
});

const stopWatching = watchConsent(config, service);
const sweep = setInterval(() => void service.sweep().catch(() => {}), config.sweepMs);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    clearInterval(sweep);
    stopWatching();
    logger.close();
    server.close();
    vault.close();
    process.exit(0);
  });
}
