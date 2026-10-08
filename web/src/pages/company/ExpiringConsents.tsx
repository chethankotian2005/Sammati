/**
 * Expiring consents (N-03, N-04, ui.md §3): the company's consents that expire soon or just did, with **Request renewal**.
 *
 * The company already knows these customers (they are in its Consents table), so the principal is shown as a short hash
 * like there. What a renewal request adds is only its status by request id: Sent, Seen, Granted, Declined, Expired.
 * Whether the customer blocked the company is never shown: Core answers the same either way.
 */

import { useCallback, useEffect, useState, type ReactNode } from "react";
import type { ExpiringRow, NoticePurpose, SeedFiduciary, TargetedStatus } from "@sammati/shared";
import { fetchExpiring, requestRenewal } from "../../api";
import { HashLabel, StatusChip, type ChipVariant } from "../../ui";
import { useConsentUpdated, useRequestUpdated } from "../../ws";

const RENEWAL_CHIPS: Record<TargetedStatus, { variant: ChipVariant; label: string }> = {
  sent: { variant: "pending", label: "Sent" },
  seen: { variant: "unverified", label: "Seen" },
  granted: { variant: "allowed", label: "Granted" },
  declined: { variant: "blocked", label: "Declined" },
  expired: { variant: "expired", label: "Expired" },
};

interface Props {
  company: SeedFiduciary;
  purposes: NoticePurpose[];
}

/** "in 3 days", "in 45 seconds", "2 minutes ago": the largest unit that is at least one. */
export function relativeTime(seconds: number): string {
  const abs = Math.abs(seconds);
  // The cut-offs are half a unit short, so 3599 s reads "1 hour", not "60 minutes".
  const [n, unit] = abs >= 84_600 ? [Math.round(abs / 86400), "day"] : abs >= 3570 ? [Math.round(abs / 3600), "hour"] : abs >= 59.5 ? [Math.round(abs / 60), "minute"] : [Math.max(1, Math.round(abs)), "second"];
  const span = `${n} ${unit}${n === 1 ? "" : "s"}`;
  return seconds >= 0 ? `in ${span}` : `${span} ago`;
}

/** A row's state with expiry applied the moment its time passes (Core also computes it; this does not wait for a refetch). */
export function effectiveState(row: Pick<ExpiringRow, "expiresAt" | "state">, nowSeconds: number): ExpiringRow["state"] {
  return row.expiresAt <= nowSeconds ? "expired" : row.state;
}

const time = (s: number): string => new Date(s * 1000).toLocaleString([], { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit" });

export function ExpiringConsents({ company, purposes }: Props): ReactNode {
  const [rows, setRows] = useState<ExpiringRow[]>([]);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const [asking, setAsking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setRows(await fetchExpiring(company.address));
    } catch {
      // keep what is shown; the next event or tick refreshes it
    }
  }, [company.address]);

  useEffect(() => {
    void load();
  }, [load]);

  // The clock moves the Expiring chip to Expired; a slower pass refetches in case an event was missed.
  useEffect(() => {
    const tick = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    const refetch = setInterval(() => void load(), 15_000);
    return () => {
      clearInterval(tick);
      clearInterval(refetch);
    };
  }, [load]);

  // A grant (a renewal, or a new consent) changes who is expiring; a renewal request's own status follows its id.
  useConsentUpdated((e) => {
    if (e.fiduciary.toLowerCase() === company.address.toLowerCase()) void load();
  });
  useRequestUpdated((e) => {
    if (e.fiduciary.toLowerCase() !== company.address.toLowerCase()) return;
    setRows((prev) => prev.map((r) => (r.renewal?.requestId === e.requestId ? { ...r, renewal: { ...r.renewal, status: e.status } } : r)));
  });

  const keyOf = (r: ExpiringRow): string => `${r.principal}:${r.purposeCode}`;

  const ask = async (row: ExpiringRow) => {
    setAsking(keyOf(row));
    setError(null);
    try {
      await requestRenewal(company.address, row.principal, row.purposeCode);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the request");
    } finally {
      setAsking(null);
    }
  };

  const open = (r: ExpiringRow): boolean => r.renewal !== null && (r.renewal.status === "sent" || r.renewal.status === "seen");

  return (
    <section className="space-y-3 rounded-pass border border-line bg-surface p-6 shadow-sm" aria-labelledby="expiring-title">
      <div>
        <h3 id="expiring-title" className="font-extrabold text-ink">
          Expiring consents
        </h3>
        <p className="text-xs text-mute">Consents about to end, or that just ended. A renewal request goes to the customer's wallet; they choose.</p>
      </div>

      {error && (
        <p role="alert" className="text-sm font-bold text-block">
          ✕ {error}
        </p>
      )}

      {rows.length === 0 ? (
        <p className="rounded-row border border-dashed border-line p-6 text-center text-sm text-mute">No consents are about to expire.</p>
      ) : (
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-wider text-mute">
            <tr>
              <th className="py-2 pr-3">Customer</th>
              <th className="py-2 pr-3">Purpose</th>
              <th className="py-2 pr-3">Expires</th>
              <th className="py-2 pr-3">State</th>
              <th className="py-2 pr-3">Renewal</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const state = effectiveState(r, now);
              const title = purposes.find((p) => p.code === r.purposeCode)?.title.en ?? r.purposeCode;
              const chip = r.renewal ? RENEWAL_CHIPS[r.renewal.status] : null;
              const requested = open(r);
              return (
                <tr key={keyOf(r)} className="border-t border-line align-top" data-testid={`expiring-${keyOf(r)}`}>
                  <td className="py-3 pr-3">
                    <div className="font-bold text-ink">{r.customerAlias || "Citizen"}</div>
                    <HashLabel value={r.principal} />
                  </td>
                  <td className="py-3 pr-3">
                    <div className="font-bold text-ink">{title}</div>
                    <div className="font-mono text-[11px] text-mute">{r.purposeCode}</div>
                  </td>
                  <td className="py-3 pr-3">
                    <div className="text-ink">{time(r.expiresAt)}</div>
                    <div className="text-xs text-mute">{relativeTime(r.expiresAt - now)}</div>
                  </td>
                  <td className="py-3 pr-3">
                    <StatusChip variant={state === "expired" ? "expired" : "pending"} label={state === "expired" ? "Expired" : "Expiring"} size="sm" />
                  </td>
                  <td className="py-3 pr-3">{chip ? <StatusChip variant={chip.variant} label={chip.label} size="sm" /> : <span className="text-mute">—</span>}</td>
                  <td className="py-3">
                    <button
                      type="button"
                      disabled={requested || asking === keyOf(r)}
                      onClick={() => void ask(r)}
                      className="min-h-[48px] rounded-pill bg-ink px-4 text-sm font-extrabold text-paper disabled:opacity-40 focus:outline-none focus-visible:ring-4 focus-visible:ring-marigold"
                    >
                      {requested ? "Requested" : asking === keyOf(r) ? "Sending…" : "Request renewal"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
