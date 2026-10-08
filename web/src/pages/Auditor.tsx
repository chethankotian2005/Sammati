import { CoreChip, Placeholder } from "../components";

export function Auditor() {
  return (
    <main className="mx-auto max-w-5xl p-8">
      <header className="mb-8 flex items-center justify-between">
        <h1 className="text-[28px] font-extrabold">Auditor</h1>
        <CoreChip />
      </header>
      <div className="grid gap-4 md:grid-cols-3">
        <Placeholder title="Scorecards">One per company, with an integrity state.</Placeholder>
        <Placeholder title="Ledger explorer">Every grant, withdrawal and anchor.</Placeholder>
        <Placeholder title="Verify">Recompute the log and compare it with the chain.</Placeholder>
      </div>
    </main>
  );
}
