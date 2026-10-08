import { Link, Navigate, useParams } from "react-router-dom";
import { SEED_FIDUCIARIES } from "@sammati/shared";
import { CoreChip, Placeholder } from "../components";

const RAIL = ["Overview", "Purposes", "Consents", "Live requests", "Processors", "Evidence"];

export function Company() {
  const { id } = useParams();
  const company = SEED_FIDUCIARIES.find((f) => f.slug === id);
  if (!company) return <Navigate to="/company/quickloan" replace />;

  return (
    <div className="flex min-h-screen">
      <nav aria-label="Console sections" className="w-56 shrink-0 bg-ink p-5 text-paper">
        <div className="mb-6 text-xl font-extrabold">Sammati</div>
        <ul className="space-y-1 text-sm">
          {RAIL.map((item) => (
            <li key={item} className="rounded-row px-3 py-2 hover:bg-white/10">
              {item}
            </li>
          ))}
        </ul>
      </nav>
      <main className="flex-1 p-8">
        <header className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="h-3 w-3 rounded-pill" style={{ backgroundColor: company.color }} />
            <h1 className="text-[28px] font-extrabold">{company.name}</h1>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex gap-1 rounded-pill border border-line bg-surface p-1 text-sm">
              {SEED_FIDUCIARIES.map((f) => (
                <Link
                  key={f.slug}
                  to={`/company/${f.slug}`}
                  aria-current={f.slug === id ? "page" : undefined}
                  className={`rounded-pill px-3 py-1 ${f.slug === id ? "bg-ink text-paper" : "text-mute"}`}
                >
                  {f.name}
                </Link>
              ))}
            </div>
            <CoreChip />
          </div>
        </header>
        <div className="grid gap-4 md:grid-cols-2">
          <Placeholder title="Live requests">ALLOWED and BLOCKED decisions will stream here.</Placeholder>
          <Placeholder title="Purposes">
            {company.purposes.map((p) => p.title.en).join(" · ")}
          </Placeholder>
        </div>
      </main>
    </div>
  );
}
