/**
 * "Send to user" (N-02, ui.md §3): ask a specific customer for consent by their Sammati ID, no QR.
 *
 * Whatever the ID, the answer is "Request sent": Core says the same thing for an ID that exists, one that does not,
 * a company the customer blocked and a customer at the limit, and this page does not pretend to know more. It never
 * sees a wallet address; each row is an opaque request id, the ID as typed, and a status that only the customer's own
 * actions (opening, granting, declining) can move.
 */

import { useCallback, useEffect, useState, type ReactNode } from "react";
import type { NoticePurpose, SeedFiduciary, TargetedRequestRow, TargetedStatus } from "@sammati/shared";
import { fetchTargetedRequests, sendTargetedRequest } from "../../api";
import { StatusChip, type ChipVariant } from "../../ui";
import { useRequestUpdated } from "../../ws";

const HANDLE = /^[a-z0-9._-]{3,30}@sammati$/;
const MAX_MESSAGE = 140;
const EXPIRIES: ReadonlyArray<{ hours: number; label: string }> = [
  { hours: 1, label: "1 hour" },
  { hours: 24, label: "24 hours" },
  { hours: 72, label: "3 days" },
  { hours: 168, label: "7 days" },
];

export const STATUS_CHIPS: Record<TargetedStatus, { variant: ChipVariant; label: string }> = {
  sent: { variant: "pending", label: "Sent" },
  seen: { variant: "unverified", label: "Seen" },
  granted: { variant: "allowed", label: "Granted" },
  declined: { variant: "blocked", label: "Declined" },
  expired: { variant: "expired", label: "Expired" },
};

interface Props {
  company: SeedFiduciary;
  purposes: NoticePurpose[];
  /** Opens the Consents section (a Granted row links there). */
  onOpenConsents?: () => void;
}

