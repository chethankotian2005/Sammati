/**
 * Data Flow Inspector (V-07, ui.md §5.1): four lanes that show, from real events and real answers, that the customer's
 * data is encrypted on the phone, is only ciphertext everywhere QuickLoan or anyone else can reach, and is opened only
 * inside the sealed Processor.
 *
 * `FlowView` draws a `FlowController`; `FlowPanel` is that controller plus the view, for the two places it lives.
 * Status is never colour alone: every state has a word and an icon. Tokens from ui.md §1.1 only.
 */

import type { ReactNode } from "react";
import { DEMO_PROFILE, type ProcessorOutcome } from "@sammati/shared";
import { HashLabel } from "../ui";
import { StatusChip, type ChipVariant } from "../ui/StatusChip";
import { BLOCKED_MARKER, filterStaffView } from "./privacy";
import { MASKED_FIELDS, timeline, type FlowState, type ProcessorPhase } from "./state";
import { useFlow, type FlowController, type RerunState, type StaffResult } from "./useFlow";

export const ALGORITHM = "X25519 + AES-256-GCM";

// ---------------------------------------------------------------- formatting

export function formatClock(ms: number): string {
  const d = new Date(ms);
  const two = (n: number) => String(n).padStart(2, "0");
  return `${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3, "0")}`;
}

export function formatGap(ms: number): string {
  return ms < 1000 ? `+${ms} ms` : `+${(ms / 1000).toFixed(1)} s`;
}

const inr = (n: number | null): string => (n === null ? "none" : n.toLocaleString("en-IN"));

// ---------------------------------------------------------------- building blocks

function Lane({ n, title, caption, children }: { n: number; title: string; caption: string; children: ReactNode }): ReactNode {
  const id = `lane-${n}`;
  return (
    <section aria-labelledby={id} className="flex min-h-[420px] flex-col gap-4 rounded-pass border-t-8 border-marigold bg-surface p-6 text-ink shadow-lg">
      <header>
        <div className="flex items-center gap-3">
          <span aria-hidden="true" className="flex h-10 w-10 items-center justify-center rounded-pill bg-marigold text-xl font-extrabold text-ink">
            {n}
          </span>
          <h2 id={id} className="text-3xl font-extrabold leading-tight">
            {title}
          </h2>
        </div>
        <p className="mt-2 text-lg text-mute">{caption}</p>
      </header>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }): ReactNode {
  return (
    <div>
      <div className="text-sm font-bold uppercase tracking-wider text-mute">{label}</div>
      <div className="mt-1 text-xl font-bold">{children}</div>
    </div>
  );
}

function Waiting({ children }: { children: ReactNode }): ReactNode {
  return <p className="rounded-row border border-dashed border-line p-4 text-lg text-mute">{children}</p>;
}

// ---------------------------------------------------------------- lane 1: the phone

function WalletLane({ flow }: { flow: FlowState }): ReactNode {
  return (
    <Lane n={1} title="Wallet" caption="On the customer's own phone">
      <div className="space-y-3 rounded-row border border-line bg-paper p-4" data-testid="wallet-fields">
        <Field label="PAN">
          <span className="font-mono text-2xl">{DEMO_PROFILE.pan}</span>
        </Field>
        <Field label="Income">{DEMO_PROFILE.incomeBand}</Field>
        <Field label="Credit score">{DEMO_PROFILE.score}</Field>
      </div>
      <p className="text-base text-mute">Their own data, on their own device. It never leaves the phone like this.</p>
      <div aria-live="polite">
        {flow.wallet === "idle" && <Waiting>Waiting for the customer to send their details</Waiting>}
        {flow.wallet === "encrypting" && <StatusChip variant="pending" label="Encrypting" />}
        {flow.wallet === "sent" && <StatusChip variant="verified" label="Sent encrypted" />}
      </div>
    </Lane>
  );
}

// ---------------------------------------------------------------- lane 2: in transit and at rest

