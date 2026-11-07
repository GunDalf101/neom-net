/**
 * Installed-app detection and "open in the app" hand-off.
 *
 * Browsers do not let a page force itself into an installed PWA. What we can do:
 *  - the manifest asks for link capturing (`handle_links: "preferred"`, `launch_handler`), so on
 *    Android (WebAPK) and desktop Chromium a link opened from another app (chat, mail) opens the
 *    installed app directly;
 *  - when a link still ends up in a browser tab on a device where the app is installed, we show a
 *    one-tap "Open in app" banner (Android: an intent URL the installed app claims).
 * iOS keeps Home Screen apps fully separate from Safari, so none of this applies there.
 */
const INSTALLED_KEY = "neom.pwaInstalled";

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    window.matchMedia?.("(display-mode: window-controls-overlay)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function isAndroid(): boolean {
  return /Android/i.test(navigator.userAgent);
}

function markInstalled(): void {
  try {
    localStorage.setItem(INSTALLED_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
}

/** Call once at startup: remembers that this browser profile has the app installed. */
export function trackInstallState(): void {
  if (typeof window === "undefined") return;
  if (isStandalone()) markInstalled();
  window.addEventListener("appinstalled", markInstalled);
}

/** Best-effort: true when this browser profile has launched or installed the app before. */
export async function appLikelyInstalled(): Promise<boolean> {
  if (isStandalone()) return false;
  const nav = navigator as Navigator & { getInstalledRelatedApps?: () => Promise<unknown[]> };
  try {
    if (nav.getInstalledRelatedApps && (await nav.getInstalledRelatedApps()).length > 0) return true;
  } catch {
    /* not supported for this origin */
  }
  try {
    return Boolean(localStorage.getItem(INSTALLED_KEY));
  } catch {
    return false;
  }
}

/** Android intent for the current URL; the installed WebAPK is the registered handler for its scope. */
export function androidIntentUrl(href = window.location.href): string {
  const u = new URL(href);
  return `intent://${u.host}${u.pathname}${u.search}${u.hash}#Intent;scheme=${u.protocol.replace(":", "")};action=android.intent.action.VIEW;S.browser_fallback_url=${encodeURIComponent(href)};end`;
}
