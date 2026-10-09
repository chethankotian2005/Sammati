/**
 * Company Console Page — /company/:id
 * Implements features:
 *   - C-01: Purpose registry (table + Add purpose drawer in 3 languages)
 *   - C-02: Consent request QR (alias, purposes, large QR, "Waiting for scan…", "Consent received")
 *   - C-04: Live request feed (ALLOWED/BLOCKED, reason code, latency, 451 border-l)
 *   - C-04: live request feed
 *   - C-07: Consent table (live table of customers by purpose with status, filterable)
 *   - C-06 / C-08: Processors view and Compliance Evidence pack
 */

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Navigate, useParams } from "react-router-dom";
import { LOGIN_REQUIRED } from "../core";
import { storedConsoleToken } from "../session";
import {
  type ConsentRow,
  type NoticePurpose,
  type FiduciaryInfo,
  type StoredAccessLogEntry,
} from "@sammati/shared";
import { ConsoleLayout, HashLabel, SandboxBadge } from "../ui";
import { useDirectory } from "../directory";
import type { RailSection } from "../ui";
import { fetchAccessLogs, fetchConsents, fetchPurposes } from "../api";
import { useAccessLogged, useConsentUpdated } from "../ws";

import { OverviewSection } from "./company/OverviewSection";
import { PurposesSection } from "./company/PurposesSection";
import { NewRequestSection } from "./company/NewRequestSection";
import { LiveRequestsSection } from "./company/LiveRequestsSection";
import { ConsentsSection } from "./company/ConsentsSection";
import { ExpiringConsents } from "./company/ExpiringConsents";
import { ProcessorsSection } from "./company/ProcessorsSection";
import { EvidenceSection } from "./company/EvidenceSection";
import { RightsInboxSection } from "./company/RightsInboxSection";

export function Company(): ReactNode {
  const { id } = useParams<{ id: string }>();
  const directory = useDirectory();
  // A hosted console is for signed-in operators; Core refuses its reads without the token anyway (trd.md §10.8).
  if (LOGIN_REQUIRED && !storedConsoleToken()) return <Navigate to="/console/login" replace />;
  const company = directory.bySlug(id);
  if (directory.status === "loading") return <CenteredNote>Loading companies…</CenteredNote>;
  if (directory.status === "error") return <CenteredNote>Cannot load the companies. Is Core running?</CenteredNote>;
  if (!company) {
    const first = directory.fiduciaries[0];
    return first ? <Navigate to={`/company/${first.slug}`} replace /> : <CenteredNote>No company is registered yet.</CenteredNote>;
  }

  return <CompanyConsole company={company} />;
}

function CenteredNote({ children }: { children: ReactNode }): ReactNode {
  return <main className="grid min-h-screen place-items-center bg-paper p-6 text-lg font-bold text-mute">{children}</main>;
}

