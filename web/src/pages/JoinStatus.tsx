/**
 * /join/:applicationId — follows an application and, once approved, is the onboarding result page (prd.md R-01,
 * R-03, ui.md §3.3): the fiduciary address, the API key once, and the integration quickstart.
 *
 * The API key is delivered by Core on the first read after approval only. Polling would otherwise lose it, so every
 * key that arrives is kept in module memory for the life of the tab, whatever the page did with the response.
 */
import { useEffect, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import type { RegistrationStatusResponse } from "@sammati/shared";
import { ApiError, fetchProcessorUrl, fetchPurposes, fetchRegistration } from "../api";
import { CORE_URL } from "../core";
import { HashLabel, SandboxBadge } from "../ui";
import { makeJoinT, type Lang } from "../join/copy";
import { KEY_PLACEHOLDER, envLine, gatewaySnippet, processorCurl, targetedCurl, type QuickstartValues } from "../join/quickstart";

const LANGS: Array<[Lang, string]> = [["en", "EN"], ["hi", "हि"], ["kn", "ಕ"]];
const POLL_MS = 3000;

/** Keys read from Core, by application id. A key is shown once by Core; this keeps it for the page that fetched it. */
const keysSeen = new Map<string, string>();

async function fetchStatus(id: string): Promise<RegistrationStatusResponse> {
  const status = await fetchRegistration(id);
  if (status.result?.apiKey) keysSeen.set(id, status.result.apiKey);
  return status;
}

function CodeBlock({ title, code, copyLabel, copiedLabel }: { title: string; code: string; copyLabel: string; copiedLabel: string }): ReactNode {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard needs a secure context; the text stays selectable
    }
  };
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-lg font-extrabold">{title}</h3>
        <button type="button" onClick={() => void copy()} className="rounded-pill border-2 border-ink px-3 py-1 text-sm font-bold" aria-label={`${copyLabel}: ${title}`}>
          {copied ? `✓ ${copiedLabel}` : copyLabel}
        </button>
      </div>
      <pre className="overflow-x-auto rounded-row bg-ink p-4 font-mono text-sm leading-relaxed text-paper">{code}</pre>
    </section>
  );
}

