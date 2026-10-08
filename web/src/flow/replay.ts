/**
 * Replay of a recorded run (trd.md §6.9), the fallback when the stack or the network is not there.
 *
 * The file is generated from a real run (`E2E_RECORD_FLOW=web/public/flow-replay.json pnpm e2e`): real events, the
 * real ciphertext row, the real answer of QuickLoan's admin endpoint. The replay feeds the same state machine as the
 * live stream, at the recorded pace, and is read through the same privacy check, so a recording that contained a
 * plaintext value would be refused rather than played.
 */

import { scanForPlaintext } from "./privacy";

export interface ReplayFile {
  v: 1;
  recordedAt: string;
  note?: string;
  /** `t` is milliseconds since the first recorded frame. */
  events: Array<{ t: number; event: unknown }>;
  /** The Processor's `GET /v1/vault/:handle` answer for the recorded handle. */
  vaultRow: unknown;
  /** QuickLoan's admin answer: the status code and the body. */
  staffView: { status: number; body: unknown };
}

export class ReplayError extends Error {}

export function parseReplay(raw: unknown): ReplayFile {
  if (typeof raw !== "object" || raw === null) throw new ReplayError("the recording is not an object");
  const f = raw as Partial<ReplayFile>;
  if (f.v !== 1) throw new ReplayError("the recording has an unknown version");
  if (!Array.isArray(f.events) || f.events.length === 0) throw new ReplayError("the recording has no events");
  let last = -1;
  for (const e of f.events) {
    if (typeof e?.t !== "number" || !Number.isFinite(e.t) || e.t < last) throw new ReplayError("the recording's timestamps are not in order");
    last = e.t;
  }
  if (typeof f.staffView?.status !== "number") throw new ReplayError("the recording has no staff view");
  const hit = scanForPlaintext(f);
  if (hit) throw new ReplayError(`the recording contains plaintext at ${hit}: refusing to play it`);
  return f as ReplayFile;
}

export class ReplayPlayer {
  private timers: Array<ReturnType<typeof setTimeout>> = [];

  constructor(
    private readonly file: ReplayFile,
    private readonly onFrame: (frame: unknown) => void,
    private readonly speed = 1,
  ) {}

  /** Starts from the first frame. Calling it again restarts. */
  start(): void {
    this.stop();
    for (const { t, event } of this.file.events) {
      this.timers.push(setTimeout(() => this.onFrame(event), t / this.speed));
    }
  }

  stop(): void {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
  }

  /** How long the whole recording takes at this speed. */
  get durationMs(): number {
    return (this.file.events.at(-1)?.t ?? 0) / this.speed;
  }
}

/** A recording of what this session has seen, for the "Save session" button. */
export function buildReplay(
  frames: Array<{ at: number; frame: unknown }>,
  vaultRow: unknown,
  staffView: ReplayFile["staffView"],
  now: Date = new Date(),
): ReplayFile {
  const first = frames[0]?.at ?? 0;
  return {
    v: 1,
    recordedAt: now.toISOString(),
    note: "Saved from the Data Flow Inspector",
    events: frames.map(({ at, frame }) => ({ t: at - first, event: frame })),
    vaultRow,
    staffView,
  };
}
