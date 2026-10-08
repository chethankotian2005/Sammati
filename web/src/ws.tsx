/**
 * Reconnecting WebSocket client and typed React hooks for the five Sammati WS
 * events (trd.md §6.5). The connection is app-level: one WsProvider wraps the
 * whole app and every hook subscribes to events through context.
 *
 * Reconnection strategy: exponential back-off starting at 500 ms, capped at
 * 16 s. A ping/pong heartbeat is NOT implemented here — the spec does not
 * require it and it would add complexity without demo value.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type {
  AccessLoggedEvent,
  AnchorPostedEvent,
  CascadeUpdatedEvent,
  ConsentUpdatedEvent,
  TamperAlertEvent,
  VaultEvent,
  VaultEventName,
  WsEvent,
  WsEventName,
  WsSubscribe,
  WsTopic,
} from "@sammati/shared";
import { CORE_URL } from "./core";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Listener<E extends WsEvent> = (event: E) => void;
type AnyListener = Listener<WsEvent>;

export interface WsContextValue {
  /** Subscribe to a typed WS event. Returns an unsubscribe function. */
  on<E extends WsEvent>(name: E["event"], cb: Listener<E>): () => void;
  /** Every frame Core sends, whatever its type, parsed but untyped. For checks that must see everything. */
  onAny(cb: (frame: unknown) => void): () => void;
  /** Current connection status (WebSocket.CONNECTING / OPEN / CLOSED). */
  readyState: number;
}

// ---------------------------------------------------------------------------
// Internal client (not exported – use the context / hooks instead)
// ---------------------------------------------------------------------------

class ReconnectingWsClient {
  private ws: WebSocket | null = null;
  private topics: WsTopic[] = [];
  private listeners = new Map<WsEventName, Set<AnyListener>>();
  private anyListeners = new Set<(frame: unknown) => void>();
  private retryMs = 500;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;
  private onStateChange: (state: number) => void;

  constructor(onStateChange: (state: number) => void) {
    this.onStateChange = onStateChange;
  }

  connect(wsUrl: string, topics: WsTopic[]): void {
    this.topics = topics;
    this._open(wsUrl);
  }

  private _open(wsUrl: string): void {
    if (this.destroyed) return;
    this.ws = new WebSocket(wsUrl);
    this.onStateChange(WebSocket.CONNECTING);

    this.ws.onopen = () => {
      this.retryMs = 500; // reset back-off on success
      this.onStateChange(WebSocket.OPEN);
      // Send subscription immediately after open
      const msg: WsSubscribe = { sub: this.topics };
      this.ws!.send(JSON.stringify(msg));
    };

    this.ws.onmessage = (ev: MessageEvent) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(ev.data as string);
      } catch {
        return; // malformed frame, ignore
      }
      for (const cb of this.anyListeners) cb(parsed);
      const evt = parsed as WsEvent;
      const subs = this.listeners.get(evt.event);
      if (subs) {
        for (const cb of subs) cb(evt);
      }
    };

    this.ws.onerror = () => {
      // onerror is always followed by onclose; let onclose handle reconnect.
    };

    this.ws.onclose = () => {
      if (this.destroyed) return;
      this.onStateChange(WebSocket.CLOSED);
      this.retryTimer = setTimeout(() => {
        this.retryMs = Math.min(this.retryMs * 2, 16_000);
        this._open(wsUrl);
      }, this.retryMs);
    };
  }

  on<E extends WsEvent>(name: E["event"], cb: Listener<E>): () => void {
    if (!this.listeners.has(name)) {
      this.listeners.set(name, new Set());
    }
    this.listeners.get(name)!.add(cb as AnyListener);
    return () => {
      this.listeners.get(name)?.delete(cb as AnyListener);
    };
  }

  onAny(cb: (frame: unknown) => void): () => void {
    this.anyListeners.add(cb);
    return () => {
      this.anyListeners.delete(cb);
    };
  }

  destroy(): void {
    this.destroyed = true;
    if (this.retryTimer !== null) clearTimeout(this.retryTimer);
    this.ws?.close();
  }
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const WsContext = createContext<WsContextValue | null>(null);

