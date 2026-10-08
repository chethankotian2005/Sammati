/**
 * LiveRequestsSection — C-04 & C-05:
 * "Live requests: two-column.
 *  Left: Simulator with big buttons ("Run credit check", "Send marketing SMS", "Share with bureau")
 *  firing real requests calling /v1/demo/fire.
 *  Right: feed with ALLOWED/BLOCKED, reason code, latency. Blocked rows use block left border
 *  and show "451 · Consent withdrawn"."
 */

import { useState, useMemo, type ReactNode } from "react";
import {
  DEMO_PRINCIPAL,
  type AccessReason,
  type Decision,
  type SeedFiduciary,
  type StoredAccessLogEntry,
} from "@sammati/shared";
import { StatusChip, HashLabel, VaultPanel, useVaultTimeline, formatInr } from "../../ui";
import { demoFire } from "../../api";

interface LiveRequestsSectionProps {
  company: SeedFiduciary;
  accessLogs: StoredAccessLogEntry[];
  newLogIds: Set<string>;
}

interface SimulatorButtonConfig {
  /** Two buttons can share a purpose (credit check and loan decision), so the purpose is not a key. */
  id: string;
  label: string;
  sublabel: string;
  purposeCode: string;
  endpoint: string;
  icon: string;
}

const COMPANY_BUTTONS: Record<string, SimulatorButtonConfig[]> = {
  quickloan: [
    {
      label: "Run credit check",
      sublabel: "Core service — checks credit eligibility",
      id: "credit_check",
      purposeCode: "credit_check",
      endpoint: "GET /customers/4821/credit-profile",
      icon: "💳",
    },
    {
      id: "loan_decision",
      label: "Run loan decision",
      sublabel: "Apply: the Processor decides from data QuickLoan never sees",
      purposeCode: "credit_check",
      endpoint: "POST /customers/4821/apply",
      icon: "✅",
    },
    {
      label: "Send marketing SMS",
      sublabel: "Promotional loan offers — requires marketing consent",
      id: "marketing",
      purposeCode: "marketing",
      endpoint: "POST /marketing/campaign/sms",
      icon: "📱",
    },
    {
      label: "Share with bureau",
      sublabel: "Downstream sharing with CreditBureauX",
      id: "bureau_share",
      purposeCode: "bureau_share",
      endpoint: "POST /bureau/sync",
      icon: "🏛",
    },
  ],
  medicare: [
    {
      label: "Access treatment records",
      sublabel: "Doctor diagnosis & medical history",
      id: "treatment",
      purposeCode: "treatment",
      endpoint: "GET /patients/4821/treatment-record",
      icon: "🩺",
    },
    {
      label: "File insurance claim",
      sublabel: "Submit billing & medical proof to InsureCo",
      id: "insurance_claim",
      purposeCode: "insurance_claim",
      endpoint: "POST /claims/file",
      icon: "📑",
    },
    {
      label: "Export to research lab",
      sublabel: "Anonymised records to ResearchLab",
      id: "research",
      purposeCode: "research",
      endpoint: "POST /research/export",
      icon: "🔬",
    },
  ],
  foodrush: [
    {
      label: "Access delivery location",
      sublabel: "Live GPS tracking for delivery rider",
      id: "delivery",
      purposeCode: "delivery",
      endpoint: "GET /orders/current/location",
      icon: "🛵",
    },
    {
      label: "Personalise food ads",
      sublabel: "AdNetworkZ targeting based on order history",
      id: "ad_targeting",
      purposeCode: "ad_targeting",
      endpoint: "POST /ads/recommendations",
      icon: "🍕",
    },
    {
      label: "Share with restaurant partner",
      sublabel: "Kitchen receipt details to restaurant",
      id: "partner_share",
      purposeCode: "partner_share",
      endpoint: "POST /orders/partner-dispatch",
      icon: "🍳",
    },
  ],
};

function formatReasonLabel(decision: Decision, reason: AccessReason): string {
  if (decision === "ALLOWED") return "200 · Allowed";
  switch (reason) {
    case "CONSENT_WITHDRAWN":
      return "451 · Consent withdrawn";
    case "CONSENT_EXPIRED":
      return "451 · Consent expired";
    case "NO_CONSENT":
      return "451 · No consent";
    case "LEDGER_UNAVAILABLE":
      return "451 · Ledger unavailable";
    case "NO_PRINCIPAL":
      return "451 · Missing principal identity";
    default:
      return `451 · ${reason}`;
  }
}

