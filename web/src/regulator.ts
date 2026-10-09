// The regulator's access code lives for this tab only (sessionStorage): storage can be blocked, and then the code is
// simply asked for again. The Auditor and the Registrations tab share it, so it is asked once (trd.md §10.8).
const CODE_KEY = "sammati.regulatorCode";

export function savedRegulatorCode(): string {
  try {
    return sessionStorage.getItem(CODE_KEY) ?? "";
  } catch {
    return "";
  }
}

export function saveRegulatorCode(code: string): void {
  try {
    sessionStorage.setItem(CODE_KEY, code);
  } catch {
    // ignore
  }
}
