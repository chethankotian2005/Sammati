/**
 * EvidenceSection — Compliance export pack (C-08):
 * "Evidence: Generate compliance pack button, preview, download."
 */

import { useState, type ReactNode } from "react";
import type { ExportResponse, SeedFiduciary } from "@sammati/shared";
import { HashLabel } from "../../ui";
import { fetchExport } from "../../api";

interface EvidenceSectionProps {
  company: SeedFiduciary;
}

export function EvidenceSection({ company }: EvidenceSectionProps): ReactNode {
  const [pack, setPack] = useState<ExportResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchExport(company.address);
      setPack(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate export pack");
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = () => {
    if (!pack) return;
    const blob = new Blob([JSON.stringify(pack, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sammati-evidence-${company.slug}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-ink">Compliance Evidence Pack</h2>
          <p className="text-sm text-mute">
            Export cryptographic audit evidence for regulatory inspection under DPDP (C-08).
          </p>
        </div>

        <button
          type="button"
          onClick={handleGenerate}
          disabled={loading}
          className="flex items-center gap-2 rounded-row bg-ink px-4 py-2 text-sm font-bold text-paper transition-colors hover:bg-ink/90 disabled:opacity-50"
        >
          <span>🗂</span>
          {loading ? "Generating pack…" : "Generate compliance pack"}
        </button>
      </div>

      {error && (
        <div className="rounded-row bg-block/10 p-3 text-xs font-semibold text-block">
          {error}
        </div>
      )}

      {pack ? (
        <div className="space-y-5 rounded-pass border border-line bg-surface p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
            <div>
              <h3 className="font-extrabold text-ink">Pack Summary</h3>
              <p className="text-xs text-mute">
                Generated at {new Date(pack.generatedAt * 1000).toLocaleString()}
              </p>
            </div>

            <button
              type="button"
              onClick={handleDownload}
              className="flex items-center gap-2 rounded-row border border-line bg-paper px-3 py-1.5 text-xs font-bold text-ink hover:bg-white"
            >
              <span>⬇</span>
              Download JSON Evidence
            </button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 text-xs">
            <div className="rounded-row border border-line bg-paper/50 p-3">
              <span className="text-mute font-semibold">Ledger Head</span>
              <div className="mt-1 font-mono">
                <HashLabel value={pack.ledgerHead} />
              </div>
            </div>
            <div className="rounded-row border border-line bg-paper/50 p-3">
              <span className="text-mute font-semibold">Consents</span>
              <div className="mt-1 text-base font-extrabold text-ink">
                {pack.consents.length} records
              </div>
            </div>
            <div className="rounded-row border border-line bg-paper/50 p-3">
              <span className="text-mute font-semibold">Access Logs</span>
              <div className="mt-1 text-base font-extrabold text-ink">
                {pack.access.length} entries
              </div>
            </div>
            <div className="rounded-row border border-line bg-paper/50 p-3">
              <span className="text-mute font-semibold">Anchor Batches</span>
              <div className="mt-1 text-base font-extrabold text-ink">
                {pack.batches.length} batches
              </div>
            </div>
          </div>

          <div>
            <h4 className="font-bold text-ink text-xs uppercase tracking-wider mb-2">
              Raw Evidence Preview
            </h4>
            <pre className="max-h-80 overflow-y-auto rounded-row bg-ink p-4 text-[11px] font-mono text-paper/90">
              {JSON.stringify(pack, null, 2)}
            </pre>
          </div>
        </div>
      ) : (
        <div className="rounded-pass border border-line bg-surface p-12 text-center text-mute shadow-sm space-y-2">
          <div className="text-4xl text-mute/40">🗂</div>
          <div className="font-bold text-ink">No compliance pack generated yet</div>
          <p className="text-xs text-mute max-w-sm mx-auto">
            Click "Generate compliance pack" above to compile consent records, decision logs, Merkle anchors, and ledger head into a single verifiable package.
          </p>
        </div>
      )}
    </div>
  );
}
