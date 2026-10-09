import { useEffect, useState } from "react";

/** A production build cannot be made without VITE_CORE_URL (vite.config.ts); only development falls back to the local Core. */
export const CORE_URL: string = import.meta.env.VITE_CORE_URL ?? (import.meta.env.PROD ? "" : "http://localhost:4000");

/** A hosted (production) build always asks for logins: the Auditor's access code and the console's sign-in (trd.md §10.8). */
export const LOGIN_REQUIRED: boolean = import.meta.env.PROD;

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
