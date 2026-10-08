/**
 * The Data Flow Inspector's controller (trd.md §6.9): live events or a recording in, lane state out, plus the staff
 * lane's two reads and the presenter's "Withdraw and re-run". Everything shown comes from events and from answers
 * the services really gave; the only thing added is the pacing (`Playout`).
 */

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { DEMO_PRINCIPAL, SEED_FIDUCIARIES } from "@sammati/shared";
import { ApiError, demoFire, demoWithdraw, fetchProcessorUrl } from "../api";
import { useAnyWsFrame, useWsReadyState } from "../ws";
import { FLOW_DWELL_MS, Playout } from "./playout";
import { checkFrame, cleanPrivacy, filterStaffView, privacyVerdict, type PrivacyState, type StaffView } from "./privacy";
import { ReplayPlayer, buildReplay, parseReplay, type ReplayFile } from "./replay";
import { isVaultEvent, readAdminView, readVaultRow, type RawAnswer } from "./sources";
import { initialFlow, reduceFlow, type FlowAction, type FlowState } from "./state";

const QUICKLOAN = SEED_FIDUCIARIES.find((f) => f.slug === "quickloan")!;
const PURPOSE = "credit_check";
const PHONE_WITHDRAWAL_TIMEOUT_MS = 90_000;

type HookAction = FlowAction | { type: "reset" };
const hookReducer = (state: FlowState, action: HookAction): FlowState => ("type" in action && action.type === "reset" ? initialFlow : reduceFlow(state, action as FlowAction));

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) || false);
  useEffect(() => {
    const query = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!query) return;
    const onChange = () => setReduced(query.matches);
    query.addEventListener?.("change", onChange);
    return () => query.removeEventListener?.("change", onChange);
  }, []);
  return reduced;
}

export interface StaffResult {
  /** HTTP status the service answered with, or null when it could not be reached. */
  status: number | null;
  view: StaffView;
  error: string | null;
  recorded: boolean;
}

export type RerunState =
  | { phase: "idle" }
  | { phase: "withdrawing" }
  | { phase: "waiting-phone" }
  | { phase: "applying" }
  | { phase: "done"; decision: string; reason: string }
  | { phase: "error"; message: string };

export interface FlowController {
  flow: FlowState;
  privacy: PrivacyState;
  verdict: "unknown" | "clean" | "violated";
  /** The vault row for the handle being followed, as the Processor answered (ciphertext only; filtered before display). */
  row: RawAnswer | null;
  mode: "live" | "replay";
  online: boolean;
  replayError: string | null;
  setReplay(on: boolean): void;
  admin: StaffResult | null;
  database: StaffResult | null;
  viewCustomerData(): Promise<void>;
  readDatabase(): Promise<void>;
  rerun: RerunState;
  withdrawAndRerun(): Promise<void>;
  cancelRerun(): void;
  saveSession(): void;
}

