/**
 * WsIndicator — small pill in the top bar showing WebSocket connection state.
 * Distinct from CoreChip (which shows HTTP /v1/health).
 */

import type { ReactNode } from "react";
import { useWsReadyState } from "../ws";

export function WsIndicator(): ReactNode {
  const state = useWsReadyState();

  let label: string;
  let dotClass: string;

  if (state === WebSocket.OPEN) {
    label = "Live";
    dotClass = "bg-allow";
  } else if (state === WebSocket.CONNECTING) {
    label = "Connecting";
    dotClass = "bg-marigold animate-pulse";
  } else {
    label = "Disconnected";
    dotClass = "bg-block";
  }

  return (
    <span
      className="inline-flex items-center gap-2 rounded-pill border border-line bg-surface px-3 py-1 text-sm text-mute"
      aria-label={`WebSocket: ${label}`}
    >
      <span className={`h-2 w-2 rounded-pill ${dotClass}`} aria-hidden="true" />
      {label}
    </span>
  );
}
