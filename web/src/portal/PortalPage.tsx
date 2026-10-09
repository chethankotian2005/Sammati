/**
 * A company's customer page (C-09, ui.md §3.1): the company's own website, with Sammati's consent in the middle.
 * It has no field for a PAN or an income and no code that could show one: the sensitive fields are entered in the
 * Sammati app and reach only the Processor.
 */

import { createContext, useContext, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useParams } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import type { FiduciaryPurposesResponse } from "@sammati/shared";
import { CORE_URL } from "../core";
import { useDirectory } from "../directory";
import { HashLabel } from "../ui";
import { StatusChip } from "../ui/StatusChip";
import { formatInr } from "../ui/VaultPanel";
import type { JourneyState, PortalCompany } from "./journey";
import { makeBrowserDeps, useJourney, type JourneyView } from "./useJourney";

type Purpose = FiduciaryPurposesResponse["purposes"][number];
const PortalContext = createContext<{ company: PortalCompany; purposes: Purpose[] }>({ company: { address: "", name: "", loanPurpose: "credit_check", optionalPurposes: [] }, purposes: [] });
const usePortal = () => useContext(PortalContext);

const SENSITIVE_FIELDS = ["PAN", "Income", "Employment"] as const;

const card = "rounded-pass border border-line bg-surface p-6 shadow-sm";
const primary =
  "min-h-[48px] rounded-pill bg-ink px-6 text-lg font-extrabold text-paper disabled:opacity-40 focus:outline-none focus-visible:ring-4 focus-visible:ring-marigold";

function Live({ children }: { children: ReactNode }): ReactNode {
  return <div aria-live="polite">{children}</div>;
}

function Login({ view }: { view: JourneyView }): ReactNode {
  const [alias, setAlias] = useState("");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    view.journey.login(alias);
  };
  return (
    <form onSubmit={submit} className={`${card} space-y-4`} aria-labelledby="signin">
      <h2 id="signin" className="text-2xl font-extrabold">
        Sign in to apply
      </h2>
      <label className="block">
        <span className="text-base font-bold">Your customer ID</span>
        <input
          type="text"
          name="customer-name"
          autoComplete="off"
          value={alias}
          onChange={(e) => setAlias(e.target.value)}
          className="mt-2 w-full rounded-row border-2 border-line px-4 py-3 text-lg focus:border-ink focus:outline-none"
        />
      </label>
      {view.state.notice && (
        <p role="alert" className="font-bold text-block">
          ✕ {view.state.notice}
        </p>
      )}
      <button type="submit" className={primary}>
        Continue
      </button>
    </form>
  );
}

function Purposes({ view }: { view: JourneyView }): ReactNode {
  const { state, journey } = view;
  const { company, purposes } = usePortal();
  const purposeText = (code: string): string => purposes.find((p) => p.code === code)?.description.en ?? code;
  const locked = state.stage !== "form";
  return (
    <ul className="ml-8 space-y-3" aria-label={`What ${company.name} will use your data for`}>
      <li className="text-lg">{purposeText(company.loanPurpose)}</li>
      {company.optionalPurposes.map((code) => {
        const purpose = purposes.find((p) => p.code === code)!;
        return (
          <li key={code}>
            <label className="flex min-h-[48px] cursor-pointer items-center gap-3 text-lg">
              <input
                type="checkbox"
                className="h-6 w-6 accent-ink"
                checked={state.optional.includes(code)}
                disabled={locked}
                onChange={() => journey.toggleOptional(code)}
              />
              <span>
                {purpose.description.en}
                {purpose.sharesThirdParty && <span className="ml-2 rounded-pill bg-block/10 px-2 py-0.5 text-sm font-bold text-block">Shared with third parties</span>}
              </span>
            </label>
          </li>
        );
      })}
    </ul>
  );
}

function Progress({ view }: { view: JourneyView }): ReactNode {
  const { state } = view;
  switch (state.stage) {
    case "awaiting-scan":
      return (
        <div className="flex flex-col items-center gap-4 rounded-pass border border-line bg-paper p-5">
          <div className="rounded-pass border-2 border-line bg-white p-4 relative group">
            <QRCodeSVG id="portal-qr-svg" value={state.request?.qrPayload ?? ""} size={240} level="M" />
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-white/70">
              <button
                type="button"
                onClick={() => {
                  const svg = document.querySelector("#portal-qr-svg");
                  if (svg) {
                    const svgData = new XMLSerializer().serializeToString(svg);
                    const blob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
                    const url = URL.createObjectURL(blob);
                    const link = document.createElement("a");
                    link.href = url;
                    link.download = "sammati-qr.svg";
                    link.click();
                    URL.revokeObjectURL(url);
                  }
                }}
                className="bg-ink text-paper px-4 py-2 rounded-full font-bold shadow-lg text-sm"
              >
                Download QR
              </button>
            </div>
          </div>
          {import.meta.env.DEV && (
            <div className="w-full max-w-sm">
              <p className="text-xs text-mute font-bold mb-1">Developer payload (Copy this into the Wallet Web App):</p>
              <textarea 
                readOnly 
                className="w-full text-xs font-mono p-2 bg-gray-100 rounded border border-line" 
                rows={3} 
                value={state.request?.qrPayload ?? ""} 
                onClick={(e) => (e.target as HTMLTextAreaElement).select()}
              />
            </div>
          )}
          <p className="text-lg font-bold">Waiting for you to approve in the Sammati app...</p>
          <StatusChip variant={view.online ? "pending" : "unverified"} label={view.online ? "Waiting" : "Live status offline"} />
          <p className="text-sm text-mute">Untick the box to cancel.</p>
        </div>
      );
    case "consent-received":
    case "data-submitted":
    case "decided":
      return <Received state={state} />;
    case "withdrawn":
      return (
        <div role="alert" className="space-y-2 rounded-pass border-2 border-block/40 bg-block/10 p-5">
          <p className="flex items-center gap-2 text-xl font-extrabold text-block">
            <span aria-hidden="true">✕</span> Consent withdrawn. Application cannot be processed
          </p>
          {state.dataErased && <p className="text-lg">Your encrypted details were erased.</p>}
        </div>
      );
    default:
      return null;
  }
}

