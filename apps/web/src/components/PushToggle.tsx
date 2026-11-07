import { useEffect, useState } from "react";
import { usePushConfig, usePushSubscribe, usePushTest, usePushUnsubscribe } from "@/api/hooks";
import { Button, Icon } from "@/components/ui";
import { currentSubscription, pushBlocked, pushSupported } from "@/lib/push";

/** Per-device push notification control (System menu in the HUD, sidebar in DM//CONTROL). */
export function PushToggle() {
  const cfg = usePushConfig();
  const sub = usePushSubscribe();
  const unsub = usePushUnsubscribe();
  const test = usePushTest();
  const [state, setState] = useState<"checking" | "on" | "off">("checking");

  useEffect(() => {
    let alive = true;
    currentSubscription()
      .then((s) => alive && setState(s ? "on" : "off"))
      .catch(() => alive && setState("off"));
    return () => {
      alive = false;
    };
  }, [cfg.data?.devices, sub.isSuccess, unsub.isSuccess]);

  if (!pushSupported()) return <p className="text-[0.68rem] text-dim">Push notifications are not supported in this browser. On iPhone, add the app to the Home Screen first.</p>;
  if (cfg.data && !cfg.data.enabled) return <p className="text-[0.68rem] text-dim">Push is disabled on this server (no VAPID keys configured).</p>;
  const blocked = pushBlocked();
  const on = state === "on";

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs" data-testid="push-toggle">
      <Icon name={on ? "bell-ring" : "bell-off"} size={14} className={on ? "text-ok" : "text-muted"} />
      <span className={on ? "text-text" : "text-muted"}>
        {state === "checking" ? "Checking notifications…" : on ? "Notifications on for this device" : blocked ? "Notifications blocked in browser settings" : "Notifications off"}
      </span>
      {cfg.data && cfg.data.devices > 0 && (
        <span className="text-dim">
          · {cfg.data.devices} device{cfg.data.devices === 1 ? "" : "s"}
        </span>
      )}
      {on ? (
        <>
          <Button size="xs" variant="ghost" icon="send" disabled={test.isPending} onClick={() => test.mutate()}>
            Test
          </Button>
          <Button size="xs" variant="ghost" icon="bell-off" disabled={unsub.isPending} onClick={() => unsub.mutate()}>
            Turn off
          </Button>
        </>
      ) : (
        <Button size="xs" color="amber" icon="bell-ring" disabled={blocked || !cfg.data?.publicKey || sub.isPending || state === "checking"} onClick={() => cfg.data?.publicKey && sub.mutate(cfg.data.publicKey)}>
          {sub.isPending ? "Enabling…" : "Enable"}
        </Button>
      )}
    </div>
  );
}
