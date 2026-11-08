import type { CampaignEventDto, MessageDto } from "@neom/shared";
import clsx from "clsx";
import { useEffect, useMemo, useRef, useState } from "react";
import { useCampaign, useCharacters, useEvents, useMarkMessagesRead, useMarkNotificationsSeen, useMessages } from "@/api/hooks";
import { Button, Icon } from "@/components/ui";

const KIND_LABEL: Record<MessageDto["kind"], string> = { whisper: "whisper", reveal: "revealed", broadcast: "to everyone" };
const EVENT_ICON: Record<string, string> = {
  "mission.assigned": "target", "mission.status": "target", "mission.created": "target",
  "character.assigned": "hand-metal", "roll.requested": "dices", "item.granted": "package-plus",
  "hp.damage": "heart-crack", "hp.heal": "heart-pulse", "condition.applied": "alert-triangle", "condition.removed": "check",
  "override.set": "sliders-horizontal", "effect.applied": "zap", "effect.expired": "zap-off", "rule.pending": "gavel",
  "member.joined": "user-plus", "mission.accepted": "check-circle", "mission.declined": "x-circle", "grant.credits": "coins", "grant.xp": "star", "grant.progressionPoints": "git-branch", "level.up": "trending-up",
};
/** Event types that count as notifications for the person they concern. */
const NOTIFY_TYPES = new Set(Object.keys(EVENT_ICON));

function when(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)}h`;
  return new Date(iso).toLocaleDateString();
}

type Item = { id: string; at: string; unread: boolean; kind: "message" | "event"; message?: MessageDto; event?: CampaignEventDto };

/**
 * Navbar bell = inbox: chat messages addressed to this user plus the campaign events that concern them
 * (missions assigned, sheets handed over, DM roll requests, damage, items, approvals for the DM…). Opening it
 * marks messages read and stamps the server-side "seen" marker, so the badge clears on every device.
 */
export function NotificationBell({ campaignId, userId, className, onOpenChat }: { campaignId: string; userId: string; className?: string; onOpenChat?: () => void }) {
  const campaign = useCampaign(campaignId);
  const messages = useMessages(campaignId);
  const events = useEvents(campaignId);
  const characters = useCharacters(campaignId);
  const markRead = useMarkMessagesRead(campaignId);
  const markSeen = useMarkNotificationsSeen(campaignId);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const isDm = campaign.data?.role === "DM";
  const seenAt = campaign.data?.notificationsSeenAt ?? null;

  const items = useMemo<Item[]>(() => {
    const mine = new Set((characters.data ?? []).filter((c) => c.ownerUserId === userId).map((c) => c.id));
    const msgs: Item[] = (messages.data ?? [])
      .filter((m) => m.toUserId === userId)
      .map((m) => ({ id: `m:${m.id}`, at: m.createdAt, unread: !m.readAt, kind: "message", message: m }));
    const evs: Item[] = (events.data ?? [])
      .filter((e) => e.actorUserId !== userId && NOTIFY_TYPES.has(e.type))
      .filter((e) => (isDm ? e.type === "rule.pending" || e.type === "member.joined" || e.type === "character.assigned" || e.type === "mission.accepted" || e.type === "mission.declined" : (e.characterId ? mine.has(e.characterId) : e.type.startsWith("mission."))))
      .map((e) => ({ id: `e:${e.id}`, at: e.createdAt, unread: !seenAt || e.createdAt > seenAt, kind: "event", event: e }));
    return [...msgs, ...evs].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 50);
  }, [messages.data, events.data, characters.data, userId, isDm, seenAt]);
  const unread = items.filter((i) => i.unread);

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
    if (next && unread.length) {
      const msgIds = unread.filter((i) => i.kind === "message").map((i) => i.message!.id);
      if (msgIds.length) markRead.mutate(msgIds);
      if (unread.some((i) => i.kind === "event")) markSeen.mutate();
    }
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
        <div className="hud-panel absolute right-0 top-full z-50 mt-2 w-[min(92vw,24rem)] p-2 text-xs" style={{ ["--panel-accent" as string]: "var(--color-amber)" }} role="dialog" aria-label="Notifications">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span className="hud-title text-[0.6rem] text-amber">Notifications</span>
            <div className="flex items-center gap-1">
              {onOpenChat && (
                <Button size="xs" color="amber" icon="message-square" onClick={() => { setOpen(false); onOpenChat(); }}>
                  Open chat
                </Button>
              )}
              {items.some((i) => i.kind === "message" && i.unread) && (
                <Button size="xs" variant="ghost" onClick={() => markRead.mutate(undefined)}>
                  Mark all read
                </Button>
              )}
            </div>
          </div>
          {(messages.isLoading || events.isLoading) && <div className="text-dim">Loading…</div>}
          {!messages.isLoading && !events.isLoading && items.length === 0 && <div className="py-3 text-center text-dim">Nothing yet. Messages from the DM, missions, hand-offs and roll requests show up here.</div>}
          <ul className="max-h-[60vh] divide-y divide-line/60 overflow-y-auto">
            {items.map((i) =>
              i.kind === "message" ? (
                <li key={i.id} className="py-1.5">
                  <div className="flex items-center gap-2">
                    <Icon name="message-square" size={12} className={i.unread ? "text-amber" : "text-dim"} />
                    <span className={clsx("font-semibold", i.unread ? "text-amber" : "text-text")}>{i.message!.fromName}</span>
                    <span className="text-[0.6rem] uppercase tracking-wider text-dim">{KIND_LABEL[i.message!.kind]}</span>
                    <span className="num ml-auto text-[0.6rem] text-dim">{when(i.at)}</span>
                  </div>
                  <div className={clsx("mt-0.5 whitespace-pre-wrap break-words", i.unread ? "text-text" : "text-text/80")}>{i.message!.body}</div>
                </li>
              ) : (
                <li key={i.id} className="py-1.5">
                  <div className="flex items-center gap-2">
                    <Icon name={EVENT_ICON[i.event!.type] ?? "bell"} size={12} className={i.unread ? "text-cyan" : "text-dim"} />
                    <span className={clsx("min-w-0 flex-1 truncate", i.unread ? "text-text" : "text-text/80")} title={i.event!.summary}>
                      {i.event!.summary}
                    </span>
                    <span className="num shrink-0 text-[0.6rem] text-dim">{when(i.at)}</span>
                  </div>
                  <div className="text-[0.6rem] text-dim">
                    {i.event!.actorName ?? "SYSTEM"} · {i.event!.type}
                  </div>
                </li>
              ),
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