export function JoinStatus(): ReactNode {
  const { applicationId = "" } = useParams<{ applicationId: string }>();
  const [lang, setLang] = useState<Lang>("en");
  const t = makeJoinT(lang);
  const [status, setStatus] = useState<RegistrationStatusResponse | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [purposeCode, setPurposeCode] = useState("<your purpose code>");
  const [processorUrl, setProcessorUrl] = useState("https://<the Processor's address>");

  // Follow the application until it is decided; then one more read has already delivered the key.
  useEffect(() => {
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      try {
        const next = await fetchStatus(applicationId);
        if (!live) return;
        setStatus(next);
        setProblem(null);
        if (next.status === "pending") timer = setTimeout(() => void tick(), POLL_MS);
      } catch (err) {
        if (!live) return;
        setProblem(err instanceof ApiError && err.status === 404 ? "No application has this address." : "Cannot reach Sammati. Retrying…");
        if (!(err instanceof ApiError && err.status === 404)) timer = setTimeout(() => void tick(), POLL_MS);
      }
    };
    void tick();
    return () => {
      live = false;
      if (timer) clearTimeout(timer);
    };
  }, [applicationId]);

  const approved = status?.status === "approved" ? status.result : null;
  useEffect(() => {
    if (!approved) return;
    void fetchPurposes(approved.fiduciary).then((purposes) => purposes[0] && setPurposeCode(purposes[0].code));
    void fetchProcessorUrl().then(setProcessorUrl).catch(() => undefined); // the placeholder stays if Core cannot say
  }, [approved?.fiduciary]);

  const apiKey = approved ? (approved.apiKey ?? keysSeen.get(applicationId) ?? null) : null;
  const values: QuickstartValues | null = approved ? { coreUrl: CORE_URL, processorUrl, fiduciary: approved.fiduciary, apiKey, purposeCode } : null;
  const copyProps = { copyLabel: t("join_copy"), copiedLabel: t("join_copied") };

  return (
    <main className="min-h-screen bg-paper font-sans text-ink">
      <header className="bg-ink text-paper">
        <div className="mx-auto flex max-w-[720px] flex-wrap items-center justify-between gap-3 px-4 py-4">
          <Link to="/join" className="text-xl font-extrabold tracking-tight">
            Sammati
          </Link>
          <div role="group" aria-label="Language" className="flex overflow-hidden rounded-pill border border-paper/40">
            {LANGS.map(([code, label]) => (
              <button key={code} type="button" aria-pressed={lang === code} onClick={() => setLang(code)} className={`px-3 py-1.5 font-bold ${lang === code ? "bg-paper text-ink" : "text-paper"}`}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[720px] space-y-6 px-4 py-8" aria-live="polite">
        {problem && (
          <p role="alert" className="rounded-row border border-block/40 bg-block/10 p-3 font-bold text-block">
            <span aria-hidden="true">✕ </span>
            {problem}
          </p>
        )}

        {status?.status === "pending" && (
          <section className="space-y-2 rounded-pass border border-line bg-surface p-6">
            <h1 className="text-2xl font-extrabold">
              <span aria-hidden="true">◔ </span>
              {t("join_pending")}
            </h1>
            <p className="text-lg">{status.name}</p>
            <p className="text-mute">{t("join_pending_hint")}</p>
          </section>
        )}

        {status?.status === "rejected" && (
          <section className="space-y-2 rounded-pass border-2 border-block bg-surface p-6">
            <h1 className="text-2xl font-extrabold text-block">
              <span aria-hidden="true">✕ </span>
              {t("join_rejected")}
            </h1>
            <p className="text-lg">{status.name}</p>
            {status.note && <p className="rounded-row bg-paper p-3 text-lg">{status.note}</p>}
            <p className="text-mute">{t("join_rejected_hint")}</p>
            <Link to="/join" className="inline-block rounded-pill bg-ink px-5 py-2 font-bold text-paper">
              {t("join_submit")}
            </Link>
          </section>
        )}

        {status?.status === "approved" && approved && values && (
          <>
            <section className="space-y-4 rounded-pass border border-line bg-surface p-6">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-2xl font-extrabold">
                  <span aria-hidden="true" className="text-allow">
                    ✓{" "}
                  </span>
                  {t("join_approved", { name: status.name })}
                </h1>
                {approved.sandbox && <SandboxBadge />}
              </div>
              <div>
                <div className="text-sm font-bold text-mute">{t("join_address")}</div>
                <HashLabel value={approved.fiduciary} className="!text-lg !text-ink" />
              </div>
              <div>
                <div className="text-sm font-bold text-mute">{t("join_api_key")}</div>
                {apiKey ? (
                  <>
                    <div className="mt-1 break-all rounded-row bg-ink p-3 font-mono text-base text-paper" data-testid="api-key">
                      {apiKey}
                    </div>
                    <p className="mt-2 font-bold">
                      <span aria-hidden="true">⚠ </span>
                      {t("join_key_once")}
                    </p>
                  </>
                ) : (
                  <p className="mt-1 font-bold">
                    <span aria-hidden="true">ⓘ </span>
                    {t("join_key_seen")}
                  </p>
                )}
              </div>
              {approved.sandbox && <p className="rounded-row bg-paper p-3">{t("join_sandbox_note")}</p>}
            </section>

            <h2 className="text-2xl font-extrabold">{t("join_integrate")}</h2>
            <CodeBlock title="1" code={envLine(apiKey)} {...copyProps} />
            <CodeBlock title="2" code={gatewaySnippet(values)} {...copyProps} />
            <CodeBlock title={t("join_first_request")} code={targetedCurl(values)} {...copyProps} />
            <CodeBlock title={t("join_processor_howto")} code={processorCurl(values)} {...copyProps} />
            {!apiKey && <p className="text-sm text-mute">Placeholder shown for the key: {KEY_PLACEHOLDER}</p>}
          </>
        )}
      </div>
    </main>
  );
}