function useWsContext(): WsContextValue {
  const ctx = useContext(WsContext);
  if (!ctx) throw new Error("useWsContext must be used inside <WsProvider>");
  return ctx;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

interface WsProviderProps {
  topics: WsTopic[];
  children: React.ReactNode;
}

export function WsProvider({ topics, children }: WsProviderProps): React.ReactElement {
  const [readyState, setReadyState] = useState<number>(WebSocket.CONNECTING);
  const clientRef = useRef<ReconnectingWsClient | null>(null);

  // Build the WS URL from CORE_URL (http → ws, https → wss)
  const wsUrl = CORE_URL.replace(/^http/, "ws") + "/ws";

  useEffect(() => {
    const client = new ReconnectingWsClient(setReadyState);
    clientRef.current = client;
    client.connect(wsUrl, topics);
    return () => {
      client.destroy();
      clientRef.current = null;
    };
    // topics is stable (module-level constant); reconnect only when wsUrl changes
  }, [wsUrl]);

  const on = useCallback(
    <E extends WsEvent>(name: E["event"], cb: Listener<E>) => {
      return clientRef.current?.on(name, cb) ?? (() => undefined);
    },
    [],
  );

  const onAny = useCallback((cb: (frame: unknown) => void) => clientRef.current?.onAny(cb) ?? (() => undefined), []);

  const value: WsContextValue = { on, onAny, readyState };

  return (
    <WsContext.Provider value={value}>
      {children}
    </WsContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Typed hooks – one per WS event name
// ---------------------------------------------------------------------------

/**
 * Generic hook: subscribes to one WS event, calls the callback on each
 * message. Stable reference — the callback is wrapped in a ref so callers
 * don't need to memoize it.
 */
function useWsEvent<E extends WsEvent>(
  name: E["event"],
  cb: Listener<E>,
): void {
  const ctx = useWsContext();
  const cbRef = useRef(cb);
  cbRef.current = cb;

  useEffect(() => {
    return ctx.on<E>(name, (evt) => cbRef.current(evt));
  }, [ctx, name]);
}

/** Fires for every frame Core sends, including acknowledgements, before any typed listener. */
export function useAnyWsFrame(cb: (frame: unknown) => void): void {
  const ctx = useWsContext();
  const cbRef = useRef(cb);
  cbRef.current = cb;
  useEffect(() => ctx.onAny((frame) => cbRef.current(frame)), [ctx]);
}

const VAULT_EVENT_NAMES: readonly VaultEventName[] = ["vault.encrypted", "vault.stored", "processor.requested", "processor.decrypting", "processor.decided", "vault.erased"];

/** Fires for every confidential-processing event (trd.md §6.5): handles, hashes, codes and timings, never data. */
export function useVaultEvents(cb: Listener<VaultEvent>): void {
  // A fixed list, so the hooks below are called in the same order on every render.
  for (const name of VAULT_EVENT_NAMES) useWsEvent<VaultEvent>(name, cb);
}

/** Fires whenever consent.updated arrives. */
export function useConsentUpdated(cb: Listener<ConsentUpdatedEvent>): void {
  useWsEvent("consent.updated", cb);
}

/** Fires whenever access.logged arrives. */
export function useAccessLogged(cb: Listener<AccessLoggedEvent>): void {
  useWsEvent("access.logged", cb);
}

/** Fires whenever cascade.updated arrives. */
export function useCascadeUpdated(cb: Listener<CascadeUpdatedEvent>): void {
  useWsEvent("cascade.updated", cb);
}

/** Fires whenever anchor.posted arrives. */
export function useAnchorPosted(cb: Listener<AnchorPostedEvent>): void {
  useWsEvent("anchor.posted", cb);
}

/** Fires whenever tamper.alert arrives. */
export function useTamperAlert(cb: Listener<TamperAlertEvent>): void {
  useWsEvent("tamper.alert", cb);
}

/**
 * Returns the current WS ready state so components can show a connection
 * indicator without subscribing to events.
 */
export function useWsReadyState(): number {
  return useWsContext().readyState;
}

export { WsContext };
