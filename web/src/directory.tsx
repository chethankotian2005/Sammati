/**
 * The companies Sammati knows, from Core (`GET /v1/fiduciaries`, prd.md R-04). Nothing in the web app assumes which
 * companies exist: the console switcher, the Stage view, the Auditor and the ledger filter all read this. It refreshes
 * when a company is approved or moves in or out of the sandbox, and subscribes the socket to each company's topic.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { FiduciaryInfo } from "@sammati/shared";
import { fetchFiduciaries } from "./api";
import { useFiduciaryRegistered, useFiduciaryUpdated, useWsTopics } from "./ws";

export type DirectoryStatus = "loading" | "ready" | "error";

export interface Directory {
  status: DirectoryStatus;
  fiduciaries: FiduciaryInfo[];
  bySlug(slug: string | undefined): FiduciaryInfo | undefined;
  byAddress(address: string | null | undefined): FiduciaryInfo | undefined;
  refresh(): Promise<void>;
}

const DirectoryContext = createContext<Directory | null>(null);
const POLL_MS = 30_000;

export function DirectoryProvider({ children }: { children: ReactNode }): ReactNode {
  const [fiduciaries, setFiduciaries] = useState<FiduciaryInfo[]>([]);
  const [status, setStatus] = useState<DirectoryStatus>("loading");

  const refresh = useCallback(async () => {
    try {
      setFiduciaries(await fetchFiduciaries());
      setStatus("ready");
    } catch {
      // Keep what we had: a company list that blinks away on a hiccup is worse than a stale one.
      setStatus((s) => (s === "ready" ? s : "error"));
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  useFiduciaryRegistered(() => void refresh());
  useFiduciaryUpdated(() => void refresh());
  useWsTopics(fiduciaries.map((f) => `fiduciary:${f.address}`));

  const value = useMemo<Directory>(
    () => ({
      status,
      fiduciaries,
      bySlug: (slug) => fiduciaries.find((f) => f.slug === slug),
      byAddress: (address) => fiduciaries.find((f) => f.address.toLowerCase() === address?.toLowerCase()),
      refresh,
    }),
    [status, fiduciaries, refresh],
  );
  return <DirectoryContext.Provider value={value}>{children}</DirectoryContext.Provider>;
}

export function useDirectory(): Directory {
  const ctx = useContext(DirectoryContext);
  if (!ctx) throw new Error("useDirectory must be used inside <DirectoryProvider>");
  return ctx;
}