function TransitLane({ flow, row }: { flow: FlowState; row: FlowController["row"] }): ReactNode {
  const t = flow.transit;
  const envelope = filterStaffView(row?.body ?? null).fields.find((f) => f.name === "envelope")?.value as { ciphertext: string } | null | undefined;
  const erased = t.erased;
  return (
    <Lane n={2} title="In transit and at rest" caption={ALGORITHM}>
      {t.ciphertextHash === null ? (
        <Waiting>Waiting for the customer to send their details</Waiting>
      ) : (
        <div className="space-y-3">
          <Field label="Ciphertext">
            <span className="font-mono text-xl" data-testid="ciphertext">
              {envelope?.ciphertext ? <HashLabel value={envelope.ciphertext} prefixLen={12} suffixLen={8} className={`text-xl text-ink ${erased ? "line-through decoration-2" : ""}`} /> : <span className="text-mute">loading…</span>}
            </span>
          </Field>
          <Field label="Envelope hash">
            <span className="font-mono text-xl">{flow.handle ? <HashLabel value={flow.handle} prefixLen={10} suffixLen={6} className={`text-xl text-ink ${erased ? "line-through decoration-2" : ""}`} /> : null}</span>
          </Field>
          <Field label="Size">{t.sizeBytes} bytes</Field>
          <Field label="Algorithm">{ALGORITHM}</Field>
          {erased && (
            <div role="status" className="flex items-center gap-2 rounded-row border border-block/30 bg-block/10 p-3 text-xl font-extrabold text-block">
              <span aria-hidden="true">🗑</span> Ciphertext erased
            </div>
          )}
        </div>
      )}
    </Lane>
  );
}

// ---------------------------------------------------------------- lane 3: QuickLoan staff

function Shown({ value }: { value: unknown }): ReactNode {
  if (typeof value === "string" && /^0x[0-9a-f]{20,}$/.test(value)) return <HashLabel value={value} prefixLen={10} suffixLen={6} className="text-lg text-ink" />;
  if (value === null) return <span className="text-mute">none</span>;
  if (typeof value === "object") {
    // the envelope: five ciphertext fields, each as the hex it is
    return (
      <dl className="space-y-1">
        {Object.entries(value as Record<string, unknown>).map(([k, v]) => (
          <div key={k} className="flex gap-2 text-base">
            <dt className="w-24 shrink-0 text-mute">{k}</dt>
            <dd className="font-mono">
              <Shown value={v} />
            </dd>
          </div>
        ))}
      </dl>
    );
  }
  return <span>{String(value)}</span>;
}

function StaffAnswer({ result, kind }: { result: StaffResult; kind: "admin" | "database" }): ReactNode {
  const { view } = result;
  return (
    <div className="space-y-2 rounded-row border border-line bg-paper p-3" data-testid={`staff-${kind}`} aria-live="polite">
      <div className="flex flex-wrap items-center gap-2 text-sm font-bold text-mute">
        <span>{result.status === null ? "No answer" : `HTTP ${result.status}`}</span>
        {result.recorded && <span className="rounded-pill bg-marigold/20 px-2 py-0.5 text-ink">recorded</span>}
      </div>
      {result.error && <p className="text-lg font-bold text-block">✕ {result.error}</p>}
      <dl className="space-y-2">
        {view.fields.map((f) => (
          <div key={f.name}>
            <dt className="text-sm text-mute">{f.name}</dt>
            <dd className="font-mono text-lg">
              <Shown value={f.value} />
            </dd>
          </div>
        ))}
        {view.blocked.map((name) => (
          <div key={name}>
            <dt className="text-sm text-mute">{name}</dt>
            <dd className="text-lg font-bold text-block">✕ {BLOCKED_MARKER}</dd>
          </div>
        ))}
      </dl>
      {view.hidden > 0 && <p className="text-sm text-mute">{view.hidden} unrecognised field(s) not shown</p>}
      {view.leaked && <p className="text-lg font-bold text-block">⚠ Plaintext was in this answer and was not shown</p>}
      {kind === "admin" ? (
        <p className="flex items-center gap-2 text-xl font-extrabold text-ink">
          <span aria-hidden="true">🚫</span> Not authorised to read content
        </p>
      ) : (
        <p className="text-base font-bold text-ink">A database administrator sees ciphertext only.</p>
      )}
    </div>
  );
}

function StaffLane({ ctl }: { ctl: FlowController }): ReactNode {
  const button = "min-h-[64px] w-full rounded-row border-2 border-ink bg-surface px-4 py-3 text-left text-xl font-extrabold text-ink hover:bg-marigold/20 focus:outline-none focus-visible:ring-4 focus-visible:ring-marigold";
  return (
    <Lane n={3} title="QuickLoan staff view" caption="What QuickLoan can see">
      <button type="button" className={button} onClick={() => void ctl.viewCustomerData()}>
        Try to view customer data
      </button>
      {ctl.admin && <StaffAnswer result={ctl.admin} kind="admin" />}
      <button type="button" className={button} onClick={() => void ctl.readDatabase()}>
        Try to read database
      </button>
      {ctl.database && <StaffAnswer result={ctl.database} kind="database" />}
    </Lane>
  );
}

