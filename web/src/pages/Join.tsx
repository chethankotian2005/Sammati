/**
 * /join — a company applies to join Sammati (prd.md R-01, ui.md §3.2). Public, no login. The form is checked here
 * with the same rules Core applies (`validateApplication` in shared), then sent; Core creates a pending application
 * and nothing else: no company, no key, nothing on chain until the regulator approves.
 */
import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { validateApplication, type ApplicationInput } from "@sammati/shared";
import { ApiError, submitApplication } from "../api";
import { CategoryPicker } from "../join/CategoryPicker";
import { makeJoinT, type JoinKey, type Lang } from "../join/copy";

const LANGS: Array<[Lang, string]> = [["en", "EN"], ["hi", "हि"], ["kn", "ಕ"]];
const APPLICATION_KEY = "sammati.joinApplication";

interface PurposeForm {
  code: string;
  title: Record<Lang, string>;
  description: Record<Lang, string>;
  categories: string[];
  retention: string;
  shares: boolean;
  required: boolean;
}
interface ProcessorForm {
  name: string;
  purposeCode: string;
}

const empty = (): Record<Lang, string> => ({ en: "", hi: "", kn: "" });
const blankPurpose = (): PurposeForm => ({ code: "", title: empty(), description: empty(), categories: [], retention: "", shares: false, required: false });

/** The screen shows the form's text as typed; this is the value Core is sent. */
export function toInput(name: string, sector: string, email: string, purposes: PurposeForm[], processors: ProcessorForm[]): ApplicationInput {
  return {
    name,
    sector,
    contactEmail: email,
    purposes: purposes.map((p) => ({
      code: p.code,
      title: p.title,
      description: p.description,
      dataCategories: p.categories,
      retentionDays: p.retention.trim() === "" ? Number.NaN : Number(p.retention),
      sharesThirdParty: p.shares,
      required: p.required,
    })),
    processors: processors.map((p) => ({ name: p.name, purposeCode: p.purposeCode })),
  };
}

const inputClass = "mt-1 w-full rounded-row border border-line bg-surface px-3 py-2 text-base text-ink focus:border-marigold focus:outline-none aria-[invalid=true]:border-block";