function Received({ state }: { state: JourneyState }): ReactNode {
  const submitted = state.stage !== "consent-received";
  return (
    <div className="space-y-4 rounded-pass border border-line bg-paper p-5">
      <div>
        <p className="flex items-center gap-2 text-xl font-extrabold text-allow">
          <span aria-hidden="true">✓</span> Consent received
        </p>
        <p className="mt-1 flex items-center gap-2 text-base text-mute">
          Recorded on the ledger {state.txHash && <HashLabel value={state.txHash} prefixLen={8} suffixLen={6} className="text-base text-ink" />}
        </p>
      </div>
      {submitted && state.vault ? (
        <div className="space-y-2">
          <p className="flex items-center gap-2 text-xl font-extrabold text-allow">
            <span aria-hidden="true">🔒</span> Data submitted securely
          </p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-base">
            <dt className="text-mute">Handle</dt>
            <dd>
              <HashLabel value={state.vault.handle} prefixLen={10} suffixLen={6} className="text-base text-ink" />
            </dd>
            <dt className="text-mute">Ciphertext hash</dt>
            <dd>
              <HashLabel value={state.vault.ciphertextHash} prefixLen={10} suffixLen={6} className="text-base text-ink" />
            </dd>
          </dl>
          <p className="text-base text-mute">{usePortal().company.name} holds only a reference. Only the Sammati Processor can open your details.</p>
        </div>
      ) : (
        <ul className="space-y-2" aria-label="Your sensitive details">
          {SENSITIVE_FIELDS.map((f) => (
            <li key={f} className="flex items-center justify-between gap-3 rounded-row border border-line bg-surface px-4 py-3">
              <span className="font-bold">{f}</span>
              <span className="flex items-center gap-2 text-base text-mute">
                <span aria-hidden="true">🔒</span> Provided securely in your Sammati app
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function DecisionCard({ state }: { state: JourneyState }): ReactNode {
  const d = state.decision;
  if (!d) return null;
  const approved = d.decision === "approved";
  return (
    <div
      role="status"
      data-testid="decision-card"
      className={`space-y-3 rounded-pass border-2 p-5 ${approved ? "border-allow/40 bg-allow/10" : "border-block/40 bg-block/10"}`}
    >
      <StatusChip variant={approved ? "allowed" : "blocked"} label={approved ? "Approved" : "Declined"} />
      {approved && <p className="text-3xl font-extrabold">Limit {formatInr(d.limit)}</p>}
      <ul className="flex flex-wrap gap-2" aria-label="Reasons">
        {d.reasonCodes.map((c) => (
          <li key={c} className="rounded-pill border border-line bg-surface px-3 py-1 font-mono text-base">
            {c}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Application({ view }: { view: JourneyView }): ReactNode {
  const { state, journey } = view;
  const ticked = state.stage !== "form" && state.stage !== "error";
  const canApply = (state.stage === "data-submitted" || state.stage === "decided") && !state.applying;
  const hint =
    state.stage === "form" || state.stage === "awaiting-scan"
      ? "Allow the use of your data first"
      : state.stage === "consent-received"
        ? "Share your details in the Sammati app"
        : state.stage === "withdrawn"
          ? "Consent was withdrawn"
          : null;
  return (
    <div className={`${card} space-y-5`} aria-labelledby="apply">
      <h2 id="apply" className="text-2xl font-extrabold">
        Apply for a loan
      </h2>
      <label className="flex min-h-[48px] cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          className="mt-1 h-6 w-6 accent-ink"
          checked={ticked}
          disabled={state.stage === "consent-received" || state.stage === "data-submitted" || state.stage === "decided" || state.stage === "withdrawn" || state.stage === "error"}
          onChange={(e) => (e.target.checked ? void journey.tick() : journey.untick())}
        />
        <span className="text-xl font-bold">Allow {usePortal().company.name} to use my data for loan purposes</span>
      </label>
      <Purposes view={view} />
      <Live>
        <Progress view={view} />
      </Live>
      <Live>
        <DecisionCard state={state} />
      </Live>
      {state.notice && (
        <p role="alert" className="font-bold text-block">
          ✕ {state.notice}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-4">
        <button type="button" className={primary} disabled={!canApply} onClick={() => void journey.apply()}>
          {state.applying ? "Applying…" : state.stage === "decided" ? "Apply again" : "Apply"}
        </button>
        <button type="button" className="text-base text-ink underline" onClick={() => journey.cancelApplication()}>
          Go back to home
        </button>
        {!canApply && hint && <span className="text-base text-mute">{hint}</span>}
      </div>
    </div>
  );
}

function Home({ view }: { view: JourneyView }): ReactNode {
  return (
    <div className={`${card} space-y-5 text-center py-10`} aria-labelledby="home">
      <h2 id="home" className="text-2xl font-extrabold">
        Welcome to QuickLoan
      </h2>
      {view.state.notice && (
        <p role="alert" className="font-bold text-block">
          ✕ {view.state.notice}
        </p>
      )}
      <p className="text-base text-mute">Manage your account and apply for new loans.</p>
      <div className="pt-4">
        <button
          type="button"
          onClick={() => view.journey.startApplication()}
          className="min-h-[48px] rounded-pill bg-ink px-6 font-bold text-paper transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          Apply for a loan
        </button>
      </div>
    </div>
  );
}

function Portal(): ReactNode {
  const { company } = usePortal();
  const deps = useMemo(() => makeBrowserDeps(company), [company]);
  const view = useJourney(deps);
  const { state, journey } = view;
  return (
    <main className="min-h-screen bg-paper text-ink">
      <header className="bg-ink text-paper">
        <div className="mx-auto flex max-w-[640px] items-center justify-between gap-4 p-4">
          <div>
            <h1 className="text-3xl font-extrabold">{company.name}</h1>
          </div>
          {state.alias && (
            <div className="flex items-center gap-3 text-base">
              <span>Hello, {state.alias}</span>
              <button type="button" onClick={() => journey.signOut()} className="min-h-[48px] rounded-pill border-2 border-paper/70 px-4 font-bold">
                Sign out
              </button>
            </div>
          )}
        </div>
      </header>
      <div className="mx-auto max-w-[640px] space-y-4 p-4">
        {state.stage === "logged-out" ? (
          <Login view={view} />
        ) : state.stage === "home" ? (
          <Home view={view} />
        ) : (
          <Application view={view} />
        )}
        {state.stage === "error" && (
          <div role="alert" className="space-y-3 rounded-pass border-2 border-block/40 bg-block/10 p-5">
            <p className="flex items-center gap-2 text-lg font-extrabold text-block">
              <span aria-hidden="true">✕</span> {state.error}
            </p>
            {state.resumeStage && (
              <button type="button" onClick={() => journey.retry()} className="min-h-[48px] rounded-pill border-2 border-ink px-5 font-bold">
                Try again
              </button>
            )}
          </div>
        )}
      </div>
      <footer className="mx-auto max-w-[640px] p-4 text-sm text-mute">Sample page. Consent by Sammati.</footer>
    </main>
  );
}

/** `/portal/:slug`: the customer page of any approved company. The loan purpose is `?purpose=` (default `credit_check`). */
export function PortalPage(): ReactNode {
  const { slug } = useParams();
  const { status, bySlug } = useDirectory();
  const info = bySlug(slug);
  const [purposes, setPurposes] = useState<Purpose[] | null>(null);
  const wanted = new URLSearchParams(window.location.search).get("purpose") ?? "credit_check";

  useEffect(() => {
    if (!info) return;
    let cancelled = false;
    fetch(`${CORE_URL}/v1/fiduciaries/${info.address}/purposes`)
      .then((r) => (r.ok ? (r.json() as Promise<FiduciaryPurposesResponse>) : Promise.reject(new Error(String(r.status)))))
      .then((body) => !cancelled && setPurposes(body.purposes))
      .catch(() => !cancelled && setPurposes([]));
    return () => {
      cancelled = true;
    };
  }, [info]);

  const value = useMemo(() => {
    if (!info || !purposes) return null;
    const loanPurpose = purposes.some((p) => p.code === wanted) ? wanted : (purposes[0]?.code ?? wanted);
    const company: PortalCompany = { address: info.address, name: info.name, loanPurpose, optionalPurposes: purposes.map((p) => p.code).filter((c) => c !== loanPurpose) };
    return { company, purposes };
  }, [info, purposes, wanted]);

  if (!value) {
    const text = status === "loading" || (info && !purposes) ? "Loading…" : "No company with that address is registered with Sammati.";
    return <main className="grid min-h-screen place-items-center bg-paper p-6 text-lg font-bold text-mute">{text}</main>;
  }
  return (
    <PortalContext.Provider value={value}>
      <Portal />
    </PortalContext.Provider>
  );
}