function CompanyConsole({ company }: { company: FiduciaryInfo }): ReactNode {
  const [activeSection, setActiveSection] = useState<RailSection>("overview");

  // State: purposes, consents, access logs
  const [purposes, setPurposes] = useState<NoticePurpose[]>([]);

  const [consents, setConsents] = useState<ConsentRow[]>([]);
  const [accessLogs, setAccessLogs] = useState<StoredAccessLogEntry[]>([]);
  const [newLogIds, setNewLogIds] = useState<Set<string>>(new Set());

  // Initial fetch for the fiduciary
  const reloadData = useCallback(async () => {
    try {
      const [pData, cData, aData] = await Promise.all([
        fetchPurposes(company.address),
        fetchConsents(company.address),
        fetchAccessLogs(company.address, 50),
      ]);

      if (pData.length > 0) {
        setPurposes(pData);
      }
      setConsents(cData);
      setAccessLogs(aData);
    } catch (err) {
      console.warn("Failed to load company data:", err);
    }
  }, [company.address]);

  useEffect(() => {
    void reloadData();
  }, [reloadData]);

  // Live WebSocket subscriptions
  useAccessLogged((event) => {
    if (event.fiduciary.toLowerCase() === company.address.toLowerCase()) {
      const newEntry: StoredAccessLogEntry = {
        id: event.entryId,
        seq: event.seq,
        fiduciary: event.fiduciary,
        principal: event.principal,
        purposeCode: event.purposeCode,
        decision: event.decision,
        reason: event.reason,
        endpoint: event.endpoint,
        latencyMs: 14,
        at: event.at,
        prevHash: "0x0",
        hash: "0x0",
        batchIndex: null,
      };

      setAccessLogs((prev) => [newEntry, ...prev]);
      setNewLogIds((prev) => new Set(prev).add(event.entryId));
    }
  });

  useConsentUpdated((event) => {
    if (event.fiduciary.toLowerCase() === company.address.toLowerCase()) {
      // Refresh consents list when consent state changes
      void fetchConsents(company.address).then((c) => setConsents(c));
    }
  });

  return (
    <ConsoleLayout
      activeSection={activeSection}
      onSectionChange={setActiveSection}
    >
      {/* Company Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-line pb-4">
        <div className="flex items-center gap-3">
          <span
            className="h-4 w-4 rounded-full shadow-sm"
            style={{ backgroundColor: company.color }}
            aria-hidden="true"
          />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-extrabold text-ink">{company.name}</h1>
              <span className="rounded-pill bg-paper px-2 py-0.5 text-xs font-bold text-mute border border-line">
                {company.sector}
              </span>
              {company.sandbox && <SandboxBadge />}
            </div>
            <div className="flex items-center gap-2 text-xs text-mute mt-0.5">
              <span>Fiduciary:</span>
              <HashLabel value={company.address} />
            </div>
          </div>
        </div>

        {/* Action shortcut pills */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveSection("new-request")}
            className={`flex items-center gap-1.5 rounded-row px-3 py-1.5 text-xs font-bold transition-all ${
              activeSection === "new-request"
                ? "bg-marigold text-ink shadow-sm"
                : "border border-line bg-surface text-ink hover:bg-paper"
            }`}
          >
            <span>⌖</span>
            New request
          </button>
          <button
            type="button"
            onClick={() => setActiveSection("live-requests")}
            className={`flex items-center gap-1.5 rounded-row px-3 py-1.5 text-xs font-bold transition-all ${
              activeSection === "live-requests"
                ? "bg-marigold text-ink shadow-sm"
                : "border border-line bg-surface text-ink hover:bg-paper"
            }`}
          >
            <span>⚡</span>
            Live requests
          </button>
        </div>
      </div>

      {/* Main Section Content */}
      {activeSection === "overview" && (
        <OverviewSection
          company={company}
          consents={consents}
          accessLogs={accessLogs}
          newLogIds={newLogIds}
          onRequestNew={() => setActiveSection("new-request")}
          onNavigateToLive={() => setActiveSection("live-requests")}
        />
      )}

      {activeSection === "new-request" && (
        <NewRequestSection
          company={company}
          purposes={purposes}
          onConsentReceived={() => {
            void fetchConsents(company.address).then((c) => setConsents(c));
          }}
          onOpenConsents={() => setActiveSection("consents")}
        />
      )}

      {activeSection === "purposes" && (
        <PurposesSection
          company={company}
          purposes={purposes}
          onRefreshPurposes={() => {
            void fetchPurposes(company.address).then((p) => {
              if (p.length > 0) setPurposes(p);
            });
          }}
        />
      )}

      {activeSection === "consents" && (
        <div className="space-y-6">
          <ExpiringConsents company={company} purposes={purposes} />
          <ConsentsSection
            company={company}
            consents={consents}
            purposes={purposes}
            onRequestNew={() => setActiveSection("new-request")}
          />
        </div>
      )}

      {activeSection === "live-requests" && (
        <LiveRequestsSection
          company={company}
          accessLogs={accessLogs}
          newLogIds={newLogIds}
        />
      )}

      {activeSection === "processors" && (
        <ProcessorsSection company={company} purposes={purposes} />
      )}

      {activeSection === "evidence" && (
        <EvidenceSection company={company} />
      )}

      {activeSection === "rights-inbox" && (
        <RightsInboxSection company={company} />
      )}
    </ConsoleLayout>
  );
}
