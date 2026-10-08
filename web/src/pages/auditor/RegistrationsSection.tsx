/**
 * RegistrationsSection — the regulator decides who may join (prd.md R-02, ui.md §4 "Registrations").
 *
 * Behind the regulator access code. Pending applications are reviewed and approved or rejected with a note; approved
 * companies can be promoted out of the sandbox or given a new API key; the sandbox's test customers are managed here.
 * The page never sees an API key: it goes to the applicant.
 */

import { useCallback, useEffect, useState, type ReactNode } from "react";
import type { ApplicationStatus, ApplicationView, TestPrincipal } from "@sammati/shared";
import {
  addTestPrincipal,
  approveApplication,
  ApiError,
  fetchApplications,
  fetchTestPrincipals,
  rejectApplication,
  reissueKey,
  removeTestPrincipal,
  setSandbox,
} from "../../api";
import { useDirectory } from "../../directory";
import { HashLabel, SandboxBadge, StatusChip } from "../../ui";

const CODE_KEY = "sammati.regulatorCode";
const CHECKS = ["Purposes are specific", "Retention is justified", "Sharing is disclosed"] as const;
const FILTERS: ApplicationStatus[] = ["pending", "approved", "rejected"];
const CHIP = { pending: "pending", approved: "verified", rejected: "blocked" } as const;
const WORD = { pending: "Pending", approved: "Approved", rejected: "Rejected" } as const;

// The code lives for this tab only; storage can be blocked, and then the code is simply asked for again.
const remembered = (): string => {
  try {
    return sessionStorage.getItem(CODE_KEY) ?? "";
  } catch {
    return "";
  }
};
const remember = (code: string): void => {
  try {
    sessionStorage.setItem(CODE_KEY, code);
  } catch {
    // ignore
  }
};

const when = (t: number): string => new Date(t * 1000).toLocaleString();