/** "Approved · limit 3,00,000 · SCORE_FAIR", from the Processor's answer relayed by QuickLoan; null for any other payload. */
export function loanOutcome(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null) return null;
  const p = payload as { decision?: unknown; limit?: unknown; reasonCodes?: unknown };
  if (p.decision !== "approved" && p.decision !== "declined") return null;
  const codes = Array.isArray(p.reasonCodes) ? p.reasonCodes.join(", ") : "";
  return p.decision === "approved"
    ? `Approved · limit ${formatInr(typeof p.limit === "number" ? p.limit : null)} · ${codes}`
    : `Declined · ${codes}`;
}

export function LiveRequestsSection({
  company,
  accessLogs,
  newLogIds,
}: LiveRequestsSectionProps): ReactNode {
  const [targetPrincipal, setTargetPrincipal] = useState(DEMO_PRINCIPAL);
  const [firingPurpose, setFiringPurpose] = useState<string | null>(null);
  const vaultEvents = useVaultTimeline(company.address);
  // An answer that is neither "allowed" nor a consent refusal (no data sent yet, data erased, Processor down).
  const [problem, setProblem] = useState<{ endpoint: string; status: number; code: string; message: string } | null>(null);
  const [lastFireResult, setLastFireResult] = useState<{
    purposeCode: string;
    endpoint: string;
    decision: Decision;
    reason: AccessReason;
    entryId?: string;
    payload?: unknown;
    statusText?: string;
  } | null>(null);

  // Filter for feed
  const [feedFilter, setFeedFilter] = useState<"all" | "allowed" | "blocked">("all");

  const buttons = COMPANY_BUTTONS[company.slug] ?? COMPANY_BUTTONS.quickloan!;

  const handleFire = async (btn: SimulatorButtonConfig) => {
    setFiringPurpose(btn.id);
    const [method, path] = btn.endpoint.split(" ");
    const companyUrl = `http://localhost:${company.port}${path}`;

    try {
      // 1. Hit the real company guarded backend directly
      const res = await fetch(companyUrl, {
        method: method || "GET",
        headers: {
          "Content-Type": "application/json",
          "x-sammati-principal": targetPrincipal,
        },
        body: method === "POST" ? JSON.stringify({ principal: targetPrincipal }) : undefined,
      });

      setProblem(null);
      if (res.status === 200) {
        const payload = await res.json();
        setLastFireResult({
          purposeCode: btn.purposeCode,
          endpoint: btn.endpoint,
          decision: "ALLOWED",
          reason: "OK",
          payload,
          statusText: "HTTP 200 OK — Consent valid",
        });
      } else if (res.status === 451) {
        const errData = await res.json();
        setLastFireResult({
          purposeCode: btn.purposeCode,
          endpoint: btn.endpoint,
          decision: "BLOCKED",
          reason: (errData.code as AccessReason) || "CONSENT_WITHDRAWN",
          payload: errData,
          statusText: `HTTP 451 Unavailable For Legal Reasons — ${errData.code}`,
        });
      } else if (btn.id === "loan_decision") {
        // The company answered, so there is nothing to fall back from: say what it said.
        const err = ((await res.json().catch(() => ({}))) as { error?: { code?: string; message?: string } }).error;
        setLastFireResult(null);
        setProblem({ endpoint: btn.endpoint, status: res.status, code: err?.code ?? "ERROR", message: err?.message ?? `HTTP ${res.status}` });
      } else {
        throw new Error(`Unexpected status ${res.status}`);
      }
    } catch {
      // 2. Fallback to Core demoFire if company server is not currently running
      try {
        const coreRes = await demoFire({
          fiduciary: company.address,
          purposeCode: btn.purposeCode,
          principal: targetPrincipal,
          endpoint: btn.endpoint,
        });
        setLastFireResult({
          purposeCode: btn.purposeCode,
          endpoint: btn.endpoint,
          decision: coreRes.decision,
          reason: coreRes.reason,
          entryId: coreRes.entryId,
          statusText: `Core fallback (${coreRes.decision})`,
        });
      } catch (err) {
        console.error("Fire failed:", err);
      }
    } finally {
      setFiringPurpose(null);
    }
  };

  const filteredLogs = useMemo(() => {
    if (feedFilter === "allowed") {
      return accessLogs.filter((l) => l.decision === "ALLOWED");
    }
    if (feedFilter === "blocked") {
      return accessLogs.filter((l) => l.decision === "BLOCKED");
    }
    return accessLogs;
  }, [accessLogs, feedFilter]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-extrabold text-ink">Live Requests & Simulator</h2>
        <p className="text-sm text-mute">
          Test real-time gateway policy enforcement against the consent ledger (C-04 / C-05).
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        {/* Left Column: Simulator with big buttons (5 cols) */}
        <div className="rounded-pass border border-line bg-surface p-6 shadow-sm lg:col-span-5 space-y-6">
          <div className="flex items-center justify-between border-b border-line pb-3">
            <div>
              <h3 className="font-extrabold text-ink">Simulator</h3>
              <p className="text-xs text-mute">
                Fires real HTTP requests into {company.name}'s gateway
              </p>
            </div>
            <span className="rounded-pill bg-marigold/15 px-2.5 py-1 text-xs font-extrabold text-ink">
              DEMO_MODE
            </span>
          </div>

          {/* Principal Target Picker */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-mute mb-1">
              Target Principal
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={targetPrincipal}
                onChange={(e) => setTargetPrincipal(e.target.value)}
                className="w-full rounded-row border border-line bg-surface px-3 py-2 text-xs font-mono text-ink focus:border-marigold focus:outline-none"
              />
            </div>
            <p className="text-[11px] text-mute mt-1">
              Default: Demo Principal Asha Sharma (<HashLabel value={DEMO_PRINCIPAL} />)
            </p>
          </div>

          {/* Big Action Buttons */}
          <div className="space-y-3">
            <label className="block text-xs font-bold uppercase tracking-wider text-mute">
              Action Endpoints
            </label>
            {buttons.map((btn) => {
              const isFiring = firingPurpose === btn.id;
              return (
                <button
                  key={btn.id}
                  type="button"
                  disabled={Boolean(firingPurpose)}
                  onClick={() => handleFire(btn)}
                  className="w-full text-left rounded-pass border-2 border-line bg-surface p-4 hover:border-marigold hover:bg-paper/40 transition-all active:scale-[0.99] disabled:opacity-50"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{btn.icon}</span>
                      <div>
                        <div className="font-extrabold text-ink text-sm">
                          {btn.label}
                        </div>
                        <div className="text-xs text-mute mt-0.5">
                          {btn.sublabel}
                        </div>
                      </div>
                    </div>
                    {isFiring ? (
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-marigold border-t-transparent" />
                    ) : (
                      <span className="text-mute font-mono text-xs">POST →</span>
                    )}
                  </div>
                  <div className="mt-2.5 flex items-center gap-2 border-t border-line/60 pt-2 text-[11px] text-mute font-mono">
                    <span className="rounded bg-paper px-1.5 py-0.5">{btn.endpoint}</span>
                    <span>purpose: {btn.purposeCode}</span>
                  </div>
                </button>
              );
            })}
          </div>

          {problem && (
            <div className="rounded-pass border border-line bg-paper p-4 text-sm" role="status" data-testid="fire-problem">
              <div className="font-extrabold text-ink">No decision: {problem.status} · {problem.code}</div>
              <div className="mt-1 text-xs text-mute">{problem.message}</div>
              <div className="mt-1 font-mono text-[11px] text-mute">{problem.endpoint}</div>
            </div>
          )}

          {/* Last Fire Feedback */}
          {lastFireResult && (
            <div
              className={`rounded-pass border p-4 animate-feed-enter ${
                lastFireResult.decision === "ALLOWED"
                  ? "border-allow/30 bg-allow/5 text-allow"
                  : "border-block/30 bg-block/5 text-block"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider">
                  Gateway Decision:
                </span>
                <span
                  className={`rounded-pill px-2.5 py-0.5 text-xs font-extrabold ${
                    lastFireResult.decision === "ALLOWED"
                      ? "bg-allow text-paper"
                      : "bg-block text-paper"
                  }`}
                >
                  {lastFireResult.decision}
                </span>
              </div>
              <div className="mt-2 text-xs font-mono font-bold">
                {formatReasonLabel(lastFireResult.decision, lastFireResult.reason)}
              </div>
              <div className="mt-1 text-[11px] text-mute font-mono">
                Endpoint: {lastFireResult.endpoint}
              </div>
              {loanOutcome(lastFireResult.payload) ? (
                <div className="mt-2 text-sm font-extrabold text-ink" data-testid="loan-outcome">
                  {loanOutcome(lastFireResult.payload)}
                </div>
              ) : null}
              {lastFireResult.payload ? (
                <div className="mt-3 border-t border-line/40 pt-2">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-mute mb-1">
                    {lastFireResult.decision !== "ALLOWED"
                      ? "DPDP 451 Block Response:"
                      : company.slug === "quickloan" && lastFireResult.purposeCode === "credit_check"
                        ? "Response (QuickLoan holds no customer data):"
                        : "Guarded Data Payload (drd.md §5):"}
                  </div>
                  <pre className="max-h-36 overflow-y-auto rounded-row bg-ink p-2.5 text-[11px] font-mono text-paper">
                    {JSON.stringify(lastFireResult.payload, null, 2)}
                  </pre>
                </div>
              ) : null}
            </div>
          )}
        </div>

        {/* Right Column: Live Feed with ALLOWED/BLOCKED (7 cols) */}
        <div className="rounded-pass border border-line bg-surface p-6 shadow-sm lg:col-span-7 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-allow" />
              <h3 className="font-extrabold text-ink">Live Enforcement Feed</h3>
            </div>

            {/* Filter pills */}
            <div className="flex items-center rounded-pill border border-line bg-surface p-1 text-xs">
              <button
                type="button"
                onClick={() => setFeedFilter("all")}
                className={`rounded-pill px-3 py-1 font-bold transition-colors ${
                  feedFilter === "all" ? "bg-ink text-paper" : "text-mute hover:text-ink"
                }`}
              >
                All ({accessLogs.length})
              </button>
              <button
                type="button"
                onClick={() => setFeedFilter("allowed")}
                className={`rounded-pill px-3 py-1 font-bold transition-colors ${
                  feedFilter === "allowed" ? "bg-allow text-paper" : "text-mute hover:text-ink"
                }`}
              >
                Allowed
              </button>
              <button
                type="button"
                onClick={() => setFeedFilter("blocked")}
                className={`rounded-pill px-3 py-1 font-bold transition-colors ${
                  feedFilter === "blocked" ? "bg-block text-paper" : "text-mute hover:text-ink"
                }`}
              >
                Blocked
              </button>
            </div>
          </div>

          {/* Feed List */}
          <div className="space-y-2.5 max-h-[640px] overflow-y-auto pr-1">
            {filteredLogs.length === 0 ? (
              <div className="rounded-row border border-dashed border-line p-12 text-center text-sm text-mute">
                No request logs found for this filter.
              </div>
            ) : (
              filteredLogs.map((log) => {
                const isBlocked = log.decision === "BLOCKED";
                const isNew = newLogIds.has(log.id);

                return (
                  <div
                    key={log.id}
                    className={`rounded-row border bg-surface p-3.5 shadow-sm transition-all animate-feed-enter ${
                      isBlocked
                        ? "border-l-4 border-l-block border-line"
                        : "border-l-4 border-l-allow border-line"
                    } ${isNew ? (isBlocked ? "animate-wash-block" : "animate-wash-allow") : ""}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <StatusChip
                            variant={isBlocked ? "blocked" : "allowed"}
                            label={log.decision}
                          />
                          <span
                            className={`text-xs font-extrabold ${
                              isBlocked ? "text-block" : "text-allow"
                            }`}
                          >
                            {formatReasonLabel(log.decision, log.reason)}
                          </span>
                        </div>
                        <div className="font-mono text-xs font-semibold text-ink">
                          {log.endpoint}
                        </div>
                      </div>

                      <div className="text-right text-xs">
                        <span className="font-mono font-bold text-ink">
                          {log.latencyMs}ms
                        </span>
                        <div className="text-[11px] text-mute">
                          {new Date(log.at * 1000).toLocaleTimeString()}
                        </div>
                      </div>
                    </div>

                    <div className="mt-2.5 flex items-center justify-between border-t border-line/60 pt-2 text-[11px] text-mute">
                      <div className="flex items-center gap-1.5">
                        <span>Principal:</span>
                        <HashLabel value={log.principal} />
                      </div>
                      <div className="flex items-center gap-2 font-mono">
                        <span>seq #{log.seq}</span>
                        <span>•</span>
                        <span>purpose: {log.purposeCode}</span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Confidential processing (V-05, V-06): what this company holds, and the Processor's timeline */}
      {company.slug === "quickloan" && <VaultPanel company={company.name} events={vaultEvents} />}
    </div>
  );
}
