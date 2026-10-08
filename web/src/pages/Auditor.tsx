/**
 * Auditor Page — Regulator Auditor View (/auditor).
 * Implements features:
 *   - A-01: Company compliance scorecards
 *   - A-02: Ledger explorer with filters
 *   - A-03: Verify integrity flow with staged progress & dramatic mismatch view (hero moment)
 *   - A-04: Printable regulator report page
 *   - Presenter shortcuts: Ctrl+Shift+T (tamper demo), Ctrl+Shift+R (demo reset)
 */

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import type { LedgerEventView, Scorecard } from "@sammati/shared";
import { CoreChip } from "../components";
import { WsIndicator } from "../ui/WsIndicator";
import {
  fetchAuditScorecards,
  fetchLedgerEvents,
  triggerDemoReset,
  triggerTamper,
} from "../api";
import { useAnchorPosted, useConsentUpdated, useTamperAlert } from "../ws";

import { ScorecardsSection } from "./auditor/ScorecardsSection";
import { LedgerExplorerSection } from "./auditor/LedgerExplorerSection";
import { VerifyModal } from "./auditor/VerifyModal";
import { ReportModal } from "./auditor/ReportModal";

export function Auditor(): ReactNode {
  const [activeTab, setActiveTab] = useState<"scorecards" | "ledger">("scorecards");
  const [scorecards, setScorecards] = useState<Scorecard[]>([]);
  const [ledgerEvents, setLedgerEvents] = useState<LedgerEventView[]>([]);
  const [loading, setLoading] = useState(true);

  // Active modals
  const [verifyingCompany, setVerifyingCompany] = useState<Scorecard | null>(null);
  const [reportingCompany, setReportingCompany] = useState<Scorecard | null>(null);

  // Presenter notification banner
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 5000);
  };

  const loadData = useCallback(async () => {
    try {
      const [sc, le] = await Promise.all([
        fetchAuditScorecards(),
        fetchLedgerEvents(),
      ]);
      setScorecards(sc);
      setLedgerEvents(le);
    } catch (err) {
      console.warn("Failed to load audit data:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Live WebSocket updates
  useAnchorPosted(() => void loadData());
  useConsentUpdated(() => void loadData());
  useTamperAlert(() => {
    void loadData();
    showToast("⚠ Tamper alert received over WebSocket! Regulator flagged integrity drift.");
  });

  // Handler for presenter tamper shortcut (Ctrl+Shift+T)
  const handleTamper = useCallback(
    async (targetScorecard?: Scorecard) => {
      const target = targetScorecard || scorecards[0];
      if (!target) return;
      try {
        const res = await triggerTamper(target.fiduciary);
        showToast(
          `⚡ [PRESENTER] Mutated stored log row seq #${res.seq} for ${target.name}. Run "Verify integrity" to reveal the mismatch!`,
        );
        void loadData();
        // Automatically open verify modal on the tampered company for maximum dramatic effect!
        setVerifyingCompany(target);
      } catch (err) {
        showToast(err instanceof Error ? err.message : "Tamper failed");
      }
    },
    [scorecards, loadData],
  );

  // Handler for presenter reset shortcut (Ctrl+Shift+R)
  const handleReset = useCallback(async () => {
    try {
      await triggerDemoReset();
      showToast("✓ Demo database reset to clean seed state.");
      void loadData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Reset failed");
    }
  }, [loadData]);

  // Keyboard shortcuts listener: Ctrl+Shift+T (Tamper), Ctrl+Shift+R (Reset)
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "t") {
        e.preventDefault();
        void handleTamper();
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "r") {
        e.preventDefault();
        void handleReset();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleTamper, handleReset]);

  return (
    <div className="min-h-screen bg-paper text-ink pb-16">
      {/* Top Banner for Presenter Toast */}
      {toastMessage && (
        <div className="sticky top-0 z-40 bg-ink px-4 py-2.5 text-center text-xs font-extrabold text-paper shadow-md transition-all animate-feed-enter border-b border-marigold">
          <span className="text-marigold mr-2">●</span>
          {toastMessage}
        </div>
      )}

      {/* Navigation Top Bar */}
      <header className="border-b border-line bg-surface px-6 py-4 shadow-sm">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-extrabold tracking-tight text-ink">
              <Link
                to="/auditor"
                className="flex items-center gap-2"
                aria-label="Auditor"
              >
                <span aria-hidden="true">⚖</span>
                <span>Auditor</span>
              </Link>
            </h1>
            <span className="rounded-pill bg-marigold/15 px-2.5 py-0.5 text-xs font-extrabold text-ink">
              Regulator Board
            </span>
          </div>

          <div className="flex items-center gap-3">
            {/* Nav tabs */}
            <div className="flex items-center rounded-pill border border-line bg-paper p-1 text-xs font-bold">
              <button
                type="button"
                onClick={() => setActiveTab("scorecards")}
                className={`rounded-pill px-3 py-1.5 transition-colors ${
                  activeTab === "scorecards"
                    ? "bg-ink text-paper"
                    : "text-mute hover:text-ink"
                }`}
              >
                Scorecards (A-01)
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("ledger")}
                className={`rounded-pill px-3 py-1.5 transition-colors ${
                  activeTab === "ledger"
                    ? "bg-ink text-paper"
                    : "text-mute hover:text-ink"
                }`}
              >
                Ledger Explorer (A-02)
              </button>
            </div>

            {/* Presenter Action Buttons */}
            <button
              type="button"
              onClick={() => handleTamper()}
              title="Shortcut: Ctrl+Shift+T"
              className="flex items-center gap-1.5 rounded-row border border-line bg-surface px-3 py-1.5 text-xs font-bold text-block hover:bg-block/5 transition-colors"
            >
              <span>⚡</span>
              Tamper demo <kbd className="font-mono text-[10px] text-mute">^⇧T</kbd>
            </button>

            <button
              type="button"
              onClick={() => handleReset()}
              title="Shortcut: Ctrl+Shift+R"
              className="rounded-row border border-line bg-surface px-2.5 py-1.5 text-xs font-bold text-mute hover:text-ink transition-colors"
            >
              Reset
            </button>

            <WsIndicator />
            <CoreChip />

            <Link
              to="/company/quickloan"
              className="rounded-row border border-line bg-surface px-3 py-1.5 text-xs font-bold text-ink hover:bg-paper transition-colors"
            >
              Company consoles →
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="mx-auto max-w-7xl px-6 pt-8">
        {loading ? (
          <div className="py-24 text-center text-sm font-semibold text-mute">
            Loading regulator audit data…
          </div>
        ) : activeTab === "scorecards" ? (
          <ScorecardsSection
            scorecards={scorecards}
            onVerify={(company) => setVerifyingCompany(company)}
            onViewReport={(company) => setReportingCompany(company)}
            onTamper={(company) => handleTamper(company)}
          />
        ) : (
          <LedgerExplorerSection
            events={ledgerEvents}
            onFilterChange={(params) => {
              void fetchLedgerEvents(params).then((e) => setLedgerEvents(e));
            }}
          />
        )}
      </main>

      {/* Verification Modal (A-03 Hero Moment) */}
      <VerifyModal
        open={Boolean(verifyingCompany)}
        scorecard={verifyingCompany}
        onClose={() => setVerifyingCompany(null)}
        onVerificationFinished={() => void loadData()}
      />

      {/* Printable Report Modal (A-04) */}
      <ReportModal
        open={Boolean(reportingCompany)}
        scorecard={reportingCompany}
        onClose={() => setReportingCompany(null)}
      />
    </div>
  );
}
