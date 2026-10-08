// The tiny sample app of docs/integration.md §2 (prd.md R-03): one guarded endpoint, written the way a company that
// joined through /join would write it. `pnpm --filter @sammati/core sample:company` runs it from the environment;
// `pnpm e2e` starts it from code. It is the same five lines the onboarding result page shows.
import type { AddressInfo } from "node:net";
import { pathToFileURL } from "node:url";
import express from "express";
import { sammati } from "@sammati/gateway";

export interface SampleOptions {
  coreUrl: string;
  /** Your fiduciary address, from the onboarding result page. */
  fiduciary: string;
  /** Your API key, shown once on the same page. */
  apiKey: string;
  /** A purpose code you registered. */
  purpose: string;
  port?: number;
}

export async function startSampleApp(o: SampleOptions): Promise<{ url: string; close(): Promise<void> }> {
  const gate = sammati({ coreUrl: o.coreUrl, fiduciary: o.fiduciary, apiKey: o.apiKey });

  const app = express();
  app.get(
    "/customers/:id/profile",
    gate.requireConsent({ purpose: o.purpose, principalFrom: (req) => req.header("x-sammati-principal") }),
    (_req, res) => res.json({ ok: true /* your data, released only when consent is valid */ }),
  );

  const server = app.listen(o.port ?? 0);
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    async close() {
      await gate.flush();
      gate.close();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

// Run directly: configuration comes from the environment, so no key is ever written in code.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const need = (name: string): string => {
    const v = process.env[name];
    if (!v) {
      console.error(`Set ${name} (see docs/integration.md §4).`);
      process.exit(1);
    }
    return v;
  };
  const app = await startSampleApp({
    coreUrl: process.env.CORE_URL ?? "http://localhost:4000",
    fiduciary: need("FIDUCIARY"),
    apiKey: need("SAMMATI_API_KEY"),
    purpose: need("PURPOSE"),
    port: Number(process.env.PORT ?? 4300),
  });
  console.log(`Sample company app on ${app.url}  (GET /customers/1/profile with x-sammati-principal)`);
}
