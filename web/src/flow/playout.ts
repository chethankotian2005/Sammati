/**
 * Paces what the Data Flow Inspector shows (trd.md §6.9).
 *
 * Real events arrive within a few milliseconds of each other, far too fast to read from the back of a room. The
 * playout applies them strictly in order and holds each state on screen for at least `dwellMs`. It changes nothing
 * else: the order, the content and the timings in the timeline come from the events. The one thing it adds is the
 * Scoring state, which has no event of its own: it is the gap between decrypting and the decision.
 */

import type { VaultEvent } from "@sammati/shared";
import type { FlowAction } from "./state";

export const FLOW_DWELL_MS = 600;

export class Playout {
  private queue: VaultEvent[] = [];
  private running = false;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly apply: (action: FlowAction) => void,
    private readonly dwellMs: number = FLOW_DWELL_MS,
  ) {}

  push(event: VaultEvent): void {
    this.queue.push(event);
    this.run();
  }

  /** Drops everything waiting, e.g. when switching between live and replay. */
  clear(): void {
    this.queue = [];
    this.running = false;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  get pending(): number {
    return this.queue.length;
  }

  private run(): void {
    if (this.running) return;
    this.running = true;
    this.step();
  }

  private wait(ms: number, then: () => void): void {
    this.timer = setTimeout(() => {
      this.timer = null;
      then();
    }, ms);
  }

  private step(): void {
    const next = this.queue.shift();
    if (!next) {
      this.running = false;
      return;
    }
    this.apply(next);
    if (this.dwellMs <= 0) {
      this.step(); // reduced motion: no pacing at all
      return;
    }
    if (next.event === "processor.decrypting") {
      // Hold "Decrypting", then show "Scoring" until the decision's turn comes.
      this.wait(this.dwellMs, () => {
        this.apply({ type: "scoring" });
        this.wait(this.dwellMs, () => this.step());
      });
    } else {
      this.wait(this.dwellMs, () => this.step());
    }
  }
}
