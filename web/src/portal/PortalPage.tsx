/**
 * QuickLoan's customer page (C-09, ui.md §3.1): the company's own website, with Sammati's consent in the middle.
 * It has no field for a PAN or an income and no code that could show one: the sensitive fields are entered in the
 * Sammati app and reach only the Processor.
 */

import { useState, type FormEvent, type ReactNode } from "react";
import { QRCodeSVG } from "qrcode.react";
import { SEED_FIDUCIARIES } from "@sammati/shared";
import { HashLabel } from "../ui";
import { StatusChip } from "../ui/StatusChip";
import { formatInr } from "../ui/VaultPanel";
import { OPTIONAL_PURPOSES, type JourneyState } from "./journey";
import { useJourney, type JourneyView } from "./useJourney";

const QUICKLOAN = SEED_FIDUCIARIES.find((f) => f.slug === "quickloan")!;
const purposeText = (code: string): string => QUICKLOAN.purposes.find((p) => p.code === code)?.description.en ?? code;

const SENSITIVE_FIELDS = ["PAN", "Income", "Employment"] as const;

const card = "rounded-pass border border-line bg-surface p-6 shadow-sm";
const primary =
  "min-h-[48px] rounded-pill bg-quickloan px-6 text-lg font-extrabold text-paper disabled:opacity-40 focus:outline-none focus-visible:ring-4 focus-visible:ring-marigold";

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
        <span className="text-base font-bold">Your customer name or ID</span>
        <input
          type="text"
          name="customer-name"
          autoComplete="off"
          value={alias}
          onChange={(e) => setAlias(e.target.value)}
          placeholder="for example Asha"
          className="mt-2 w-full rounded-row border-2 border-line px-4 py-3 text-lg focus:border-quickloan focus:outline-none"
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
  const locked = state.stage !== "form";
  return (
    <ul className="ml-8 space-y-3" aria-label="What QuickLoan will use your data for">
      <li className="text-lg">{purposeText("credit_check")}</li>
      {OPTIONAL_PURPOSES.map((code) => {
        const purpose = QUICKLOAN.purposes.find((p) => p.code === code)!;
        return (
          <li key={code}>
            <label className="flex min-h-[48px] cursor-pointer items-center gap-3 text-lg">
              <input
                type="checkbox"
                className="h-6 w-6 accent-quickloan"
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
          <div className="rounded-pass border-2 border-line bg-white p-4">
            <QRCodeSVG value={state.request?.qrPayload ?? ""} size={240} level="M" />
          </div>
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
          <p className="text-base text-mute">QuickLoan holds only a reference. Only the Sammati Processor can open your details.</p>
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
          className="mt-1 h-6 w-6 accent-quickloan"
          checked={ticked}
          disabled={state.stage === "consent-received" || state.stage === "data-submitted" || state.stage === "decided" || state.stage === "withdrawn" || state.stage === "error"}
          onChange={(e) => (e.target.checked ? void journey.tick() : journey.untick())}
        />
        <span className="text-xl font-bold">Allow QuickLoan to use my data for loan purposes</span>
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
        {!canApply && hint && <span className="text-base text-mute">{hint}</span>}
      </div>
    </div>
  );
}

export function PortalPage(): ReactNode {
  const view = useJourney();
  const { state, journey } = view;
  return (
    <main className="min-h-screen bg-paper text-ink">
      <header className="bg-quickloan text-paper">
        <div className="mx-auto flex max-w-[640px] items-center justify-between gap-4 p-4">
          <div>
            <h1 className="text-3xl font-extrabold">QuickLoan</h1>
            <p className="text-base opacity-90">Loans, quickly.</p>
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
        {state.stage === "logged-out" ? <Login view={view} /> : <Application view={view} />}
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
      <footer className="mx-auto max-w-[640px] p-4 text-sm text-mute">Demo page. Consent by Sammati.</footer>
    </main>
  );
}
