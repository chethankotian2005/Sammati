import { Navigate, Route, Routes } from "react-router-dom";
import { SEED_FIDUCIARIES } from "@sammati/shared";
import { WsProvider } from "./ws";
import { Auditor } from "./pages/Auditor";
import { Company } from "./pages/Company";
import { Gallery } from "./pages/Gallery";
import { Stage } from "./pages/Stage";

// Subscribe to all fiduciary topics + auditor so every page gets live events.
const WS_TOPICS = [
  ...SEED_FIDUCIARIES.map((f) => `fiduciary:${f.address}`),
  "auditor",
];

export function AppRoutes() {
  return (
    <WsProvider topics={WS_TOPICS}>
      <Routes>
        <Route path="/" element={<Navigate to="/company/quickloan" replace />} />
        <Route path="/company/:id" element={<Company />} />
        <Route path="/auditor" element={<Auditor />} />
        <Route path="/stage" element={<Stage />} />
        <Route path="/gallery" element={<Gallery />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </WsProvider>
  );
}
