import { Navigate, Route, Routes } from "react-router-dom";
import { Auditor } from "./pages/Auditor";
import { Company } from "./pages/Company";
import { Stage } from "./pages/Stage";

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/company/quickloan" replace />} />
      <Route path="/company/:id" element={<Company />} />
      <Route path="/auditor" element={<Auditor />} />
      <Route path="/stage" element={<Stage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
