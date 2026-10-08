import { useEffect, useState } from "react";
import type { HealthResponse } from "@sammati/shared";

export const CORE_URL: string = import.meta.env.VITE_CORE_URL ?? "http://localhost:4000";

export type CoreStatus = { state: "checking" } | { state: "down" } | { state: "up"; mode: HealthResponse["mode"] };

/** Polls /v1/health so every page can show whether Core is reachable. */
export function useCoreStatus(intervalMs = 5000): CoreStatus {
  const [status, setStatus] = useState<CoreStatus>({ state: "checking" });
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const res = await fetch(`${CORE_URL}/v1/health`);
        const body = (await res.json()) as HealthResponse;
        if (!cancelled) setStatus({ state: "up", mode: body.mode });
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