export function useFlow(options: { startInReplay?: boolean; replayUrl?: string } = {}): FlowController {
  const { startInReplay = false, replayUrl = "/flow-replay.json" } = options;
  const reduced = usePrefersReducedMotion();
  const [flow, dispatch] = useReducer(hookReducer, initialFlow);
  const [privacy, setPrivacy] = useState<PrivacyState>(cleanPrivacy);
  const [row, setRow] = useState<RawAnswer | null>(null);
  const [mode, setMode] = useState<"live" | "replay">(startInReplay ? "replay" : "live");
  const [replayFile, setReplayFile] = useState<ReplayFile | null>(null);
  const [replayError, setReplayError] = useState<string | null>(null);
  const [admin, setAdmin] = useState<StaffResult | null>(null);
  const [database, setDatabase] = useState<StaffResult | null>(null);
  const [rerun, setRerun] = useState<RerunState>({ phase: "idle" });

  const playout = useMemo(() => new Playout(dispatch, reduced ? 0 : FLOW_DWELL_MS), [reduced]);
  const processorUrl = useRef<Promise<string> | null>(null);
  const frames = useRef<Array<{ at: number; frame: unknown }>>([]);
  const flowRef = useRef(flow);
  flowRef.current = flow;
  const replayRef = useRef<ReplayFile | null>(null);
  replayRef.current = mode === "replay" ? replayFile : null;
  const withdrawalWaiter = useRef<{ principal: string; resolve: () => void; reject: (e: Error) => void } | null>(null);
  const modeRef = useRef(mode);
  modeRef.current = mode;

  const online = useWsReadyState() === WebSocket.OPEN;

  // --- frames: from the live socket or from a recording, through the same path ---

  const loadRow = useCallback(async (handle: string) => {
    const recording = replayRef.current;
    if (recording) {
      setRow({ status: 200, body: recording.vaultRow });
      return;
    }
    try {
      processorUrl.current ??= fetchProcessorUrl();
      setRow(await readVaultRow(await processorUrl.current, handle));
    } catch {
      processorUrl.current = null; // look it up again next time
      setRow(null);
    }
  }, []);

  const onFrame = useCallback(
    (frame: unknown) => {
      setPrivacy((p) => checkFrame(p, frame));
      const f = frame as { event?: string; principal?: string; status?: string; purposeCode?: string };
      if (f?.event === "consent.updated") {
        const waiter = withdrawalWaiter.current;
        if (waiter && f.status === "Withdrawn" && f.purposeCode === PURPOSE && f.principal?.toLowerCase() === waiter.principal.toLowerCase()) {
          withdrawalWaiter.current = null;
          waiter.resolve();
        }
      }
      if (!isVaultEvent(frame)) return;
      frames.current.push({ at: Date.now(), frame });
      playout.push(frame);
      if (frame.event === "vault.stored") void loadRow(frame.handle);
    },
    [playout, loadRow],
  );

  useAnyWsFrame((frame) => {
    if (modeRef.current === "live") onFrame(frame);
  });

  // --- replay ---

  useEffect(() => {
    if (mode !== "replay") return;
    let cancelled = false;
    setReplayError(null);
    void (async () => {
      try {
        const res = await fetch(replayUrl);
        if (!res.ok) throw new Error(`no recording at ${replayUrl} (HTTP ${res.status})`);
        const file = parseReplay(await res.json());
        if (!cancelled) setReplayFile(file);
      } catch (err) {
        if (!cancelled) setReplayError(err instanceof Error ? err.message : "the recording could not be read");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, replayUrl]);

  useEffect(() => {
    if (mode !== "replay" || !replayFile) return;
    const player = new ReplayPlayer(replayFile, onFrame);
    player.start();
    return () => player.stop();
  }, [mode, replayFile, onFrame]);

  const setReplay = useCallback(
    (on: boolean) => {
      playout.clear();
      dispatch({ type: "reset" });
      setPrivacy(cleanPrivacy);
      setRow(null);
      setAdmin(null);
      setDatabase(null);
      setRerun({ phase: "idle" });
      frames.current = [];
      setReplayFile(null);
      setMode(on ? "replay" : "live");
    },
    [playout],
  );

  // --- the staff lane ---

  const principal = flow.principal ?? DEMO_PRINCIPAL;

  const answerOf = (a: RawAnswer | null, error: string | null, recorded: boolean): StaffResult => ({
    status: a?.status ?? null,
    view: filterStaffView(a?.body ?? null),
    error,
    recorded,
  });

  const viewCustomerData = useCallback(async () => {
    const recording = replayRef.current;
    if (recording) {
      setAdmin(answerOf(recording.staffView, null, true));
      return;
    }
    try {
      setAdmin(answerOf(await readAdminView(QUICKLOAN.port, principal), null, false));
    } catch {
      setAdmin(answerOf(null, "QuickLoan's backend did not answer", false));
    }
  }, [principal]);

  const readDatabase = useCallback(async () => {
    const recording = replayRef.current;
    if (recording) {
      setDatabase(answerOf({ status: 200, body: recording.vaultRow }, null, true));
      return;
    }
    const handle = flowRef.current.handle;
    if (!handle) {
      setDatabase(answerOf(null, "Nothing is stored yet", false));
      return;
    }
    try {
      processorUrl.current ??= fetchProcessorUrl();
      setDatabase(answerOf(await readVaultRow(await processorUrl.current, handle), null, false));
    } catch {
      processorUrl.current = null;
      setDatabase(answerOf(null, "The vault did not answer", false));
    }
  }, []);

  // --- the presenter's control ---

  const cancelRerun = useCallback(() => {
    withdrawalWaiter.current?.reject(new Error("cancelled"));
    withdrawalWaiter.current = null;
    setRerun({ phase: "idle" });
  }, []);

  const withdrawAndRerun = useCallback(async () => {
    if (modeRef.current === "replay") return;
    const who = flowRef.current.principal ?? DEMO_PRINCIPAL;
    const waitForPhone = () =>
      new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("No withdrawal arrived from the phone")), PHONE_WITHDRAWAL_TIMEOUT_MS);
        withdrawalWaiter.current = {
          principal: who,
          resolve: () => {
            clearTimeout(timer);
            resolve();
          },
          reject: (e) => {
            clearTimeout(timer);
            reject(e);
          },
        };
      });

    setRerun({ phase: "withdrawing" });
    try {
      try {
        await demoWithdraw({ principal: who, fiduciary: QUICKLOAN.address, purposeCode: PURPOSE });
      } catch (err) {
        if (err instanceof ApiError && err.code === "NOT_A_DEMO_PRINCIPAL") {
          // A real wallet: only its phone can withdraw. Wait for that, from the live events.
          setRerun({ phase: "waiting-phone" });
          await waitForPhone();
        } else if (!(err instanceof ApiError && err.code === "NOT_ACTIVE")) {
          throw err; // "not active" means it is already withdrawn: carry on to the apply
        }
      }
      setRerun({ phase: "applying" });
      const fired = await demoFire({ fiduciary: QUICKLOAN.address, purposeCode: PURPOSE, principal: who, action: "loan_decision" });
      setRerun({ phase: "done", decision: fired.decision, reason: fired.reason });
    } catch (err) {
      if (err instanceof Error && err.message === "cancelled") return;
      setRerun({ phase: "error", message: err instanceof Error ? err.message : "Something went wrong" });
    }
  }, []);

  // --- save ---

  const saveSession = useCallback(() => {
    const file = buildReplay(
      frames.current,
      row?.body ?? null,
      admin ? { status: admin.status ?? 200, body: Object.fromEntries(admin.view.fields.map((f) => [f.name, f.value])) } : { status: 200, body: {} },
    );
    const url = URL.createObjectURL(new Blob([JSON.stringify(file, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `flow-session-${file.recordedAt.replace(/[:.]/g, "-")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [row, admin]);

  useEffect(() => () => playout.clear(), [playout]);

  return {
    flow,
    privacy,
    verdict: privacyVerdict(privacy, flow.decisionsSeen),
    row,
    mode,
    online,
    replayError,
    setReplay,
    admin,
    database,
    viewCustomerData,
    readDatabase,
    rerun,
    withdrawAndRerun,
    cancelRerun,
    saveSession,
  };
}
