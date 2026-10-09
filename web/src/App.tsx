import { Navigate, Route, Routes } from "react-router-dom";
import { DirectoryProvider, useDirectory } from "./directory";
import { WsProvider } from "./ws";
import { Auditor } from "./pages/Auditor";
import { Company } from "./pages/Company";
import { Join } from "./pages/Join";
import { JoinStatus } from "./pages/JoinStatus";
import { PortalPage } from "./portal/PortalPage";
import { OperatorLogin } from "./pages/OperatorLogin";
import { LENDER_URL } from "./portal/useJourney";
import { storedConsoleOperator } from "./session";

// The auditor topic carries every company's events; the directory adds `fiduciary:<address>` for each approved company
// (R-04), so a company that joins later is heard without a reload.
const WS_TOPICS = ["auditor"];

/** "/" opens the first company's console, whichever company that is. */
function Home() {
  const { fiduciaries, status } = useDirectory();
  const operatorStr = storedConsoleOperator();
  const operator = operatorStr ? JSON.parse(operatorStr) : null;
  const myFids = operator ? fiduciaries.filter(f => operator.fiduciaries.some((of: any) => of.address.toLowerCase() === f.address.toLowerCase())) : [];
  
  if (!operator) return <Navigate to="/console/login" replace />;
  const first = myFids[0];
  if (first) return <Navigate to={`/company/${first.slug}`} replace />;
  return <main className="grid min-h-screen place-items-center bg-paper p-6 text-lg font-bold text-mute">{status === "error" ? "Cannot load the companies. Is Core running?" : status === "loading" ? "Loading companies…" : "You don't own any companies."}</main>;
}

/** A hosted build with no sample company behind it (VITE_LENDER_URL unset). */
function PortalUnavailable() {
  return <main className="grid min-h-screen place-items-center bg-paper p-6 text-lg font-bold text-mute">This customer portal is not available in this deployment.</main>;
}

export function AppRoutes() {
  return (
    <WsProvider topics={WS_TOPICS}>
      <DirectoryProvider>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/company/:id" element={<Company />} />
        <Route path="/auditor" element={<Auditor />} />
        <Route path="/portal/:slug" element={LENDER_URL ? <PortalPage /> : <PortalUnavailable />} />
        <Route path="/join" element={<Join />} />
        <Route path="/join/:applicationId" element={<JoinStatus />} />
        <Route path="/console/login" element={<OperatorLogin />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </DirectoryProvider>
    </WsProvider>
  );
}
