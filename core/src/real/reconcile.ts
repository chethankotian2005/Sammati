import type { Hex } from "@sammati/shared";
import type { Chain } from "./chain";
import type { Indexer } from "./indexer";
import { statusOf, type Repo } from "./repo";

export interface Drift {
  principal: Hex;
  fiduciary: Hex;
  purposeId: Hex;
  field: string;
  cached: unknown;
  chain: unknown;
}

export interface ReconcileResult {
  checked: number;
  drift: Drift[];
}

/**
 * drd.md §7: consents_cache must equal getConsent on chain. Compares every consent the cache or
 * the ledger knows about, logs each difference, and repairs it from the chain (the chain wins).
 */
export async function reconcile(
  repo: Repo,
  chain: Chain,
  indexer: Indexer,
  log: (message: string) => void = console.warn,
): Promise<ReconcileResult> {
  const keys = repo.knownConsentKeys();
  const drift: Drift[] = [];

  for (const k of keys) {
    const onChain = await chain.registry.getConsent(k.principal, k.fiduciary, k.purposeId);
    const cached = repo.cachedConsent(k.principal, k.fiduciary, k.purposeId);
    const chainStatus = statusOf(onChain.status);

    const diffs: [string, unknown, unknown][] = [];
    if (!cached && chainStatus !== "None") diffs.push(["missing", null, chainStatus]);
    else if (cached && chainStatus === "None") diffs.push(["status", cached.status, chainStatus]);
    else if (cached) {
      if (cached.status !== chainStatus) diffs.push(["status", cached.status, chainStatus]);
      if (cached.expiresAt !== Number(onChain.expiresAt)) diffs.push(["expiresAt", cached.expiresAt, Number(onChain.expiresAt)]);
      if (cached.updatedAt !== Number(onChain.updatedAt)) diffs.push(["updatedAt", cached.updatedAt, Number(onChain.updatedAt)]);
    }
    if (diffs.length === 0) continue;

    for (const [field, c, ch] of diffs) {
      drift.push({ ...k, field, cached: c, chain: ch });
      log(`[reconcile] drift on ${k.principal} ${k.purposeId}: ${field} cache=${String(c)} chain=${String(ch)}`);
    }
    await indexer.refreshConsent(k.principal, k.fiduciary, k.purposeId);
  }
  return { checked: keys.length, drift };
}
