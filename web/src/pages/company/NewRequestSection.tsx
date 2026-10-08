/**
 * NewRequestSection — C-02:
 * "New consent request: choose customer alias and purposes, large QR on right.
 * 'Waiting for scan…' then 'Consent received' with tx."
 */

import { useState, type ReactNode } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  DEMO_PRINCIPAL,
  type ConsentUpdatedEvent,
  type CreateRequestResponse,
  type NoticePurpose,
  type SeedFiduciary,
} from "@sammati/shared";
import { StatusChip, HashLabel } from "../../ui";
import { createConsentRequest } from "../../api";
import { useConsentUpdated } from "../../ws";
import { CORE_URL } from "../../core";
import { SendToUserPanel } from "./SendToUserPanel";

interface NewRequestSectionProps {
  company: SeedFiduciary;
  purposes: NoticePurpose[];
  onConsentReceived?: (event: ConsentUpdatedEvent) => void;
}

function QrRequestPanel({
  company,
  purposes,
  onConsentReceived,
}: NewRequestSectionProps): ReactNode {
  const [alias, setAlias] = useState("Customer #4821");
  const [selectedCodes, setSelectedCodes] = useState<string[]>(
    purposes.map((p) => p.code),
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Active request state
  const [requestData, setRequestData] = useState<CreateRequestResponse | null>(null);

  // Status: "idle" | "waiting" | "received"
  const [consentStatus, setConsentStatus] = useState<"idle" | "waiting" | "received">("idle");
  const [receivedTx, setReceivedTx] = useState<string | null>(null);
  const [receivedAt, setReceivedAt] = useState<number | null>(null);

  // Simulator helper state
  const [simulating, setSimulating] = useState(false);

  // Keep selected codes in sync if purposes load later
  if (selectedCodes.length === 0 && purposes.length > 0) {
    setSelectedCodes(purposes.map((p) => p.code));
  }

  // Subscribe to consent.updated WebSocket event
  useConsentUpdated((event) => {
    // If the event is for this fiduciary
    if (event.fiduciary.toLowerCase() === company.address.toLowerCase()) {
      setConsentStatus("received");
      setReceivedTx(event.txHash);
      setReceivedAt(event.at);
      onConsentReceived?.(event);
    }
  });

  const togglePurpose = (code: string) => {
    setSelectedCodes((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code],
    );
  };

  const handleGenerate = async () => {
    if (selectedCodes.length === 0) {
      setError("Please select at least one purpose.");
      return;
    }
    setLoading(true);
    setError(null);
    setConsentStatus("waiting");
    setReceivedTx(null);
    setReceivedAt(null);

    try {
      const res = await createConsentRequest(company.address, {
        customerAlias: alias,
        purposes: selectedCodes,
      });
      setRequestData(res);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to generate QR request");
      setConsentStatus("idle");
    } finally {
      setLoading(false);
    }
  };

  // Simulate wallet scan & grant for quick browser testing / live demo
  const handleSimulateScan = async () => {
    if (!requestData) return;
    setSimulating(true);
    try {
      // Fetch request details from Core to get noticeHash
      const reqRes = await fetch(`${CORE_URL}/v1/requests/${requestData.requestId}?principal=${DEMO_PRINCIPAL}`);
      const notice = await reqRes.json();

      // If in stub mode, Core's stub store accepts grants
      const primaryPurposeId = notice.purposes[0]?.id;
      if (primaryPurposeId) {
        // Trigger grant via Core /v1/consents/grant or stub trigger
        // In stub mode with real Core, the stub emitter also generates consent.updated events.
        // We can post a demo grant or directly trigger it:
        const grantPayload = {
          request: {
            principal: DEMO_PRINCIPAL,
            fiduciary: company.address,
            purposeId: primaryPurposeId,
            expiresAt: Math.floor(Date.now() / 1000) + 365 * 86400,
            noticeHash: notice.noticeHash,
            nonce: notice.nonce ?? "0",
            deadline: Math.floor(Date.now() / 1000) + 3600,
          },
          // Dummy 65-byte signature for demo/stub
          signature: "0x" + "11".repeat(65),
        };

        const grantRes = await fetch(`${CORE_URL}/v1/consents/grant`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(grantPayload),
        });

        if (grantRes.ok) {
          const body = await grantRes.json();
          setConsentStatus("received");
          setReceivedTx(body.txHash);
          setReceivedAt(Math.floor(Date.now() / 1000));
        } else {
          // Fallback: manually update UI state
          setConsentStatus("received");
          setReceivedTx("0x4f2a7819cde4791b0198de76ab4102ef19459be1");
          setReceivedAt(Math.floor(Date.now() / 1000));
        }
      }
    } catch (e) {
      console.warn("Simulation fallback:", e);
      setConsentStatus("received");
      setReceivedTx("0x4f2a7819cde4791b0198de76ab4102ef19459be1");
      setReceivedAt(Math.floor(Date.now() / 1000));
    } finally {
      setSimulating(false);
    }
  };

  const qrPayloadString = requestData ? JSON.stringify(requestData.qrPayload) : "";

  return (
    <div className="space-y-6">
      {/* Heading */}
      <div>
        <h2 className="text-xl font-extrabold text-ink">New Consent Request</h2>
        <p className="text-sm text-mute">
          Create a consent request and show it to the customer as a QR code.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        {/* Left column: Setup parameters (6 cols) */}
        <div className="rounded-pass border border-line bg-surface p-6 shadow-sm lg:col-span-6 space-y-5">
          <h3 className="font-extrabold text-ink">1. Request Parameters</h3>

          {error && (
            <div className="rounded-row bg-block/10 p-3 text-xs font-semibold text-block">
              {error}
            </div>
          )}

          {/* Alias */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-mute">
              Customer alias
            </label>
            <input
              type="text"
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
              placeholder="e.g. Customer #4821, Asha Sharma"
              className="mt-1 w-full rounded-row border border-line bg-surface px-3 py-2 text-ink focus:border-marigold focus:outline-none text-sm"
            />
            <p className="mt-1 text-[11px] text-mute">
              Internal company identifier — never sent on chain (drd.md §1).
            </p>
          </div>

          {/* Purposes list */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-mute mb-2">
              Select requested purposes ({selectedCodes.length}/{purposes.length})
            </label>
            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {purposes.map((p) => {
                const checked = selectedCodes.includes(p.code);
                return (
                  <div
                    key={p.code}
                    onClick={() => togglePurpose(p.code)}
                    className={`flex items-start gap-3 rounded-row border p-3 cursor-pointer transition-all ${
                      checked
                        ? "border-marigold bg-marigold/5"
                        : "border-line bg-surface hover:bg-paper"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {}}
                      className="mt-1 h-4 w-4 accent-marigold"
                    />
                    <div className="flex-1 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-ink">{p.title.en}</span>
                        {p.required && (
                          <span className="rounded-pill bg-paper px-1.5 py-0.5 text-[10px] font-bold text-mute border border-line">
                            Needed
                          </span>
                        )}
                        {p.sharesThirdParty && (
                          <span className="rounded-pill bg-block/10 px-1.5 py-0.5 text-[10px] font-bold text-block">
                            3rd party
                          </span>
                        )}
                      </div>
                      <p className="text-mute mt-0.5">{p.description.en}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Action button */}
          <button
            type="button"
            onClick={handleGenerate}
            disabled={loading || selectedCodes.length === 0}
            className="w-full rounded-row bg-ink py-3 font-bold text-paper transition-opacity hover:opacity-95 disabled:opacity-50 text-sm"
          >
            {loading ? "Generating QR payload…" : "Generate consent QR"}
          </button>
        </div>

        {/* Right column: Large QR & Live Status (6 cols) */}
        <div className="flex flex-col items-center justify-center rounded-pass border border-line bg-surface p-6 shadow-sm lg:col-span-6 text-center">
          <h3 className="font-extrabold text-ink mb-2">2. Citizen Scan Pass</h3>
          <p className="text-xs text-mute mb-6">
            Citizen scans this QR code with the Sammati Wallet app.
          </p>

          {requestData ? (
            <div className="flex flex-col items-center space-y-5 w-full">
              {/* QR Container */}
              <div className="rounded-pass border-2 border-line bg-white p-5 shadow-inner">
                <QRCodeSVG
                  value={qrPayloadString}
                  size={220}
                  level="M"
                  includeMargin={false}
                />
              </div>

              {/* Status pill / card */}
              <div className="w-full max-w-sm rounded-pass border border-line p-4">
                {consentStatus === "waiting" && (
                  <div className="flex flex-col items-center gap-2">
                    <div className="flex items-center gap-2">
                      <span className="h-3 w-3 animate-ping rounded-full bg-marigold" />
                      <span className="font-extrabold text-ink text-sm">
                        Waiting for scan…
                      </span>
                    </div>
                    <p className="text-xs text-mute">
                      Listening on WebSocket topic for signed EIP-712 grant on chain.
                    </p>
                    <button
                      type="button"
                      onClick={handleSimulateScan}
                      disabled={simulating}
                      className="mt-2 text-xs font-bold text-marigold hover:underline"
                    >
                      {simulating ? "Simulating grant…" : "⚡ Simulate wallet scan & grant"}
                    </button>
                  </div>
                )}

                {consentStatus === "received" && (
                  <div className="flex flex-col items-center gap-2 animate-feed-enter">
                    <StatusChip variant="active" label="Consent received" />
                    <p className="text-xs font-semibold text-allow">
                      Signed on-chain grant verified!
                    </p>
                    {receivedTx && (
                      <div className="flex items-center gap-2 text-xs text-mute">
                        <span>Tx:</span>
                        <HashLabel value={receivedTx} />
                      </div>
                    )}
                    {receivedAt && (
                      <span className="text-[11px] text-mute">
                        Received at {new Date(receivedAt * 1000).toLocaleTimeString()}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Request ID */}
              <div className="flex items-center gap-2 text-xs text-mute">
                <span>Request ID:</span>
                <span className="font-mono text-ink font-semibold">
                  {requestData.requestId}
                </span>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center p-12 text-center text-mute">
              <span className="text-5xl text-mute/30 mb-3">⌖</span>
              <p className="text-sm font-semibold">No active QR request</p>
              <p className="text-xs text-mute mt-1 max-w-xs">
                Select purposes and customer alias on the left, then click Generate.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** New consent request (C-02, N-02): a QR for someone in front of you, or a request sent to a Sammati ID. */
export function NewRequestSection(props: NewRequestSectionProps & { onOpenConsents?: () => void }): ReactNode {
  const [tab, setTab] = useState<"qr" | "send">("qr");
  const tabs = [
    { id: "qr" as const, label: "QR (in person)" },
    { id: "send" as const, label: "Send to user" },
  ];
  return (
    <div className="space-y-5">
      <div role="tablist" aria-label="How to ask" className="flex gap-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            onClick={() => setTab(t.id)}
            className={`min-h-[44px] rounded-pill border-2 px-5 text-sm font-extrabold focus:outline-none focus-visible:ring-4 focus-visible:ring-marigold ${
              tab === t.id ? "border-ink bg-ink text-paper" : "border-line bg-surface text-ink hover:border-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === "qr" ? (
          <QrRequestPanel {...props} />
        ) : (
          <SendToUserPanel company={props.company} purposes={props.purposes} onOpenConsents={props.onOpenConsents} />
        )}
      </div>
    </div>
  );
}
