import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { Icon } from "@/components/ui";
import { androidIntentUrl, appLikelyInstalled, isAndroid } from "@/lib/pwa";

const DISMISS_KEY = "neom.openInAppDismissed";

/**
 * Shown in a browser tab when the app is installed on this device: one tap moves the current page
 * (e.g. a shared sheet link opened from chat) into the installed PWA. See lib/pwa.ts for limits.
 */
export function OpenInAppBanner() {
  const loc = useLocation();
  const [show, setShow] = useState(false);

  useEffect(() => {
    let alive = true;
    let dismissed = false;
    try {
      dismissed = sessionStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      /* ignore */
    }
    if (dismissed) return;
    void appLikelyInstalled().then((installed) => alive && setShow(installed));
    return () => {
      alive = false;
    };
  }, []);

  if (!show) return null;
  const dismiss = () => {
    setShow(false);
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
  };
  const href = window.location.origin + loc.pathname + loc.search + loc.hash;

  return (
    <div role="status" className="sticky top-0 z-50 flex flex-wrap items-center gap-2 border-b border-cyan/40 bg-bg-0/95 px-3 py-2 text-xs text-text backdrop-blur" data-testid="open-in-app">
      <Icon name="app-window" size={14} className="text-cyan" />
      <span className="min-w-0 flex-1">NEOM//NET is installed on this device.</span>
      {isAndroid() ? (
        <a href={androidIntentUrl(href)} className="hud-btn hud-btn-solid !min-h-10 !px-3 !text-[0.65rem]">
          Open in app
        </a>
      ) : (
        <span className="text-muted">Use “Open in app” in the address bar.</span>
      )}
      <button type="button" onClick={dismiss} className="flex h-8 w-8 items-center justify-center text-muted hover:text-text" aria-label="Dismiss">
        <Icon name="x" size={14} />
      </button>
    </div>
  );
}
