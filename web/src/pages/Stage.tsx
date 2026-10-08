import { SEED_FIDUCIARIES } from "@sammati/shared";
import { CoreChip } from "../components";

export function Stage() {
  return (
    <main className="min-h-screen bg-ink p-8 text-paper">
      <header className="mb-8 flex items-center justify-between">
        <h1 className="text-[28px] font-extrabold">Sammati</h1>
        <CoreChip />
      </header>
      <div className="grid gap-6 lg:grid-cols-[1fr_3fr_1fr]">
        <section className="rounded-pass bg-white/10 p-5">
          <h2 className="text-xl font-bold">Citizen</h2>
        </section>
        <section className="grid gap-4 md:grid-cols-3">
          {SEED_FIDUCIARIES.map((f) => (
            <div key={f.slug} className="rounded-pass bg-white/10 p-5" style={{ borderTop: `4px solid ${f.color}` }}>
              <h2 className="text-xl font-bold">{f.name}</h2>
            </div>
          ))}
        </section>
        <section className="rounded-pass bg-white/10 p-5">
          <h2 className="text-xl font-bold">Ledger</h2>
        </section>
      </div>
    </main>
  );
}