export function RegistrationsSection(): ReactNode {
  const [code, setCode] = useState(remembered);
  const [unlocked, setUnlocked] = useState(false);
  const [typed, setTyped] = useState(remembered);
  const [problem, setProblem] = useState<string | null>(null);

  const [applications, setApplications] = useState<ApplicationView[]>([]);
  const [filter, setFilter] = useState<ApplicationStatus>("pending");
  const [selected, setSelected] = useState<string | null>(null);

  const load = useCallback(
    async (withCode: string): Promise<boolean> => {
      try {
        setApplications(await fetchApplications(withCode));
        setUnlocked(true);
        setProblem(null);
        return true;
      } catch (err) {
        setUnlocked(false);
        setProblem(err instanceof ApiError && err.status === 401 ? "That access code was not accepted." : "Could not load the applications. Is Core running?");
        return false;
      }
    },
    [],
  );

  useEffect(() => {
    if (code) void load(code);
  }, [code, load]);

  const unlock = async () => {
    if (await load(typed)) {
      remember(typed);
      setCode(typed);
    }
  };

  if (!unlocked) {
    return (
      <section className="mx-auto max-w-md space-y-4 rounded-pass border border-line bg-surface p-6 shadow-sm" aria-label="Regulator access">
        <h2 className="text-xl font-extrabold text-ink">Registrations</h2>
        <p className="text-sm text-mute">Enter the regulator access code. Ask your administrator. In the demo it is on the stage sheet.</p>
        <label className="block text-sm font-bold text-ink">
          Regulator access code
          <input
            type="password"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void unlock()}
            className="mt-1 w-full rounded-row border border-line px-3 py-2 text-base focus:border-marigold focus:outline-none"
            autoComplete="off"
          />
        </label>
        {problem && (
          <p role="alert" className="font-bold text-block">
            <span aria-hidden="true">✕ </span>
            {problem}
          </p>
        )}
        <button type="button" onClick={() => void unlock()} className="rounded-pill bg-ink px-5 py-2.5 font-bold text-paper">
          Unlock
        </button>
      </section>
    );
  }

  const shown = applications.filter((a) => a.status === filter);
  const pendingCount = applications.filter((a) => a.status === "pending").length;
  const open = applications.find((a) => a.id === selected) ?? null;

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-extrabold text-ink">Registrations</h2>
        <p className="text-sm text-mute">Companies apply on /join. Nothing exists for them until you approve: no company id, no API key, no way to ask a customer for consent.</p>
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter applications">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={filter === f}
            onClick={() => {
              setFilter(f);
              setSelected(null);
            }}
            className={`rounded-pill border px-4 py-1.5 text-sm font-bold ${filter === f ? "border-ink bg-ink text-paper" : "border-line bg-surface text-ink"}`}
          >
            {WORD[f]}
            {f === "pending" && pendingCount > 0 && <span className="ml-2 rounded-pill bg-marigold px-2 text-xs text-ink">{pendingCount}</span>}
          </button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(260px,1fr)_2fr]">
        <ul className="space-y-2" aria-label="Applications">
          {shown.length === 0 && <li className="rounded-row border border-dashed border-line p-6 text-center text-sm text-mute">No {filter} applications.</li>}
          {shown.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => setSelected(a.id)}
                aria-current={selected === a.id ? "true" : undefined}
                className={`w-full rounded-row border p-3 text-left ${selected === a.id ? "border-marigold bg-marigold/10" : "border-line bg-surface"}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-extrabold text-ink">{a.name}</span>
                  <StatusChip variant={CHIP[a.status]} label={WORD[a.status]} size="sm" />
                </div>
                <div className="text-xs text-mute">
                  {a.sector} · {when(a.createdAt)}
                </div>
              </button>
            </li>
          ))}
        </ul>

        {open ? (
          <ReviewPanel
            key={open.id}
            app={open}
            code={code}
            onDecided={async () => {
              await load(code);
            }}
          />
        ) : (
          <div className="rounded-pass border border-dashed border-line p-10 text-center text-sm text-mute">Select an application to review it.</div>
        )}
      </div>

      <ApprovedCompanies applications={applications.filter((a) => a.status === "approved")} code={code} />
      <TestCustomers code={code} />
    </div>
  );
}

function ReviewPanel({ app, code, onDecided }: { app: ApplicationView; code: string; onDecided: () => Promise<void> }): ReactNode {
  const [checks, setChecks] = useState<boolean[]>(CHECKS.map(() => false));
  const [note, setNote] = useState("");
  const [sandbox, setSandboxChoice] = useState(true);
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string[] | null>(null);
  const pending = app.status === "pending";

  const approve = async () => {
    setBusy("approve");
    setError(null);
    try {
      const res = await approveApplication(code, app.id, { note: note.trim() || undefined, sandbox });
      setDone(res.txHashes);
      await onDecided();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Approval failed");
    } finally {
      setBusy(null);
    }
  };

  const reject = async () => {
    if (!note.trim()) {
      setError("Write a note: the company will read it.");
      return;
    }
    setBusy("reject");
    setError(null);
    try {
      await rejectApplication(code, app.id, note.trim());
      await onDecided();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Rejection failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <article className="space-y-5 rounded-pass border border-line bg-surface p-6 shadow-sm" aria-label={`Review ${app.name}`}>
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-lg font-extrabold text-ink">{app.name}</h3>
          <p className="text-sm text-mute">
            {app.sector} · applied {when(app.createdAt)}
          </p>
        </div>
        <StatusChip variant={CHIP[app.status]} label={WORD[app.status]} />
      </header>

      <dl className="grid gap-1 text-sm">
        <div className="flex gap-2">
          <dt className="w-32 text-mute">Contact email</dt>
          <dd className="font-mono">{app.contactEmail ?? "erased when the decision was made"}</dd>
        </div>
        {app.fiduciary && (
          <div className="flex gap-2">
            <dt className="w-32 text-mute">Fiduciary</dt>
            <dd>
              <HashLabel value={app.fiduciary} />
            </dd>
          </div>
        )}
        {app.note && (
          <div className="flex gap-2">
            <dt className="w-32 text-mute">Your note</dt>
            <dd>{app.note}</dd>
          </div>
        )}
      </dl>

      <section aria-label="Purposes" className="space-y-3">
        <h4 className="font-extrabold text-ink">Purposes ({app.purposes.length})</h4>
        {app.purposes.map((p) => (
          <div key={p.code} className="rounded-row border border-line p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono font-bold">{p.code}</span>
              {p.sharesThirdParty && <span className="rounded-pill border border-block/40 bg-block/10 px-2 text-xs font-bold text-block">Shared with third parties</span>}
              {p.required && <span className="rounded-pill border border-line px-2 text-xs font-bold text-mute">Needed for the service</span>}
            </div>
            {(["en", "hi", "kn"] as const).map((l) => (
              <p key={l}>
                <span className="mr-2 inline-block w-6 text-xs font-bold uppercase text-mute">{l}</span>
                <strong>{p.title[l]}</strong> — {p.description[l]}
              </p>
            ))}
            <p className="mt-1 text-xs text-mute">
              {p.dataCategories.join(", ")} · kept {p.retentionDays} days
            </p>
          </div>
        ))}
      </section>

      <section aria-label="Processors">
        <h4 className="font-extrabold text-ink">Processors ({app.processors.length})</h4>
        {app.processors.length === 0 ? (
          <p className="text-sm text-mute">None declared.</p>
        ) : (
          <ul className="text-sm">
            {app.processors.map((p) => (
              <li key={p.name}>
                {p.name} <span className="text-mute">for</span> <span className="font-mono">{p.purposeCode}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {pending && (
        <>
          <fieldset className="space-y-1 rounded-row bg-paper p-3">
            <legend className="px-1 text-xs font-bold text-mute">Your checklist (no effect on the system)</legend>
            {CHECKS.map((c, i) => (
              <label key={c} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={checks[i]} onChange={(e) => setChecks(checks.map((v, j) => (j === i ? e.target.checked : v)))} className="h-4 w-4 accent-ink" />
                {c}
              </label>
            ))}
          </fieldset>

          <label className="block text-sm font-bold text-ink">
            Note {`(required to reject, optional to approve)`}
            <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={280} rows={2} className="mt-1 w-full rounded-row border border-line px-3 py-2 text-sm font-normal focus:border-marigold focus:outline-none" />
          </label>
          <label className="flex items-center gap-2 text-sm font-bold text-ink">
            <input type="checkbox" checked={sandbox} onChange={(e) => setSandboxChoice(e.target.checked)} className="h-4 w-4 accent-ink" />
            Start in sandbox
          </label>

          {busy === "approve" && (
            <p role="status" className="rounded-row bg-paper p-3 text-sm font-bold text-ink">
              Approving: generating the company's key, registering the company, its purposes and processors on the ledger, creating the API key. This takes a few seconds.
            </p>
          )}
          {error && (
            <p role="alert" className="font-bold text-block">
              <span aria-hidden="true">✕ </span>
              {error}
            </p>
          )}
          <div className="flex gap-3">
            <button type="button" disabled={busy !== null} onClick={() => void approve()} className="rounded-pill bg-allow px-5 py-2.5 font-bold text-paper disabled:opacity-40">
              <span aria-hidden="true">✓ </span>Approve
            </button>
            <button type="button" disabled={busy !== null} onClick={() => void reject()} className="rounded-pill border-2 border-block px-5 py-2.5 font-bold text-block disabled:opacity-40">
              <span aria-hidden="true">✕ </span>Reject
            </button>
          </div>
        </>
      )}

      {done && (
        <div role="status" className="rounded-row border border-allow/40 bg-allow/10 p-3 text-sm">
          <p className="font-extrabold text-allow">
            <span aria-hidden="true">✓ </span>Approved. {app.name} is in the directory.
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-mute">
            Ledger transactions:
            {done.map((tx) => (
              <HashLabel key={tx} value={tx} />
            ))}
          </p>
        </div>
      )}
    </article>
  );
}

function ApprovedCompanies({ applications, code }: { applications: ApplicationView[]; code: string }): ReactNode {
  const directory = useDirectory();
  const [confirm, setConfirm] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  if (applications.length === 0) return null;

  const run = async (label: string, job: () => Promise<unknown>) => {
    setConfirm(null);
    try {
      await job();
      await directory.refresh();
      setMessage(label);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "That did not work");
    }
  };

  return (
    <section className="space-y-3" aria-label="Approved companies">
      <h3 className="text-lg font-extrabold text-ink">Approved companies</h3>
      {message && (
        <p role="status" className="text-sm font-bold text-ink">
          {message}
        </p>
      )}
      <ul className="space-y-2">
        {applications.map((a) => {
          const company = directory.byAddress(a.fiduciary);
          const inSandbox = company?.sandbox ?? a.sandbox ?? true;
          return (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 rounded-row border border-line bg-surface p-3">
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-ink">{a.name}</span>
                {inSandbox ? <SandboxBadge /> : <StatusChip variant="active" label="Live" size="sm" />}
              </div>
              {a.fiduciary && (
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  {confirm === `sandbox:${a.id}` ? (
                    <>
                      <span className="font-bold">{inSandbox ? "Promote to live?" : "Return to sandbox?"}</span>
                      <button type="button" className="rounded-pill bg-ink px-3 py-1 font-bold text-paper" onClick={() => void run(inSandbox ? `${a.name} is live.` : `${a.name} is back in the sandbox.`, () => setSandbox(code, a.fiduciary!, !inSandbox))}>
                        Confirm
                      </button>
                      <button type="button" className="px-2 font-bold text-mute" onClick={() => setConfirm(null)}>
                        Cancel
                      </button>
                    </>
                  ) : confirm === `key:${a.id}` ? (
                    <>
                      <span className="font-bold">The old key stops working at once. Issue a new one?</span>
                      <button type="button" className="rounded-pill bg-ink px-3 py-1 font-bold text-paper" onClick={() => void run(`New key issued. ${a.name} will see it once on its status page.`, () => reissueKey(code, a.fiduciary!))}>
                        Confirm
                      </button>
                      <button type="button" className="px-2 font-bold text-mute" onClick={() => setConfirm(null)}>
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button type="button" className="rounded-pill border border-ink px-3 py-1 font-bold text-ink" onClick={() => setConfirm(`sandbox:${a.id}`)}>
                        {inSandbox ? "Promote to live" : "Return to sandbox"}
                      </button>
                      <button type="button" className="rounded-pill border border-line px-3 py-1 font-bold text-ink" onClick={() => setConfirm(`key:${a.id}`)}>
                        Issue a new API key
                      </button>
                    </>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function TestCustomers({ code }: { code: string }): ReactNode {
  const [principals, setPrincipals] = useState<TestPrincipal[]>([]);
  const [who, setWho] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetchTestPrincipals(code).then(setPrincipals).catch(() => setError("Could not load the test customers."));
  }, [code]);

  const add = async () => {
    const value = who.trim();
    if (!value) return;
    setError(null);
    try {
      setPrincipals(await addTestPrincipal(code, value.startsWith("0x") ? { principal: value } : { handle: value }));
      setWho("");
    } catch (err) {
      setError(err instanceof ApiError && err.code === "HANDLE_NOT_FOUND" ? "No wallet has registered that Sammati ID." : err instanceof Error ? err.message : "Could not add");
    }
  };

  return (
    <section className="space-y-3 rounded-pass border border-line bg-surface p-6 shadow-sm" aria-label="Test customers">
      <h3 className="text-lg font-extrabold text-ink">Test customers</h3>
      <p className="text-sm text-mute">A company in the sandbox can ask only these customers. The demo customer is always one.</p>
      <ul className="space-y-1 text-sm">
        {principals.length === 0 && <li className="text-mute">None added.</li>}
        {principals.map((p) => (
          <li key={p.principal} className="flex items-center justify-between gap-2">
            <span>
              {p.handle ? <strong>{p.handle}</strong> : null} <HashLabel value={p.principal} />
            </span>
            <button
              type="button"
              className="font-bold text-block"
              onClick={() => void removeTestPrincipal(code, p.principal).then(setPrincipals)}
              aria-label={`Remove ${p.handle ?? p.principal}`}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <input
          aria-label="Sammati ID or address"
          placeholder="asha@sammati or 0x…"
          value={who}
          onChange={(e) => setWho(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void add()}
          className="min-w-[240px] flex-1 rounded-row border border-line px-3 py-2 text-sm focus:border-marigold focus:outline-none"
        />
        <button type="button" onClick={() => void add()} className="rounded-pill bg-ink px-4 py-2 text-sm font-bold text-paper">
          Add
        </button>
      </div>
      {error && (
        <p role="alert" className="text-sm font-bold text-block">
          <span aria-hidden="true">✕ </span>
          {error}
        </p>
      )}
    </section>
  );
}
