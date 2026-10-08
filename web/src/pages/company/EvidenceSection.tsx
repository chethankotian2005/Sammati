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
      {/* Header (Hidden when printing) */}
      <div className="flex flex-wrap items-center justify-between gap-4 print:hidden">
        <div>
          <h2 className="text-2xl font-extrabold text-ink">Compliance Evidence Pack</h2>
          <p className="text-sm text-mute mt-1">
            Export cryptographic audit evidence for regulatory inspection under DPDP.
          </p>
        </div>

        <button
          type="button"
          onClick={handleGenerate}
          disabled={loading}
          aria-busy={loading}
          className="flex items-center gap-2 rounded-row bg-ink px-5 py-2.5 text-sm font-bold text-paper transition-all hover:bg-ink/90 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marigold"
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <svg className="animate-spin h-4 w-4 text-paper" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Generating pack…
            </span>
          ) : (
            <>
              <span aria-hidden="true">🗂</span> Generate compliance pack
            </>
          )}
        </button>
      </div>

      {error && (
        <div className="rounded-row bg-block/10 p-4 text-sm font-semibold text-block flex items-start gap-3 print:hidden" role="alert">
          <span className="text-lg">⚠</span>
          <div>
            <p className="font-bold">Generation failed</p>
            <p className="font-normal opacity-90">{error}</p>
          </div>
        </div>
      )}

      {loading ? (
        // Loading Skeleton
        <div className="space-y-6 rounded-pass border border-line bg-surface p-6 shadow-sm animate-pulse print:hidden" aria-hidden="true">
          <div className="flex justify-between border-b border-line pb-4">
            <div className="space-y-2 w-1/3">
              <div className="h-6 bg-line rounded w-3/4"></div>
              <div className="h-4 bg-line rounded w-1/2"></div>
            </div>
            <div className="h-10 bg-line rounded-row w-32"></div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-20 bg-paper rounded-row border border-line"></div>
            ))}
          </div>
          <div className="space-y-3 mt-6">
            <div className="h-5 bg-line rounded w-1/4"></div>
            <div className="h-48 bg-line rounded-row w-full"></div>
          </div>
        </div>
      ) : pack ? (
        <>
          {/* Printable Report View (Visible only when printing) */}
          <div className="hidden print:block space-y-6">
            <h1 className="text-3xl font-extrabold text-ink border-b-2 border-ink pb-4">Compliance Evidence Report</h1>
            
            <div className="flex justify-between items-end">
              <div>
                <h2 className="text-xl font-bold text-ink">{company.name}</h2>
                <p className="text-sm text-mute">Fiduciary Address: {company.address}</p>
              </div>
              <p className="text-sm font-semibold text-ink">
                Date: {new Date(pack.generatedAt * 1000).toLocaleString()}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4 border border-line p-4 rounded-row text-sm">
              <div>
                <strong className="text-mute uppercase tracking-wide text-xs block mb-1">Ledger Head</strong>
                <span className="font-mono">{pack.ledgerHead}</span>
              </div>
              <div>
                <strong className="text-mute uppercase tracking-wide text-xs block mb-1">Totals</strong>
                <span>{pack.consents.length} Consents, {pack.access.length} Access Logs</span>
              </div>
            </div>

            <div className="mt-8">
              <h3 className="text-lg font-bold border-b border-line pb-2 mb-4">On-Chain Anchors ({pack.batches.length})</h3>
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="bg-paper border-y border-line">
                    <th className="py-2 px-2">Batch</th>
                    <th className="py-2 px-2">Timestamp</th>
                    <th className="py-2 px-2">Range</th>
                    <th className="py-2 px-2">Merkle Root & TX Hash</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {pack.batches.map((b) => (
                    <tr key={b.index}>
                      <td className="py-2 px-2 font-bold">{b.index}</td>
                      <td className="py-2 px-2">{new Date(b.at * 1000).toLocaleString()}</td>
                      <td className="py-2 px-2">Seq {b.fromSeq}-{b.toSeq}</td>
                      <td className="py-2 px-2 font-mono text-xs">
                        <div>R: {b.merkleRoot}</div>
                        <div>T: {b.txHash}</div>
                      </td>
                    </tr>
                  ))}
                  {pack.batches.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-4 px-2 text-mute italic">No batches anchored yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Web View (Hidden when printing) */}
          <div className="space-y-6 rounded-pass border border-line bg-surface p-6 shadow-sm print:hidden">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-4">
              <div>
                <h3 className="font-extrabold text-ink text-xl">Pack Summary</h3>
                <p className="text-sm text-mute mt-1">
                  Generated at {new Date(pack.generatedAt * 1000).toLocaleString()}
                </p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="flex items-center gap-2 rounded-row border border-line bg-surface px-4 py-2 text-sm font-bold text-ink hover:bg-paper transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marigold"
                >
                  <span aria-hidden="true">🖨</span> Print Report
                </button>
                <button
                  type="button"
                  onClick={handleDownload}
                  className="flex items-center gap-2 rounded-row bg-marigold px-4 py-2 text-sm font-bold text-ink hover:opacity-90 transition-opacity shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
                >
                  <span aria-hidden="true">⬇</span> Download JSON
                </button>
              </div>
            </div>

            {/* High-level stats */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-row border border-line bg-paper p-4">
                <span className="text-xs font-bold uppercase tracking-wider text-mute">Ledger Head</span>
                <div className="mt-2 font-mono text-sm break-all text-ink font-medium">
                  <HashLabel value={pack.ledgerHead} />
                </div>
              </div>
              <div className="rounded-row border border-line bg-paper p-4 flex flex-col justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-mute">Consents</span>
                <div className="mt-2 text-2xl font-extrabold text-ink">
                  {pack.consents.length}
                </div>
              </div>
              <div className="rounded-row border border-line bg-paper p-4 flex flex-col justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-mute">Access Logs</span>
                <div className="mt-2 text-2xl font-extrabold text-ink">
                  {pack.access.length}
                </div>
              </div>
              <div className="rounded-row border border-line bg-paper p-4 flex flex-col justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-mute">Anchor Batches</span>
                <div className="mt-2 text-2xl font-extrabold text-ink">
                  {pack.batches.length}
                </div>
              </div>
            </div>

            {/* Anchor Links Table */}
            <div className="pt-4">
              <h4 className="font-extrabold text-ink mb-4 flex items-center gap-2">
                <span className="text-marigold text-lg">⛓</span>
                On-Chain Anchors
              </h4>
              
              {pack.batches.length === 0 ? (
                <div className="rounded-row border border-dashed border-line p-6 text-center text-mute bg-paper/50">
                  No access logs have been anchored to the ledger yet.
                </div>
              ) : (
                <div className="overflow-x-auto rounded-row border border-line">
                  <table className="w-full text-left text-sm whitespace-nowrap">
                    <thead className="bg-paper text-mute text-xs uppercase tracking-wider">
                      <tr>
                        <th className="py-3 px-4 font-bold border-b border-line">Batch</th>
                        <th className="py-3 px-4 font-bold border-b border-line">Timestamp</th>
                        <th className="py-3 px-4 font-bold border-b border-line">Coverage</th>
                        <th className="py-3 px-4 font-bold border-b border-line">Merkle Root</th>
                        <th className="py-3 px-4 font-bold border-b border-line text-right">Proof Link</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line bg-surface">
                      {pack.batches.map((b) => (
                        <tr key={b.index} className="transition-colors hover:bg-paper/50">
                          <td className="py-3 px-4 font-extrabold text-ink">{b.index}</td>
                          <td className="py-3 px-4 text-mute">
                            {new Date(b.at * 1000).toLocaleString([], { dateStyle: 'short', timeStyle: 'medium' })}
                          </td>
                          <td className="py-3 px-4">
                            <span className="bg-line/50 text-ink px-2 py-0.5 rounded text-xs font-semibold">
                              Seq {b.fromSeq} &rarr; {b.toSeq}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <HashLabel value={b.merkleRoot} />
                          </td>
                          <td className="py-3 px-4 text-right">
                            <a 
                              href={`https://amoy.polygonscan.com/tx/${b.txHash}`} 
                              target="_blank" 
                              rel="noreferrer"
                              className="inline-flex items-center gap-1.5 text-xs font-bold text-ink bg-white border border-line px-3 py-1.5 rounded-row shadow-sm hover:bg-paper hover:text-marigold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marigold"
                              aria-label={`View batch ${b.index} transaction on Polygon Scan`}
                            >
                              Verify <span className="font-mono text-[10px] opacity-70">({b.txHash.slice(0, 6)}…)</span> ↗
                            </a>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Raw JSON Preview */}
            <div className="pt-4">
              <h4 className="font-extrabold text-ink mb-3">Raw Evidence Payload</h4>
              <div className="relative group">
                <pre className="max-h-80 overflow-y-auto rounded-row bg-ink p-5 text-[11px] leading-relaxed font-mono text-paper/90 shadow-inner" tabIndex={0}>
                  {JSON.stringify(pack, null, 2)}
                </pre>
                <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button 
                    onClick={handleDownload}
                    className="bg-surface/10 hover:bg-surface/20 text-paper p-2 rounded backdrop-blur-sm transition-colors text-xs font-bold flex items-center gap-1"
                  >
                    ⬇ Download
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      ) : (
        // Empty State
        <div className="rounded-pass border-2 border-dashed border-line bg-paper/50 p-12 text-center flex flex-col items-center justify-center min-h-[300px] print:hidden">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-surface shadow-sm text-3xl mb-4 border border-line">
            🗂
          </div>
          <h3 className="text-xl font-extrabold text-ink">No pack generated</h3>
          <p className="mt-2 text-sm text-mute max-w-md mx-auto leading-relaxed">
            Generate a compliance pack to compile consent records, decision logs, Merkle anchors, and the ledger head into a single verifiable regulatory package.
          </p>
          <button
            type="button"
            onClick={handleGenerate}
            className="mt-6 flex items-center gap-2 rounded-row bg-ink px-6 py-2.5 text-sm font-bold text-paper transition-all hover:bg-ink/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marigold"
          >
            Generate Now
          </button>
        </div>
      )}
    </div>
  );
}

