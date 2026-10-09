// The expiry scheduler (trd.md §6.12): tells the customer a consent is about to end, and that it has.
//
// It only *tells*. Enforcement never waits for it: the gateway and the Processor read the chain, so a consent stops
// working the second it expires whether or not this timer has run.
import type { Hex } from "@sammati/shared";
import type { Config } from "../config";
import { now } from "../clock";
import type { Db } from "./db";
import type { Notifications } from "./notifications";

type ExpiryConfig = Pick<Config, "expiryTickMs" | "expiryThresholdsSeconds" | "expiredNotifySeconds">;

export class ExpiryScheduler {
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly db: Db,
    private readonly notifications: Notifications,
    private readonly config: ExpiryConfig,
    private readonly clock: () => number = now,
  ) {}

  /** One pass over every Active consent. Returns how many notifications it raised (tests). */
  tick(): number {
    const t = this.clock();
    const rows = this.db
      .prepare("SELECT principal, fiduciary, purpose_id, expires_at FROM consents_cache WHERE status = 'Active' AND expires_at > ?")
      .all(t - this.config.expiredNotifySeconds) as Array<{ principal: Hex; fiduciary: Hex; purpose_id: Hex; expires_at: number }>;
    const ascending = [...this.config.expiryThresholdsSeconds].sort((a, b) => a - b);
    let raised = 0;
    for (const r of rows) {
      const remaining = r.expires_at - t;
      const base = { principal: r.principal, fiduciary: r.fiduciary, purposeId: r.purpose_id };
      if (remaining <= 0) {
        raised += this.notifications.raise({ ...base, type: "consent.expired", key: `expired:${r.principal}:${r.fiduciary}:${r.purpose_id}:${r.expires_at}`, payload: { expiresAt: r.expires_at } }) ? 1 : 0;
        continue;
      }
      // The nearest threshold not yet passed: a consent granted with 2 days left fires the 3-day one, once, never two at a time.
      const threshold = ascending.find((x) => x >= remaining);
      if (threshold === undefined) continue;
      const key = `expiring:${r.principal}:${r.fiduciary}:${r.purpose_id}:${r.expires_at}:${threshold}`;
      raised += this.notifications.raise({ ...base, type: "consent.expiring", key, payload: { expiresAt: r.expires_at, thresholdSeconds: threshold } }) ? 1 : 0;
    }
    return raised;
  }

  start(): void {
    this.stop();
    this.timer = setInterval(() => {
      try {
        this.tick();
      } catch (err) {
        console.warn("[expiry] tick failed:", err instanceof Error ? err.message : err);
      }
    }, this.config.expiryTickMs);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
