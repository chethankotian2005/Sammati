import { useEffect, useState, type ReactNode } from "react";
import { ApiError, fetchAuditScorecards } from "../../api";
import { LOGIN_REQUIRED } from "../../core";
import { savedRegulatorCode, saveRegulatorCode } from "../../regulator";

/**
 * A hosted Auditor shows nothing before the regulator's access code is accepted (trd.md §10.8, ui.md §4). The check is
 * the first Auditor call itself, so what is shown is exactly what Core will answer. The development build has no gate.
 */
export function RegulatorGate({ children }: { children: ReactNode }): ReactNode {
  const [state, setState] = useState<"checking" | "locked" | "open">(LOGIN_REQUIRED ? "checking" : "open");
  const [typed, setTyped] = useState("");
  const [problem, setProblem] = useState<string | null>(null);

  const attempt = async (code: string): Promise<void> => {
    saveRegulatorCode(code);
    try {
      await fetchAuditScorecards();
      setProblem(null);
      setState("open");
    } catch (err) {
      saveRegulatorCode("");
      setProblem(err instanceof ApiError && err.status === 401 ? "That access code was not accepted." : "Could not reach Sammati. Try again.");
      setState("locked");
    }
  };

  useEffect(() => {
    if (!LOGIN_REQUIRED) return;
    const saved = savedRegulatorCode();
    if (saved) void attempt(saved);
    else setState("locked");
  }, []);

  if (state === "open") return children;
  if (state === "checking") return <main className="grid min-h-screen place-items-center bg-paper p-6 text-lg font-bold text-mute">Checking access…</main>;
  return (
    <main className="grid min-h-screen place-items-center bg-paper p-6">
      <section className="w-full max-w-md space-y-4 rounded-pass border border-line bg-surface p-6 shadow-sm" aria-label="Regulator sign-in">
        <h1 className="text-xl font-extrabold text-ink">Regulator sign-in</h1>
        <p className="text-sm text-mute">Enter the regulator access code. Ask your administrator for the regulator access code.</p>
        <label className="block text-sm font-bold text-ink">
          Regulator access code
          <input
            type="password"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void attempt(typed)}
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
        <button type="button" onClick={() => void attempt(typed)} className="rounded-pill bg-ink px-5 py-2.5 font-bold text-paper">
          Open the Auditor
        </button>
      </section>
    </main>
  );
}