export function Join(): ReactNode {
  const navigate = useNavigate();
  const [lang, setLang] = useState<Lang>("en");
  const t = makeJoinT(lang);

  const [name, setName] = useState("");
  const [sector, setSector] = useState("");
  const [email, setEmail] = useState("");
  const [purposes, setPurposes] = useState<PurposeForm[]>([blankPurpose()]);
  const [processors, setProcessors] = useState<ProcessorForm[]>([]);

  const [shown, setShown] = useState(false); // problems appear after the first attempt or once a field is left
  const [touched, setTouched] = useState(false);
  const [sending, setSending] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);

  const check = validateApplication(toInput(name, sector, email, purposes, processors));
  const problem = !check.ok && (shown || touched) ? check : null;
  const on = (field: string): string | null => (problem && problem.field === field ? problem.message : null);

  const submit = async () => {
    setShown(true);
    setRefusal(null);
    const result = validateApplication(toInput(name, sector, email, purposes, processors));
    if (!result.ok) {
      document.getElementById(result.field)?.focus();
      return;
    }
    setSending(true);
    try {
      const { applicationId } = await submitApplication(result.value);
      try {
        localStorage.setItem(APPLICATION_KEY, applicationId);
      } catch {
        // storage can be blocked: the address of the next page is enough to come back to
      }
      navigate(`/join/${applicationId}`);
    } catch (err) {
      setRefusal(
        err instanceof ApiError
          ? err.code === "NAME_TAKEN" || err.code === "RATE_LIMITED" || err.code === "TOO_MANY_PENDING" || err.code === "BAD_APPLICATION"
            ? err.message
            : `Core answered: ${err.message}`
          : "Cannot reach Sammati. Check your connection and try again.",
      );
    } finally {
      setSending(false);
    }
  };

  const setPurpose = (i: number, patch: Partial<PurposeForm>) => setPurposes(purposes.map((p, j) => (j === i ? { ...p, ...patch } : p)));

  const Err = ({ field }: { field: string }): ReactNode => {
    const message = on(field);
    return message ? (
      <p id={`${field}-error`} role="alert" className="mt-1 text-sm font-bold text-block">
        <span aria-hidden="true">✕ </span>
        {message}
      </p>
    ) : null;
  };
  const Label = ({ k }: { k: JoinKey }): ReactNode => <span className="text-sm font-bold text-ink">{t(k)}</span>;
  const field = (id: string) => ({ id, "aria-invalid": on(id) ? (true as const) : undefined, "aria-describedby": on(id) ? `${id}-error` : undefined, onBlur: () => setTouched(true) });

  return (
    <main className="min-h-screen bg-paper font-sans text-ink">
      <header className="bg-ink text-paper">
        <div className="mx-auto flex max-w-[720px] flex-wrap items-center justify-between gap-3 px-4 py-4">
          <span className="text-xl font-extrabold tracking-tight">Sammati</span>
          <div role="group" aria-label="Language" className="flex overflow-hidden rounded-pill border border-paper/40">
            {LANGS.map(([code, label]) => (
              <button key={code} type="button" aria-pressed={lang === code} onClick={() => setLang(code)} className={`px-3 py-1.5 font-bold ${lang === code ? "bg-paper text-ink" : "text-paper"}`}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <form
        className="mx-auto max-w-[720px] space-y-8 px-4 py-8"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div>
          <h1 className="text-3xl font-extrabold">{t("join_title")}</h1>
          <p className="mt-2 text-lg text-mute">{t("join_intro")}</p>
        </div>

        <section className="space-y-4 rounded-pass border border-line bg-surface p-5">
          <label className="block">
            <Label k="join_company" />
            <input {...field("name")} value={name} onChange={(e) => setName(e.target.value)} className={inputClass} autoComplete="organization" />
            <Err field="name" />
          </label>
          <label className="block">
            <Label k="join_sector" />
            <input {...field("sector")} value={sector} onChange={(e) => setSector(e.target.value)} className={inputClass} />
            <Err field="sector" />
          </label>
          <label className="block">
            <Label k="join_email" />
            <input {...field("contactEmail")} type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} autoComplete="email" />
            <span className="mt-1 block text-sm text-mute">{t("join_email_note")}</span>
            <Err field="contactEmail" />
          </label>
        </section>

        <section className="space-y-4" aria-label={t("join_purposes")}>
          <h2 className="text-xl font-extrabold">{t("join_purposes")}</h2>
          <Err field="purposes" />
          {purposes.map((p, i) => (
            <fieldset key={i} className="space-y-4 rounded-pass border border-line bg-surface p-5">
              <legend className="px-1 text-sm font-extrabold text-mute">
                {i + 1}
              </legend>
              <label className="block">
                <Label k="join_code" />
                <input {...field(`purposes[${i}].code`)} value={p.code} onChange={(e) => setPurpose(i, { code: e.target.value })} className={`${inputClass} font-mono`} placeholder="loan_offers" />
                <Err field={`purposes[${i}].code`} />
              </label>
              {(["en", "hi", "kn"] as const).map((l) => (
                <div key={l} className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="text-sm font-bold text-ink">
                      {t("join_title_field")} · {l === "en" ? "English" : l === "hi" ? "हिन्दी" : "ಕನ್ನಡ"}
                    </span>
                    <input {...field(`purposes[${i}].title.${l}`)} value={p.title[l]} onChange={(e) => setPurpose(i, { title: { ...p.title, [l]: e.target.value } })} className={inputClass} />
                    <Err field={`purposes[${i}].title.${l}`} />
                  </label>
                  <label className="block">
                    <span className="text-sm font-bold text-ink">
                      {t("join_description")} · {l === "en" ? "English" : l === "hi" ? "हिन्दी" : "ಕನ್ನಡ"}
                    </span>
                    <input {...field(`purposes[${i}].description.${l}`)} value={p.description[l]} onChange={(e) => setPurpose(i, { description: { ...p.description, [l]: e.target.value } })} className={inputClass} />
                    <Err field={`purposes[${i}].description.${l}`} />
                  </label>
                </div>
              ))}
              <div className="block">
                <Label k="join_categories" />
                <CategoryPicker value={p.categories} onChange={(ids) => setPurpose(i, { categories: ids })} invalid={Boolean(on(`purposes[${i}].dataCategories`))} describedBy={`purposes[${i}].dataCategories-error`} />
                <Err field={`purposes[${i}].dataCategories`} />
              </div>
              <label className="block">
                <Label k="join_retention" />
                <input {...field(`purposes[${i}].retentionDays`)} inputMode="numeric" value={p.retention} onChange={(e) => setPurpose(i, { retention: e.target.value })} className={inputClass} />
                <Err field={`purposes[${i}].retentionDays`} />
              </label>
              <div className="flex flex-wrap gap-6">
                <label className="flex items-center gap-2 text-base font-bold">
                  <input type="checkbox" checked={p.shares} onChange={(e) => setPurpose(i, { shares: e.target.checked })} className="h-5 w-5 accent-ink" />
                  {t("join_shares")}
                </label>
                <label className="flex items-center gap-2 text-base font-bold">
                  <input type="checkbox" checked={p.required} onChange={(e) => setPurpose(i, { required: e.target.checked })} className="h-5 w-5 accent-ink" />
                  {t("join_required")}
                </label>
              </div>
              {purposes.length > 1 && (
                <button
                  type="button"
                  className="font-bold text-block"
                  onClick={() => {
                    setPurposes(purposes.filter((_, j) => j !== i));
                    setProcessors(processors.filter((x) => x.purposeCode !== p.code));
                  }}
                >
                  {t("join_remove")}
                </button>
              )}
            </fieldset>
          ))}
          {purposes.length < 8 && (
            <button type="button" className="rounded-pill border-2 border-ink px-4 py-2 font-bold" onClick={() => setPurposes([...purposes, blankPurpose()])}>
              + {t("join_add_purpose")}
            </button>
          )}
        </section>

        <section className="space-y-4" aria-label={t("join_processors")}>
          <h2 className="text-xl font-extrabold">{t("join_processors")}</h2>
          {processors.map((p, i) => (
            <div key={i} className="grid gap-3 rounded-pass border border-line bg-surface p-5 sm:grid-cols-[1fr_1fr_auto]">
              <label className="block">
                <Label k="join_processor_name" />
                <input {...field(`processors[${i}].name`)} value={p.name} onChange={(e) => setProcessors(processors.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} className={inputClass} />
                <Err field={`processors[${i}].name`} />
              </label>
              <label className="block">
                <Label k="join_processor_for" />
                <select
                  {...field(`processors[${i}].purposeCode`)}
                  value={p.purposeCode}
                  onChange={(e) => setProcessors(processors.map((x, j) => (j === i ? { ...x, purposeCode: e.target.value } : x)))}
                  className={inputClass}
                >
                  <option value="">—</option>
                  {purposes.filter((x) => x.code).map((x) => (
                    <option key={x.code} value={x.code}>
                      {x.code}
                    </option>
                  ))}
                </select>
                <Err field={`processors[${i}].purposeCode`} />
              </label>
              <button type="button" className="self-end pb-2 font-bold text-block" onClick={() => setProcessors(processors.filter((_, j) => j !== i))}>
                {t("join_remove")}
              </button>
            </div>
          ))}
          {processors.length < 6 && (
            <button type="button" className="rounded-pill border-2 border-ink px-4 py-2 font-bold" onClick={() => setProcessors([...processors, { name: "", purposeCode: "" }])}>
              + {t("join_add_processor")}
            </button>
          )}
        </section>

        {refusal && (
          <p role="alert" className="rounded-row border border-block/40 bg-block/10 p-3 font-bold text-block">
            <span aria-hidden="true">✕ </span>
            {refusal}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-4">
          <button type="submit" disabled={sending} className="min-h-[48px] rounded-pill bg-marigold px-6 text-lg font-extrabold text-ink disabled:opacity-60">
            {sending ? t("join_sending") : t("join_submit")}
          </button>
        </div>
      </form>
    </main>
  );
}

