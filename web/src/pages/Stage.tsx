import { useEffect, useState } from "react";
import {
  SEED_FIDUCIARIES,
  type StoredAccessLogEntry,
  type LedgerEventView,
} from "@sammati/shared";
import { CoreChip } from "../components";
import { HashLabel, VaultTimeline, useVaultTimeline } from "../ui";
import { fetchAccessLogs, fetchLedgerEvents } from "../api";
import {
  useAccessLogged,
  useAnchorPosted,
  useCascadeUpdated,
  useConsentUpdated,
} from "../ws";
import { Feed } from "../ui/FeedRow";
import type { FeedRowData } from "../ui/FeedRow";

// --- Citizen Event Row ---
function CitizenEvent({ text, time, txHash }: { text: string; time: number; txHash?: string }) {
  return (
    <div className="flex animate-feed-enter flex-col gap-1 rounded-row border border-line bg-surface px-4 py-3 text-sm text-ink mb-2">
      <div className="font-bold">{text}</div>
      <div className="flex items-center justify-between text-xs text-mute mt-1">
        <span>{new Date(time * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
        {txHash && <HashLabel value={txHash} />}
      </div>
    </div>
  );
}

// --- Ledger Event Row ---
function LedgerEventRow({ evt }: { evt: LedgerEventView }) {
  return (
    <div className="flex animate-feed-enter flex-col gap-1 rounded-row border border-white/10 bg-white/5 px-4 py-3 text-sm text-paper mb-2">
      <div className="flex items-center justify-between mb-1">
        <span className="font-bold uppercase tracking-wider text-marigold">{evt.type}</span>
        <span className="text-xs text-mute/70">
          {new Date(evt.at * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </span>
      </div>
      <div className="flex items-center justify-between text-xs text-paper/80 mt-1">
        <span>TX</span>
        <HashLabel value={evt.txHash} className="text-paper/80" />
      </div>
      {evt.ledgerHead && (
        <div className="flex items-center justify-between text-xs text-paper/80 mt-1">
          <span>HEAD</span>
          <HashLabel value={evt.ledgerHead} className="text-paper/80" />
        </div>
      )}
    </div>
  );
}

export function Stage() {
  const [accessLogsByFid, setAccessLogsByFid] = useState<Record<string, StoredAccessLogEntry[]>>({});
  const [newLogIds, setNewLogIds] = useState<Set<string>>(new Set());
  
  const [ledgerEvents, setLedgerEvents] = useState<LedgerEventView[]>([]);
  const quickLoan = SEED_FIDUCIARIES.find((f) => f.slug === "quickloan")!;
  const vaultEvents = useVaultTimeline(quickLoan.address);
  
  // Custom wallet events
  const [walletEvents, setWalletEvents] = useState<{ id: string; text: string; time: number; txHash?: string }[]>([]);

  // Initial Data Load
  useEffect(() => {
    async function load() {
      try {
        const evts = await fetchLedgerEvents();
        setLedgerEvents(evts.slice(0, 50));
        
        const logsMap: Record<string, StoredAccessLogEntry[]> = {};
        for (const fid of SEED_FIDUCIARIES) {
          logsMap[fid.address] = await fetchAccessLogs(fid.address, 20);
        }
        setAccessLogsByFid(logsMap);
      } catch (err) {
        console.warn("Stage load failed:", err);
      }
    }
    void load();
  }, []);

  // Live Subscriptions
  useAccessLogged((evt) => {
    setAccessLogsByFid((prev) => {
      const existing = prev[evt.fiduciary] || [];
      const newEntry: StoredAccessLogEntry = {
        id: evt.entryId,
        seq: evt.seq,
        fiduciary: evt.fiduciary,
        principal: evt.principal,
        purposeCode: evt.purposeCode,
        decision: evt.decision,
        reason: evt.reason,
        endpoint: evt.endpoint,
        latencyMs: 12,
        at: evt.at,
        prevHash: "0x0",
        hash: "0x0",
        batchIndex: null,
      };
      return { ...prev, [evt.fiduciary]: [newEntry, ...existing] };
    });
    setNewLogIds((prev) => new Set(prev).add(evt.entryId));
  });

  useConsentUpdated((evt) => {
    const fid = SEED_FIDUCIARIES.find((f) => f.address.toLowerCase() === evt.fiduciary.toLowerCase());
    const action = evt.status === "Active" ? "Granted consent to" : evt.status === "Withdrawn" ? "Withdrew consent from" : "Updated consent for";
    const text = `${action} ${fid?.name || "Company"}`;
    
    setWalletEvents((prev) => [
      { id: evt.txHash + evt.at, text, time: evt.at, txHash: evt.txHash },
      ...prev
    ]);
    
    setLedgerEvents((prev) => [
      {
        id: Math.random(),
        type: evt.status === "Active" ? "granted" : "withdrawn",
        principal: evt.principal,
        fiduciary: evt.fiduciary,
        purposeId: evt.purposeId,
        txHash: evt.txHash,
        blockNumber: 0,
        ledgerHead: null,
        at: evt.at,
        payload: null,
        explorerUrl: "",
      },
      ...prev,
    ]);
  });

  useCascadeUpdated((evt) => {
    const text = `Cascade ACK: ${evt.processorName}`;
    const time = evt.notifiedAt || evt.ackedAt || Date.now() / 1000;
    setWalletEvents((prev) => [
      { id: `cascade-${evt.processor}-${time}`, text, time },
      ...prev
    ]);
  });

  useAnchorPosted((evt) => {
    setLedgerEvents((prev) => [
      {
        id: Math.random(),
        type: "anchor",
        principal: null,
        fiduciary: evt.fiduciary,
        purposeId: null,
        txHash: evt.txHash,
        blockNumber: 0,
        ledgerHead: evt.merkleRoot,
        at: Date.now() / 1000,
        payload: null,
        explorerUrl: "",
      },
      ...prev,
    ]);
  });

  return (
    <main className="h-screen w-screen overflow-hidden bg-ink text-paper flex flex-col font-manrope selection:bg-marigold selection:text-ink">
      {/* Optional presenter hint banner */}
      <div className="bg-marigold text-ink text-center py-1.5 font-bold text-sm tracking-wide shadow-sm">
        Sammati Live Demo · The Golden Path
      </div>
      
      <div className="flex-1 flex flex-col p-6 min-h-0">
        <header className="mb-6 flex items-center justify-between">
          <h1 className="text-[32px] font-extrabold tracking-tight">Sammati</h1>
          <CoreChip />
        </header>

        <div className="grid grid-cols-[1.2fr_1fr_1fr_1fr_1.3fr] gap-6 flex-1 min-h-0">
          
          {/* Column 1: Citizen */}
          <section className="flex flex-col min-h-0">
            <h2 className="text-2xl font-bold mb-4">Citizen</h2>
            
            <div className="aspect-[9/19] w-full max-w-[280px] mx-auto border-2 border-dashed border-white/20 rounded-3xl flex items-center justify-center text-white/30 text-sm mb-4 shrink-0 bg-black/20 overflow-hidden shadow-inner relative">
              <span className="absolute z-10">[ scrcpy window space ]</span>
            </div>
            
            <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
              <h3 className="text-xs font-bold uppercase tracking-wider text-mute/70 mb-3">Wallet Activity</h3>
              <div className="flex flex-col">
                {walletEvents.length === 0 ? (
                  <p className="text-sm text-mute/50 italic">Waiting for events...</p>
                ) : (
                  walletEvents.map((w) => (
                    <CitizenEvent key={w.id} text={w.text} time={w.time} txHash={w.txHash} />
                  ))
                )}
              </div>
            </div>
          </section>

          {/* Columns 2-4: Companies */}
          {SEED_FIDUCIARIES.map((f) => {
            const rawLogs = accessLogsByFid[f.address] || [];
            const rows: FeedRowData[] = rawLogs.map((log) => ({
              id: log.id,
              companyColor: f.color,
              companyName: f.name,
              purposeCode: log.purposeCode,
              decision: log.decision,
              reason: log.reason,
              endpoint: log.endpoint,
              at: log.at,
              latencyMs: log.latencyMs,
            }));

            return (
              <section 
                key={f.slug} 
                className="flex flex-col min-h-0 rounded-pass bg-paper p-5 text-ink shadow-lg" 
                style={{ borderTop: `6px solid ${f.color}` }}
              >
                <div className="flex items-center gap-3 mb-4">
                  <span className="h-4 w-4 rounded-full shadow-sm" style={{ backgroundColor: f.color }} />
                  <h2 className="text-xl font-extrabold">{f.name}</h2>
                </div>
                {f.slug === "quickloan" && (
                  <div className="mb-3 rounded-row border border-line bg-surface p-3" data-testid="stage-vault">
                    <div className="mb-2 flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-mute">
                      <span>Confidential processing</span>
                      <span title="A separate service with an in-memory key, not real hardware protection">simulated enclave</span>
                    </div>
                    <VaultTimeline events={vaultEvents} compact />
                  </div>
                )}
                <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                  <Feed rows={rows} newIds={newLogIds} emptyMessage="No requests yet." />
                </div>
              </section>
            );
          })}

          {/* Column 5: Ledger */}
          <section className="flex flex-col min-h-0 rounded-pass bg-white/5 border border-white/10 p-5 shadow-lg">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-marigold text-xl">⛓</span>
              <h2 className="text-xl font-extrabold text-white">Ledger Ticker</h2>
            </div>
            <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar flex flex-col">
              {ledgerEvents.length === 0 ? (
                <p className="text-sm text-mute/50 italic">Syncing chain state...</p>
              ) : (
                ledgerEvents.map((evt) => (
                  <LedgerEventRow key={evt.id} evt={evt} />
                ))
              )}
            </div>
          </section>

        </div>
      </div>
      
      {/* Scrollbar styling injected to document for this view */}
      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(150, 150, 150, 0.3);
          border-radius: 4px;
        }
      `}} />
    </main>
  );
}