const time = (s: number): string => new Date(s * 1000).toLocaleString([], { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

/** A row's status, with expiry applied the moment its time passes (Core computes it too; this just does not wait for a refetch). */
export function effectiveStatus(row: Pick<TargetedRequestRow, "status" | "expiresAt">, nowSeconds: number): TargetedStatus {
  return (row.status === "sent" || row.status === "seen") && row.expiresAt <= nowSeconds ? "expired" : row.status;
}

export function SendToUserPanel({ company, purposes, onOpenConsents }: Props): ReactNode {
  const [handle, setHandle] = useState("");
  const [selected, setSelected] = useState<string[]>(() => purposes.slice(0, 1).map((p) => p.code));
  const [message, setMessage] = useState("");
  const [hours, setHours] = useState(72);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSent, setJustSent] = useState(false);
  const [rows, setRows] = useState<TargetedRequestRow[]>([]);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

  const load = useCallback(async () => {
    try {
      setRows(await fetchTargetedRequests(company.address));
    } catch {
      // keep what is shown; the next event or send refreshes it
    }
  }, [company.address]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 15_000);
    return () => clearInterval(t);
  }, []);

  // Seen, Granted, Declined: by request id, never by who.
  useRequestUpdated((e) => {
    if (e.fiduciary.toLowerCase() !== company.address.toLowerCase()) return;
    setRows((prev) => prev.map((r) => (r.requestId === e.requestId ? { ...r, status: e.status } : r)));
  });

  const normalised = handle.trim().toLowerCase();
  const valid = HANDLE.test(normalised);
  const canSend = valid && selected.length > 0 && !sending && message.length <= MAX_MESSAGE;

  const toggle = (code: string) => setSelected((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));

  const send = async () => {
    if (!canSend) return;
    setSending(true);
    setError(null);
    setJustSent(false);
    try {
      await sendTargetedRequest(company.address, {
        handle: normalised,
        purposes: selected,
        ...(message.trim() ? { message: message.trim() } : {}),
        expiresInHours: hours,
      });
      setJustSent(true);
      setHandle("");
      setMessage("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the request");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      <div className="space-y-5 rounded-pass border border-line bg-surface p-6 shadow-sm lg:col-span-5">
        <h3 className="font-extrabold text-ink">Ask a customer</h3>

        <div>
          <label htmlFor="sammati-id" className="block text-xs font-bold uppercase tracking-wider text-mute">
            Sammati ID
          </label>
          <input
            id="sammati-id"
            type="text"
            value={handle}
            onChange={(e) => {
              setHandle(e.target.value);
              setJustSent(false);
            }}
            placeholder="asha@sammati"
            autoComplete="off"
            spellCheck={false}
            className="mt-1 w-full rounded-row border border-line bg-surface px-3 py-2 font-mono text-ink focus:border-marigold focus:outline-none"
          />
          {handle !== "" && !valid && <p className="mt-1 text-xs font-bold text-block">✕ An ID looks like asha@sammati</p>}
        </div>

        <fieldset>
          <legend className="mb-2 block text-xs font-bold uppercase tracking-wider text-mute">Purposes ({selected.length}/{purposes.length})</legend>
          <div className="space-y-2">
            {purposes.map((p) => (
              <label key={p.code} className="flex min-h-[44px] cursor-pointer items-start gap-3 rounded-row border border-line p-3">
                <input type="checkbox" className="mt-1 h-4 w-4 accent-marigold" checked={selected.includes(p.code)} onChange={() => toggle(p.code)} />
                <span className="text-sm font-bold text-ink">{p.title.en}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div>
          <label htmlFor="request-message" className="block text-xs font-bold uppercase tracking-wider text-mute">
            Message (optional)
          </label>
          <textarea
            id="request-message"
            rows={2}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="mt-1 w-full rounded-row border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-marigold focus:outline-none"
          />
          <p className={`mt-1 text-[11px] ${message.length > MAX_MESSAGE ? "font-bold text-block" : "text-mute"}`} aria-live="polite">
            {message.length}/{MAX_MESSAGE}
          </p>
        </div>

        <div>
          <label htmlFor="request-expiry" className="block text-xs font-bold uppercase tracking-wider text-mute">
            Expires in
          </label>
          <select
            id="request-expiry"
            value={hours}
            onChange={(e) => setHours(Number(e.target.value))}
            className="mt-1 w-full rounded-row border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-marigold focus:outline-none"
          >
            {EXPIRIES.map((x) => (
              <option key={x.hours} value={x.hours}>
                {x.label}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          disabled={!canSend}
          onClick={() => void send()}
          className="min-h-[48px] w-full rounded-pill bg-ink px-6 text-base font-extrabold text-paper disabled:opacity-40 focus:outline-none focus-visible:ring-4 focus-visible:ring-marigold"
        >
          {sending ? "Sending…" : "Send request"}
        </button>

        <div aria-live="polite" className="space-y-1">
          {justSent && (
            <p className="text-sm font-bold text-allow" data-testid="sent-note">
              ✓ Request sent. We tell you nothing about whether this ID exists.
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm font-bold text-block">
              ✕ {error}
            </p>
          )}
        </div>
      </div>

      <div className="space-y-3 rounded-pass border border-line bg-surface p-6 shadow-sm lg:col-span-7">
        <h3 className="font-extrabold text-ink">Requests sent</h3>
        {rows.length === 0 ? (
          <p className="rounded-row border border-dashed border-line p-8 text-center text-sm text-mute">Nothing sent yet.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wider text-mute">
              <tr>
                <th className="py-2 pr-3">Sammati ID</th>
                <th className="py-2 pr-3">Purposes</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">Sent</th>
                <th className="py-2">Expires</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const status = effectiveStatus(r, now);
                const chip = STATUS_CHIPS[status];
                return (
                  <tr key={r.requestId} className="border-t border-line align-top" data-testid={`row-${r.requestId}`}>
                    <td className="py-3 pr-3 font-mono">{r.handle}</td>
                    <td className="py-3 pr-3">{r.purposes.join(", ")}</td>
                    <td className="py-3 pr-3">
                      <StatusChip variant={chip.variant} label={chip.label} size="sm" />
                      {status === "granted" && onOpenConsents && (
                        <button type="button" onClick={onOpenConsents} className="ml-2 text-xs font-bold text-ink underline">
                          Open Consents
                        </button>
                      )}
                    </td>
                    <td className="py-3 pr-3 text-mute">{time(r.createdAt)}</td>
                    <td className="py-3 text-mute">{time(r.expiresAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
