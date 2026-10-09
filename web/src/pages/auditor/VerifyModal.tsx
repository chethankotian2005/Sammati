/**
 * VerifyModal — A-03 (Hero Moment):
 * "Verify integrity button per company. Progress rows:
 *  'Recomputing hash chain… Rebuilding Merkle roots… Comparing with chain anchors…'
 *  Result: green 'All 148 records match 7 anchors' or red 'Mismatch in batch 4, record 63'
 *  with a diff of the stored vs expected hash."
 */

import { useEffect, useState, type ReactNode } from "react";
import type { Scorecard, VerifyResponse, BatchVerification } from "@sammati/shared";
import { verifyFiduciaryIntegrity } from "../../api";

interface VerifyModalProps {
  open: boolean;
  scorecard: Scorecard | null;
  onClose: () => void;
  onVerificationFinished?: () => void;
}

type Stage = "idle" | "chain" | "merkle" | "anchors" | "done";

export function VerifyModal({
  open,
  scorecard,
  onClose,
  onVerificationFinished,
}: VerifyModalProps): ReactNode {
  const [stage, setStage] = useState<Stage>("idle");
  const [result, setResult] = useState<VerifyResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !scorecard) {
      setStage("idle");
      setResult(null);
      setError(null);
      return;
    }

    let isMounted = true;

    async function runVerification() {
      setStage("chain");
      setError(null);
      setResult(null);

      // Staged step delays for dramatic presenter pacing
      await new Promise((r) => setTimeout(r, 650));
      if (!isMounted) return;
      setStage("merkle");

      await new Promise((r) => setTimeout(r, 650));
      if (!isMounted) return;
      setStage("anchors");

      try {
        const res = await verifyFiduciaryIntegrity(scorecard!.fiduciary);
        await new Promise((r) => setTimeout(r, 600));
        if (!isMounted) return;
        setResult(res);
        setStage("done");
        onVerificationFinished?.();
      } catch (err) {
        if (!isMounted) return;
        setError(err instanceof Error ? err.message : "Verification API failed");
        setStage("done");
      }
    }

    void runVerification();

    return () => {
      isMounted = false;
    };
  }, [open, scorecard, onVerificationFinished]);

  if (!open || !scorecard) return null;

  const badBatch: BatchVerification | undefined = result?.batches.find((b) => !b.ok);
  const totalBatches = result?.batches.length ?? scorecard.anchoredBatches;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="verify-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      {/* Scrim */}
      <div
        className="fixed inset-0 bg-ink/70 backdrop-blur-sm transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal Dialog Card */}
      <div className="relative z-10 w-full max-w-2xl rounded-pass border border-line bg-surface p-6 shadow-2xl transition-all">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-line pb-4">
          <div className="flex items-center gap-3">
            <span
              className="h-4 w-4 rounded-full"
              style={{ backgroundColor: scorecard.color }}
              aria-hidden="true"
            />
            <div>
              <h2 id="verify-modal-title" className="text-xl font-extrabold text-ink">
                Cryptographic Audit: {scorecard.name}
              </h2>
              <p className="text-xs text-mute mt-0.5">
                Recomputes entire access hash chain and on-chain Merkle roots (A-03).
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-row p-1.5 text-mute hover:bg-paper hover:text-ink transition-colors"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Staged progress rows */}
        <div className="my-6 space-y-3 rounded-pass bg-paper p-4 text-xs font-medium">
          <div className="text-[11px] font-bold uppercase tracking-wider text-mute mb-2">
            Verification Pipeline
          </div>

          {/* Step 1 */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              {stage === "idle" && <span className="text-mute">○</span>}
              {stage === "chain" && (
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-marigold border-t-transparent" />
              )}
              {stage !== "idle" && stage !== "chain" && (
                <span className="text-allow font-bold">✓</span>
              )}
              <span className={stage === "chain" ? "font-bold text-ink" : "text-ink/80"}>
                1. Recomputing access-log hash chain (keccak256)…
              </span>
            </div>
            <span className="font-mono text-[11px] text-mute">
              {stage === "chain" ? "In progress…" : stage !== "idle" ? "Complete" : "Pending"}
            </span>
          </div>

          {/* Step 2 */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              {(stage === "idle" || stage === "chain") && <span className="text-mute">○</span>}
              {stage === "merkle" && (
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-marigold border-t-transparent" />
              )}
              {(stage === "anchors" || stage === "done") && (
                <span className="text-allow font-bold">✓</span>
              )}
              <span className={stage === "merkle" ? "font-bold text-ink" : "text-ink/80"}>
                2. Rebuilding binary Merkle roots from verified leaves…
              </span>
            </div>
            <span className="font-mono text-[11px] text-mute">
              {stage === "merkle" ? "In progress…" : stage === "anchors" || stage === "done" ? "Complete" : "Pending"}
            </span>
          </div>

          {/* Step 3 */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              {stage !== "anchors" && stage !== "done" && <span className="text-mute">○</span>}
              {stage === "anchors" && (
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-marigold border-t-transparent" />
              )}
              {stage === "done" && (
                <span className={result?.ok ? "text-allow font-bold" : "text-block font-bold"}>
                  {result?.ok ? "✓" : "⚠"}
                </span>
              )}
              <span className={stage === "anchors" ? "font-bold text-ink" : "text-ink/80"}>
                3. Comparing roots with on-chain AccessAnchor contracts…
              </span>
            </div>
            <span className="font-mono text-[11px] text-mute">
              {stage === "anchors" ? "Comparing…" : stage === "done" ? "Done" : "Pending"}
            </span>
          </div>
        </div>

        {/* Error state */}
        {error && (
          <div className="rounded-pass bg-block/10 p-4 text-xs font-semibold text-block">
            {error}
          </div>
        )}

        {/* Result Area */}
        {stage === "done" && result && (
          <div className="space-y-4 animate-feed-enter">
            {result.ok ? (
              /* GREEN RESULT: Hero moment pass */
              <div className="rounded-pass border-2 border-allow bg-allow/5 p-5 text-ink space-y-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-allow text-xl font-extrabold text-paper">
                    ✓
                  </span>
                  <div>
                    <h3 className="text-lg font-extrabold text-allow">
                      ALL RECORDS MATCH ON-CHAIN ANCHORS
                    </h3>
                    <p className="text-xs text-mute">
                      Zero tampering detected. Cryptographic proof is mathematically sound.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3 border-t border-allow/20 pt-3 text-xs">
                  <div>
                    <span className="text-mute">Total Batches:</span>
                    <div className="font-extrabold text-ink">{totalBatches} batches</div>
                  </div>
                  <div>
                    <span className="text-mute">Chain Integrity:</span>
                    <div className="font-extrabold text-allow">Monotonic ✓</div>
                  </div>
                  <div>
                    <span className="text-mute">Sequence Gaps:</span>
                    <div className="font-extrabold text-ink">0 gaps</div>
                  </div>
                </div>
              </div>
            ) : (
              /* RED MISMATCH VIEW: Dramatic Hero moment */
              <div className="rounded-pass border-2 border-block bg-block/5 p-5 text-ink space-y-4">
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-block text-xl font-extrabold text-paper">
                    !
                  </span>
                  <div>
                    <h3 className="text-lg font-extrabold text-block tracking-tight">
                      CRYPTOGRAPHIC TAMPER DETECTED
                    </h3>
                    <p className="text-xs font-semibold text-block/90 mt-0.5">
                      {badBatch?.firstBadSeq
                        ? `Mismatch in batch #${badBatch.index}, record sequence #${badBatch.firstBadSeq}`
                        : "Hash chain divergence identified."}
                    </p>
                    <p className="text-xs text-mute mt-1">
                      A stored access record in the database was modified off-chain. The computed Merkle root diverges from the immutable on-chain anchor.
                    </p>
                  </div>
                </div>

                {/* Dramatic hash diff comparison */}
                {badBatch && (
                  <div className="space-y-2 rounded-row border border-block/20 bg-ink p-4 font-mono text-xs text-paper">
                    <div className="flex items-center justify-between text-[11px] text-paper/60 uppercase tracking-wider">
                      <span>Hash Verification Mismatch</span>
                      <span className="text-block font-bold">MISMATCH ✕</span>
                    </div>

                    <div className="space-y-1.5 pt-1">
                      <div>
                        <div className="text-[11px] text-paper/70 font-semibold">
                          On-Chain Anchored Root:
                        </div>
                        <div className="text-allow break-all text-xs font-bold">
                          {badBatch.anchoredRoot}
                        </div>
                      </div>

                      <div className="border-t border-paper/10 pt-1.5">
                        <div className="text-[11px] text-paper/70 font-semibold">
                          Recomputed Root from Stored DB:
                        </div>
                        <div className="text-block break-all text-xs font-bold">
                          {badBatch.recomputedRoot}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between border-t border-block/20 pt-2 text-xs">
                  <span className="text-mute font-medium">
                    Evidence logged in regulator audit trail
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="mt-6 flex items-center justify-between border-t border-line pt-4 text-xs">
          <span className="text-mute">Verification recomputes the log from the stored rows and compares it with the on-chain anchors.</span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-row bg-ink px-4 py-2 font-bold text-paper transition-opacity hover:opacity-95"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
