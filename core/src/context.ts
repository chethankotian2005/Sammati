import type { WsEvent } from "@sammati/shared";
import type { Config } from "./config";
import type { StubStore } from "./store";

/** What every route handler needs; `publish` is a no-op until a WebSocket hub is attached. */
export interface Ctx {
  store: StubStore;
  config: Config;
  publish: (event: WsEvent) => void;
}
