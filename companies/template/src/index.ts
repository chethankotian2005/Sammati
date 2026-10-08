/**
 * A reusable company site (companies/template): the same small app for any company that registered through /join.
 * It integrates only through the gateway SDK. Brand and copy come from a site file (SITE=companies/template/sites/x.json),
 * identity from the registration (FIDUCIARY, SAMMATI_API_KEY). It holds no customer data and no payloads.
 */
import { readFileSync } from "node:fs";
import express, { type Request, type Response } from "express";
import { sammati } from "@sammati/gateway";

interface Site {
  name: string;
  sector: string;
  color: string;
  tagline: string;
  port: number;
  purposes: Array<{ code: string; title: { en: string }; description: { en: string }; required: boolean; sharesThirdParty: boolean }>;
}

function required(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) {
    console.error(`${name} is required.`);
    process.exit(1);
  }
  return v;
}
const site = JSON.parse(readFileSync(required("SITE"), "utf8")) as Site;
const fiduciary = required("FIDUCIARY");
const port = Number(process.env.PORT ?? site.port);
const gate = sammati({ coreUrl: process.env.CORE_URL ?? "http://localhost:4000", fiduciary, apiKey: required("SAMMATI_API_KEY") });
const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

const principalFrom = (req: Request): string | undefined => req.header("x-sammati-principal") ?? (req.query.principal as string | undefined);

const app = express();
app.get("/health", (_req, res) => void res.json({ ok: true, fiduciary }));

// Every registered purpose is guarded the same way: the SDK asks the ledger first, answers 451 with a reason, and logs.
for (const p of site.purposes) {
  app.get(`/api/${p.code}`, (req: Request, res: Response) => {
    gate.requireConsent({ purpose: p.code, principalFrom })(req, res, () => void res.json({ ok: true, purpose: p.code }));
  });
}

app.get("/", (_req, res) => {
  const items = site.purposes
    .map((p) => `<li><strong>${esc(p.title.en)}</strong>${p.required ? '<span class="t">needed</span>' : '<span class="t">optional</span>'}${p.sharesThirdParty ? '<span class="t">shared with third parties</span>' : ""}<br>${esc(p.description.en)}</li>`)
    .join("");
  res.type("html").send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(site.name)}</title>
<style>body{margin:0;font:16px/1.55 system-ui,sans-serif;color:#1b1f2a}header{background:${esc(site.color)};color:#fff;padding:48px 20px}main,header>div{max-width:760px;margin:0 auto}
h1{margin:0 0 8px;font-size:36px}li{margin:12px 0}.t{font-size:13px;font-weight:700;border-radius:999px;padding:2px 10px;background:#eef;margin-left:6px}footer{padding:24px 20px;color:#5b6783;font-size:14px;text-align:center}</style></head>
<body><header><div><h1>${esc(site.name)}</h1><p>${esc(site.tagline)}</p></div></header>
<main><h2>How we use your information</h2><p>We ask for your consent separately for each purpose, through Sammati, and you can withdraw any of them at any time.</p><ul>${items}</ul></main>
<footer>${esc(site.name)} · ${esc(site.sector)} · Consent by Sammati</footer></body></html>`);
});

app.listen(port, () => console.log(`[${site.name}] http://localhost:${port} (company ${fiduciary})`));
