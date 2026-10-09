// The console operator's sign-in, kept in this browser (see consoleLogin in api.ts). Storage can be blocked or absent
// (private windows, tests), and then the operator is simply not signed in.
export function storedConsoleToken(): string | null {
  try {
    return localStorage.getItem("console_token");
  } catch {
    return null;
  }
}

export function storedConsoleOperator(): string | null {
  try {
    return localStorage.getItem("console_operator");
  } catch {
    return null;
  }
}
