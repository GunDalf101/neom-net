/**
 * Where to go after signing in. Router state carries it on the happy path; sessionStorage keeps it
 * when the user detours (login → register, a reload of the login page, a password manager redirect)
 * so a shared link always lands on the sheet once the user is authenticated.
 */
const KEY = "neom.returnTo";

/** Only same-origin app paths: never `//host`, `/api/…`, or the auth pages themselves. */
export function safeReturnTo(path: unknown): string | null {
  if (typeof path !== "string" || !path.startsWith("/") || path.startsWith("//") || path.startsWith("/\\")) return null;
  if (/^\/(api|socket\.io)\//.test(path) || /^\/(login|register)(?:[/?#]|$)/.test(path)) return null;
  return path;
}

export function rememberReturnTo(path: string): void {
  const safe = safeReturnTo(path);
  if (!safe || safe === "/") return;
  try {
    sessionStorage.setItem(KEY, safe);
  } catch {
    /* storage blocked: router state still carries it */
  }
}

export function peekReturnTo(): string | null {
  try {
    return safeReturnTo(sessionStorage.getItem(KEY));
  } catch {
    return null;
  }
}

export function clearReturnTo(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
