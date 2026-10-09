/**
 * ScorecardsSection — A-01:
 * "One card per company with a compliance scorecard (grants, withdrawals, allowed,
 *  blocked, avg withdrawal-to-block latency, pending acknowledgements, integrity status)."
 */

import { type ReactNode } from "react";
import type { Scorecard } from "@sammati/shared";
import { HashLabel, StatusChip } from "../../ui";

interface ScorecardsSectionProps {
  scorecards: Scorecard[];
  onVerify: (company: Scorecard) => void;
  onViewReport: (company: Scorecard) => void;
}

export function ScorecardsSection({
  scorecards,
  onVerify,
  onViewReport,
}: ScorecardsSectionProps): ReactNode {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-ink">Company scorecards</h2>
          <p className="text-sm text-mute">
            Live overview of consent grants, enforcement blocks, and cryptographic integrity state (A-01).
          </p>
        </div>
      </div>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-6">
        {scorecards.map((sc) => {
          return (
            <div
              key={sc.fiduciary}
              className="flex flex-col justify-between rounded-pass border border-line bg-surface p-6 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden"
              style={{ borderTop: `4px solid ${sc.color}` }}
            >
              {/* Header */}
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-extrabold text-ink">{sc.name}</h3>
                    <span className="text-xs font-semibold text-mute">{sc.sector}</span>
                  </div>
                  <StatusChip
                    variant={
                      sc.integrity === "verified"
                        ? "verified"
                        : sc.integrity === "tampered"
                        ? "tampered"
                        : "unverified"
                    }
                  />
                </div>

                <div className="mt-2 flex items-center gap-1.5 text-xs text-mute font-mono">
                  <span>Fiduciary:</span>
                  <HashLabel value={sc.fiduciary} />
                </div>

                {/* Metrics Grid */}
                <div className="mt-5 grid grid-cols-2 gap-3 border-t border-line/60 pt-4 text-xs">
                  <div className="rounded-row bg-paper/60 p-2.5">
                    <span className="text-[11px] font-semibold text-mute">Active Consents</span>
                    <div className="text-base font-extrabold text-ink mt-0.5">
                      {sc.activeConsents}
                    </div>
                  </div>

                  <div className="rounded-row bg-paper/60 p-2.5">
                    <span className="text-[11px] font-semibold text-mute">Withdrawn</span>
                    <div className="text-base font-extrabold text-block mt-0.5">
                      {sc.withdrawnConsents}
                    </div>
                  </div>

                  <div className="rounded-row bg-paper/60 p-2.5">
                    <span className="text-[11px] font-semibold text-mute">Allowed (200)</span>
                    <div className="text-base font-extrabold text-allow mt-0.5">
                      {sc.allowed}
                    </div>
                  </div>

                  <div className="rounded-row bg-paper/60 p-2.5">
                    <span className="text-[11px] font-semibold text-mute">Blocked (451)</span>
                    <div className="text-base font-extrabold text-block mt-0.5">
                      {sc.blocked}
                    </div>
                  </div>

                  <div className="rounded-row bg-paper/60 p-2.5 col-span-2 flex items-center justify-between">
                    <div>
                      <span className="text-[11px] font-semibold text-mute">On-chain Batches</span>
                      <div className="text-xs font-extrabold text-ink mt-0.5">
                        {sc.anchoredBatches} anchored
                      </div>
                    </div>
                    <div>
                      <span className="text-[11px] font-semibold text-mute">Access without valid consent</span>
                      <div className={`text-xs font-extrabold text-right mt-0.5 ${sc.violations > 0 ? "text-block" : "text-allow"}`}>
                        {sc.violations}
                      </div>
                    </div>
                  </div>

                  <div className="rounded-row bg-paper/60 p-2.5 col-span-2 flex items-center justify-between">
                    <div>
                      <span className="text-[11px] font-semibold text-mute">Erasure requests</span>
                      <div className="text-xs font-extrabold text-ink mt-0.5">
                        {sc.erasureRequests}
                      </div>
                    </div>
                    <div>
                      <span className="text-[11px] font-semibold text-mute">Grievances (open / total)</span>
                      <div className={`text-xs font-extrabold text-right mt-0.5 ${sc.openGrievances > 0 ? "text-marigold" : "text-ink"}`}>
                        {sc.openGrievances} / {sc.grievanceRequests}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="mt-6 flex items-center gap-2 border-t border-line/60 pt-4">
                <button
                  type="button"
                  onClick={() => onVerify(sc)}
                  className="flex-1 rounded-row bg-ink py-2 text-xs font-extrabold text-paper transition-opacity hover:opacity-95"
                >
                  Verify integrity
                </button>
                <button
                  type="button"
                  onClick={() => onViewReport(sc)}
                  className="rounded-row border border-line bg-paper px-3 py-2 text-xs font-extrabold text-ink transition-colors hover:bg-white"
                >
                  Report
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
