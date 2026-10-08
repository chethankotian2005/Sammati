import type { ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { FlowPanel } from "../flow/FlowInspector";

/** `/stage/flow` (V-07): the Data Flow Inspector on its own screen. `?replay=1` starts on the recording. */
export function StageFlow(): ReactNode {
  const [params] = useSearchParams();
  return <FlowPanel startInReplay={params.get("replay") === "1"} />;
}
