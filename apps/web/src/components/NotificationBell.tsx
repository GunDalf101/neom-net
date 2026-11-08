import type { MessageDto } from "@neom/shared";
import clsx from "clsx";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMarkMessagesRead, useMessages } from "@/api/hooks";
import { Button, Icon } from "@/components/ui";

const KIND_LABEL: Record<MessageDto["kind"], string> = { whisper: "whisper", reveal: "revealed", broadcast: "to everyone" };

function when(iso: string): string {
  const d = new Date(iso);
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)}h`;
  return d.toLocaleDateString();
}

/**
 * Navbar bell: messages addressed to this user in the campaign, newest first, with an unread badge.
 * Opening the panel marks what is shown as read (the DM also sees messages they sent, greyed).
 */
export function NotificationBell({ campaignId, userId, className }: { campaignId: string; userId: string; className?: string }) {
  const messages = useMessages(campaignId);
  const markRead = useMarkMessagesRead(campaignId);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  const inbox = useMemo(() => (messages.data ?? []).filter((m) => m.toUserId === userId || m.fromUserId === userId).slice(0, 40), [messages.data, userId]);
  const unread = inbox.filter((m) => m.toUserId === userId && !m.readAt);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && unread.length) markRead.mutate(unread.map((m) => m.id));
  };

  return (
    <div ref={box} className={clsx("relative", className)} data-testid="notification-bell">
      <button type="button" onClick={toggle} className={clsx("nav-box relative !px-2 !py-1.5", open && "active")} aria-label={unread.length ? `Notifications, ${unread.length} unread` : "Notifications"} aria-expanded={open}>
        <Icon name={unread.length ? "bell-ring" : "bell"} size={14} />
        {unread.length > 0 && (
          <span className="num absolute -right-1.5 -top-1.5 min-w-[1.1rem] rounded-sm bg-crimson px-1 text-center text-[0.58rem] font-bold leading-[1.1rem] text-white shadow-[0_0_8px_var(--color-crimson)]" data-testid="unread-count">
            {unread.length > 99 ? "99+" : unread.length}
          </span>
        )}
      </button>
      {open && (
        <div className="hud-panel absolute right-0 top-full z-50 mt-2 w-[min(92vw,22rem)] p-2 text-xs" style={{ ["--panel-accent" as string]: "var(--color-amber)" }} role="dialog" aria-label="Notifications">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="hud-title text-[0.6rem] text-amber">Messages</span>
            {inbox.some((m) => m.toUserId === userId && !m.readAt) && (
              <Button size="xs" variant="ghost" onClick={() => markRead.mutate(undefined)}>
                Mark all read
              </Button>
            )}
          </div>
          {messages.isLoading && <div className="text-dim">Loading…</div>}
          {!messages.isLoading && inbox.length === 0 && <div className="py-3 text-center text-dim">No messages yet. The DM can reach you here.</div>}
          <ul className="max-h-[60vh] divide-y divide-line/60 overflow-y-auto">
            {inbox.map((m) => {
              const mine = m.fromUserId === userId;
              const fresh = !mine && !m.readAt;
              return (
                <li key={m.id} className={clsx("py-1.5", mine && "opacity-70")}>
                  <div className="flex items-center gap-2">
                    <span className={clsx("font-semibold", fresh ? "text-amber" : "text-text")}>{mine ? `To ${m.toName ?? "player"}` : m.fromName}</span>
                    <span className="text-[0.6rem] uppercase tracking-wider text-dim">{KIND_LABEL[m.kind]}</span>
                    <span className="num ml-auto text-[0.6rem] text-dim">{when(m.createdAt)}</span>
                  </div>
                  <div className={clsx("mt-0.5 whitespace-pre-wrap break-words", fresh ? "text-text" : "text-text/80")}>{m.body}</div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
