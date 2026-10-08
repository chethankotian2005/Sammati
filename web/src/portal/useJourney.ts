/** Connects the portal's state machine to the browser: fetch for the three calls, the live socket for the events. */

import { useEffect, useRef, useState } from "react";
import { SEED_FIDUCIARIES, type CreateRequestResponse, type FiduciaryConsentsResponse } from "@sammati/shared";
import { CORE_URL } from "../core";
import { useAnyWsFrame, useWsReadyState } from "../ws";
import { Journey, type JourneyDeps, type JourneyState } from "./journey";

export const QUICKLOAN = SEED_FIDUCIARIES.find((f) => f.slug === "quickloan")!;

/** Where QuickLoan's own backend is. */
export const COMPANY_URL: string = import.meta.env.VITE_QUICKLOAN_URL ?? `http://localhost:${QUICKLOAN.port}`;

async function json(res: Response): Promise<unknown> {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

export const browserDeps: JourneyDeps = {
  async createRequest(alias, purposes) {
    const res = await fetch(`${CORE_URL}/v1/fiduciaries/${QUICKLOAN.address}/requests`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ purposes, customerAlias: alias }),
    });
    const body = (await json(res)) as (CreateRequestResponse & { error?: { message?: string } }) | null;
    if (!res.ok || !body?.requestId) throw new Error(body?.error?.message ?? `Sammati answered ${res.status}`);
    return { requestId: body.requestId, qrPayload: body.qrPayload };
  },
  async consentRows() {
    const res = await fetch(`${CORE_URL}/v1/fiduciaries/${QUICKLOAN.address}/consents`);
    if (!res.ok) throw new Error(`Sammati answered ${res.status}`);
    return ((await json(res)) as FiduciaryConsentsResponse).rows;
  },
  async apply(alias, principal) {
    const res = await fetch(`${COMPANY_URL}/customers/${encodeURIComponent(alias)}/apply`, {
      method: "POST",
      headers: { "x-sammati-principal": principal },
    });
    return { status: res.status, body: await json(res) };
  },
  now: () => Date.now(),
};

export interface JourneyView {
  journey: Journey;
  state: JourneyState;
  /** The live socket is connected. */
  online: boolean;
}

export function useJourney(deps: JourneyDeps = browserDeps): JourneyView {
  const ref = useRef<Journey | null>(null);
  ref.current ??= new Journey(deps);
  const journey = ref.current;
  const [state, setState] = useState(journey.state);
  useEffect(() => journey.subscribe(setState), [journey]);
  useAnyWsFrame((frame) => void journey.onFrame(frame));
  return { journey, state, online: useWsReadyState() === WebSocket.OPEN };
}
