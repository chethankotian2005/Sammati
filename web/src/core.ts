import { useEffect, useState } from "react";

export const CORE_URL: string = import.meta.env.VITE_CORE_URL ?? "http://localhost:4000";

export type CoreStatus = { state: "checking" } | { state: "down" } | { state: "up" };

/** Polls /v1/health so every page can show whether Core is reachable. */
export function useCoreStatus(intervalMs = 5000): CoreStatus {
  const [status, setStatus] = useState<CoreStatus>({ state: "checking" });
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const res = await fetch(`${CORE_URL}/v1/health`);
        await res.json();
        if (!cancelled) setStatus({ state: "up" });
      } catch {
        if (!cancelled) setStatus({ state: "down" });
      }
    };
    void check();
    const timer = setInterval(check, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [intervalMs]);
  return status;
}
