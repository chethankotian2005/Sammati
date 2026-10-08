/**
 * ReportModal — A-04:
 * "Report: printable page: company, period, verification result, evidence list, anchor links."
 * Supports one-click window.print() formatting.
 */

import { useEffect, useState, type ReactNode } from "react";
import type { AuditReportResponse, Scorecard } from "@sammati/shared";
import { HashLabel, StatusChip } from "../../ui";
import { fetchAuditReport } from "../../api";

interface ReportModalProps {
  open: boolean;
  scorecard: Scorecard | null;
  onClose: () => void;
}

export function ReportModal({
  open,
  scorecard,
  onClose,
}: ReportModalProps): ReactNode {
  const [reportData, setReportData] = useState<AuditReportResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !scorecard) {
      setReportData(null);
      return;
    }

    let isMounted = true;
    setLoading(true);
    setError(null);

    fetchAuditReport(scorecard.fiduciary)
      .then((data) => {
        if (isMounted) setReportData(data);
      })
      .catch((err) => {
        if (isMounted) setError(err instanceof Error ? err.message : "Failed to load report");
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [open, scorecard]);

  if (!open || !scorecard) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 print:p-0 print:static"
    >
      {/* Scrim (hidden during print) */}
      <div
        className="fixed inset-0 bg-ink/70 backdrop-blur-sm transition-opacity print:hidden"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal / Printable Paper */}
      <div className="relative z-10 w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-pass border border-line bg-surface p-8 shadow-2xl print:max-h-none print:shadow-none print:border-none print:p-6 print:m-0">
        {/* Controls bar (hidden in print) */}
        <div className="mb-6 flex items-center justify-between border-b border-line pb-4 print:hidden">
          <div className="flex items-center gap-2">
            <span className="text-sm font-extrabold text-ink">Evidence pack</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="flex items-center gap-1.5 rounded-row bg-ink px-4 py-2 text-xs font-extrabold text-paper hover:opacity-95"
            >
              <span>🖨</span>
              Print / Save PDF
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-row border border-line bg-paper px-3 py-2 text-xs font-bold text-ink hover:bg-white"
            >
              Close
            </button>
          </div>
        </div>

        {/* Printable Report Document */}
        <article className="space-y-6 text-ink print:text-black">
          {/* Official Document Header */}
          <div className="border-b-2 border-ink pb-4">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-extrabold tracking-tight">
                  Consent and access evidence report
                </h1>
                <p className="text-xs text-mute uppercase tracking-wider font-bold mt-0.5">
                  Sammati · ledger and access-log evidence
                </p>
              </div>
              <div className="text-right text-xs">
                <div className="font-extrabold text-ink">Date of Audit</div>
                <div className="text-mute font-mono">
                  {new Date().toLocaleDateString([], {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Company Details Banner */}
          <div className="grid grid-cols-2 gap-4 rounded-row bg-paper p-4 text-xs">
            <div>
              <span className="text-mute font-bold uppercase tracking-wider text-[10px]">
                Data Fiduciary
              </span>
              <div className="text-base font-extrabold text-ink mt-0.5">
                {scorecard.name}
              </div>
              <div className="text-mute">{scorecard.sector}</div>
            </div>

            <div>
              <span className="text-mute font-bold uppercase tracking-wider text-[10px]">
                On-Chain Address
              </span>
              <div className="font-mono text-xs font-bold text-ink mt-0.5 break-all">
                {scorecard.fiduciary}
              </div>
              <div className="mt-1">
                <StatusChip
                  variant={
                    scorecard.integrity === "verified"
                      ? "verified"
                      : scorecard.integrity === "tampered"
                      ? "tampered"
                      : "unverified"
                  }
                />
              </div>
            </div>
          </div>

          {/* Audit Metrics Table */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-mute mb-2">
              1. Consent & Enforcement Ledger Totals
            </h3>
            <div className="grid grid-cols-4 gap-2 text-center text-xs border border-line rounded-row p-3">
              <div className="border-r border-line">
                <div className="text-mute">Active Consents</div>
                <div className="text-base font-extrabold text-ink mt-1">
                  {scorecard.activeConsents}
                </div>
              </div>
              <div className="border-r border-line">
                <div className="text-mute">Withdrawn</div>
                <div className="text-base font-extrabold text-block mt-1">
                  {scorecard.withdrawnConsents}
                </div>
              </div>
              <div className="border-r border-line">
                <div className="text-mute">Access Allowed</div>
                <div className="text-base font-extrabold text-allow mt-1">
                  {scorecard.allowed}
                </div>
              </div>
              <div>
                <div className="text-mute">Access Blocked</div>
                <div className="text-base font-extrabold text-block mt-1">
                  {scorecard.blocked}
                </div>
              </div>
            </div>
          </div>

          {/* Verification Result */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-mute mb-2">
              2. Log integrity check (A-03)
            </h3>
            {reportData ? (
              <div
                className={`rounded-row border p-4 text-xs ${
                  reportData.verification.ok
                    ? "border-allow/30 bg-allow/5 text-allow"
                    : "border-block/30 bg-block/5 text-block"
                }`}
              >
                <div className="flex items-center gap-2 font-bold text-sm">
                  <span>{reportData.verification.ok ? "✓" : "⚠"}</span>
                  <span>
                    {reportData.verification.ok
                      ? "MATCH: the access log hash chain matches the on-chain Merkle anchors"
                      : "MISMATCH: the stored access log does not match its on-chain anchors"}
                  </span>
                </div>
                <p className="mt-1 text-ink text-xs">
                  {reportData.verification.ok
                    ? `All ${reportData.verification.batches.length} batches verified monotonic with 0 sequence gaps.`
                    : "The stored log differs from what was anchored. That is a finding about the log's integrity, not a legal finding."}
                </p>
              </div>
            ) : (
              <div className="p-3 text-xs text-mute">Loading verification…</div>
            )}
          </div>

          {/* Evidence List */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-mute mb-2">
              3. Recent Immutable On-Chain Evidence
            </h3>
            {loading ? (
              <p className="text-xs text-mute">Loading ledger events…</p>
            ) : error ? (
              <p className="text-xs text-block">{error}</p>
            ) : reportData && reportData.recentEvents.length > 0 ? (
              <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1 print:max-h-none">
                {reportData.recentEvents.slice(0, 8).map((evt) => (
                  <div
                    key={evt.id}
                    className="flex items-center justify-between border-b border-line/60 pb-1.5 text-[11px] font-mono"
                  >
                    <div>
                      <span className="font-bold uppercase text-ink">{evt.type}</span>
                      <span className="text-mute ml-2">Block #{evt.blockNumber}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-mute">Tx:</span>
                      <HashLabel value={evt.txHash} />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-mute">No recent events found.</p>
            )}
          </div>

          {/* Legal Sign-off Footer */}
          <div className="border-t border-line pt-6 text-[11px] text-mute flex items-end justify-between">
            <div className="space-y-1">
              <div>Sammati Consent Ledger & Gateway Verifier v0.1.0</div>
              <div>Cryptographically audited against ConsentRegistry & AccessAnchor contracts.</div>
            </div>
            <div className="text-right">
              <div className="font-bold text-ink uppercase">Auditor Session Stamp</div>
              <div className="font-mono text-allow font-bold">SHA-256 / EIP-712 VERIFIED</div>
            </div>
          </div>
          {/* Scope and limits (L-02): say what the report is, and is not */}
          <div className="rounded-row border border-line bg-paper p-3 text-[11px] text-mute" data-testid="report-scope">
            <div className="font-extrabold text-ink">Scope and limits</div>
            <p className="mt-1">
              This report lists evidence from the consent ledger and the company&apos;s access log, and whether that log matches its on-chain
              anchors. It is not a legal finding and does not certify that anyone complies with any law. How Sammati lines up with the
              principles of India&apos;s DPDP Act, 2023, and which points are still unchecked, is in <span className="font-mono">docs/dpdp-mapping.md</span>.
              Use only made-up data while Sammati is a prototype.
            </p>
          </div>
        </article>
      </div>
    </div>
  );
}