// ---------------------------------------------------------------- lane 4: the sealed processor

const PHASES: ReadonlyArray<{ phase: ProcessorPhase; label: string }> = [
  { phase: "waiting", label: "Waiting" },
  { phase: "decrypting", label: "Decrypting" },
  { phase: "scoring", label: "Scoring" },
  { phase: "decision", label: "Decision" },
];

const OUTCOME: Record<ProcessorOutcome, { variant: ChipVariant; label: string }> = {
  approved: { variant: "allowed", label: "Approved" },
  declined: { variant: "blocked", label: "Declined" },
  blocked: { variant: "blocked", label: "Blocked" },
  error: { variant: "tampered", label: "Error" },
};

function ProcessorLane({ flow }: { flow: FlowState }): ReactNode {
  const { phase, decision } = flow.processor;
  return (
    <Lane n={4} title="Sealed Processor" caption="Demo visualisation of a sealed processor">
      <div className="space-y-4 rounded-pass border-4 border-ink bg-paper p-4" data-testid="processor-box">
        <ol aria-label="Processor state" className="grid grid-cols-2 gap-2">
          {PHASES.map((p) => {
            const current = p.phase === phase;
            return (
              <li
                key={p.phase}
                aria-current={current ? "step" : undefined}
                className={`rounded-row border-2 px-3 py-2 text-lg font-extrabold ${current ? "border-ink bg-ink text-paper" : "border-line text-mute"}`}
              >
                <span aria-hidden="true">{current ? "● " : "○ "}</span>
                {p.label}
              </li>
            );
          })}
        </ol>
        <dl className="space-y-1" data-testid="masked-fields">
          {MASKED_FIELDS.map((f) => (
            <div key={f.label} className="flex items-baseline justify-between gap-3">
              <dt className="text-base text-mute">{f.label}</dt>
              <dd className="font-mono text-xl tracking-widest">{f.mask}</dd>
            </div>
          ))}
        </dl>
        <p className="text-sm text-mute">Masked: this screen never receives the values.</p>
      </div>
      <div aria-live="polite" data-testid="decision">
        {decision ? (
          <div className="space-y-2">
            <StatusChip variant={OUTCOME[decision.outcome].variant} label={OUTCOME[decision.outcome].label} />
            {decision.outcome === "approved" && <div className="text-2xl font-extrabold">Limit {inr(decision.limit)}</div>}
            {decision.outcome === "blocked" && <div className="text-xl font-extrabold">451 · {decision.reasonCodes[0]}</div>}
            <ul className="flex flex-wrap gap-2" aria-label="Reason codes">
              {decision.reasonCodes.map((c) => (
                <li key={c} className="rounded-pill border border-line bg-surface px-3 py-1 font-mono text-base">
                  {c}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <Waiting>No decision yet</Waiting>
        )}
      </div>
    </Lane>
  );
}

// ---------------------------------------------------------------- the strip below

function Timeline({ flow }: { flow: FlowState }): ReactNode {
  return (
    <ol aria-label="Step by step" className="grid grid-cols-2 gap-3 md:grid-cols-6">
      {timeline(flow).map((row) => (
        <li key={row.key} className={`rounded-row border-2 p-3 ${row.atMs === null ? "border-line text-mute" : "border-ink text-ink"}`}>
          <div className="flex items-center gap-2 text-lg font-extrabold">
            <span aria-hidden="true">{row.atMs === null ? "○" : "●"}</span>
            {row.label}
          </div>
          <div className="mt-1 font-mono text-base">{row.atMs === null ? "—" : formatClock(row.atMs)}</div>
          <div className="font-mono text-sm text-mute">{row.gapMs === null ? " " : formatGap(row.gapMs)}</div>
        </li>
      ))}
    </ol>
  );
}

function PrivacyLine({ verdict, where }: { verdict: FlowController["verdict"]; where: string | null }): ReactNode {
  if (verdict === "clean") {
    return (
      <p role="status" data-testid="privacy-line" className="flex items-center gap-3 text-2xl font-extrabold text-allow">
        <span aria-hidden="true">🛡</span> No plaintext was visible to QuickLoan or any third party
      </p>
    );
  }
  if (verdict === "violated") {
    return (
      <p role="alert" data-testid="privacy-violation" className="flex items-center gap-3 text-2xl font-extrabold text-block">
        <span aria-hidden="true">⚠</span> Plaintext found in an event: this must never happen{where ? ` (${where})` : ""}
      </p>
    );
  }
  return null;
}

function rerunText(r: RerunState): string | null {
  switch (r.phase) {
    case "withdrawing":
      return "Withdrawing…";
    case "waiting-phone":
      return "Withdraw on the phone now";
    case "applying":
      return "Applying…";
    case "done":
      return `${r.decision} · ${r.reason}`;
    case "error":
      return r.message;
    default:
      return null;
  }
}

// ---------------------------------------------------------------- the whole screen

export function FlowView({ ctl, embedded = false }: { ctl: FlowController; embedded?: boolean }): ReactNode {
  const live = ctl.mode === "live";
  const busy = ctl.rerun.phase === "withdrawing" || ctl.rerun.phase === "waiting-phone" || ctl.rerun.phase === "applying";
  const note = rerunText(ctl.rerun);
  const chip = "rounded-pill px-3 py-1 text-base font-extrabold";
  const header = "min-h-[48px] rounded-pill border-2 border-paper/60 px-5 text-lg font-bold hover:bg-paper/10 focus:outline-none focus-visible:ring-4 focus-visible:ring-marigold";

  return (
    <div className={embedded ? "space-y-4" : "min-h-screen space-y-6 bg-ink p-8 text-paper"} data-testid="flow-inspector">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-4xl font-extrabold">Data flow</h1>
        <div className="flex flex-wrap items-center gap-3">
          {ctl.mode === "replay" ? (
            <span className={`${chip} bg-marigold text-ink`}>⏺ Replay of a recording</span>
          ) : ctl.online ? (
            <span className={`${chip} bg-allow text-paper`}>● Live</span>
          ) : (
            <span className={`${chip} bg-block text-paper`} role="status">
              ✕ Live feed offline
            </span>
          )}
          <button type="button" className={header} onClick={() => ctl.setReplay(live)}>
            {live ? "Replay" : "Back to live"}
          </button>
          <button type="button" className={header} onClick={ctl.saveSession}>
            Save session
          </button>
        </div>
      </header>
      {ctl.replayError && (
        <p role="alert" className="rounded-row bg-block px-4 py-3 text-lg font-bold text-paper">
          ✕ {ctl.replayError}
        </p>
      )}

      <div className="grid gap-6 xl:grid-cols-4 md:grid-cols-2">
        <WalletLane flow={ctl.flow} />
        <TransitLane flow={ctl.flow} row={ctl.row} />
        <StaffLane ctl={ctl} />
        <ProcessorLane flow={ctl.flow} />
      </div>

      <div className="space-y-5 rounded-pass bg-surface p-6 text-ink shadow-lg">
        <Timeline flow={ctl.flow} />
        <PrivacyLine verdict={ctl.verdict} where={ctl.privacy.violation} />
        <div className="flex flex-wrap items-center gap-4 border-t border-line pt-4">
          <button
            type="button"
            disabled={!live || !ctl.online || busy}
            onClick={() => void ctl.withdrawAndRerun()}
            className="min-h-[56px] rounded-pill bg-marigold px-6 text-xl font-extrabold text-ink disabled:opacity-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-ink"
          >
            Withdraw and re-run
          </button>
          {busy && (
            <button type="button" onClick={ctl.cancelRerun} className="min-h-[48px] rounded-pill border-2 border-ink px-5 text-lg font-bold">
              Cancel
            </button>
          )}
          <p role="status" className={`text-xl font-extrabold ${ctl.rerun.phase === "error" ? "text-block" : ""}`}>
            {!live ? "Not available in a replay: the recording already includes the withdrawal" : note}
          </p>
        </div>
      </div>
    </div>
  );
}

export function FlowPanel({ embedded = false, startInReplay = false }: { embedded?: boolean; startInReplay?: boolean }): ReactNode {
  const ctl = useFlow({ startInReplay });
  return <FlowView ctl={ctl} embedded={embedded} />;
}
