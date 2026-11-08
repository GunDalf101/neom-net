import type { CampaignDto, MessageDto } from "@neom/shared";
import clsx from "clsx";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMarkMessagesRead, useMessages, useSendMessage } from "@/api/hooks";
import { Button, Icon, Select, Textarea } from "@/components/ui";

function stamp(iso: string): string {
  const d = new Date(iso);
  const today = new Date().toDateString() === d.toDateString();
  return today ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : d.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

/**
 * Player ↔ DM chat. Players have one thread (the DM); the DM sees a thread per member with unread counts.
 * Messages are the same rows the notification bell shows; viewing a thread marks it read.
 */
export function ChatPanel({ campaign, meId, initialPeer }: { campaign: CampaignDto; meId: string; initialPeer?: string | null }) {
  const isDm = campaign.role === "DM";
  const messages = useMessages(campaign.id);
  const send = useSendMessage(campaign.id);
  const markRead = useMarkMessagesRead(campaign.id);
  const others = campaign.members.filter((m) => m.userId !== meId);
  const dmMember = campaign.members.find((m) => m.role === "DM" && m.userId !== meId) ?? others[0];
  const [peer, setPeer] = useState<string | null>(initialPeer ?? (isDm ? others[0]?.userId ?? null : dmMember?.userId ?? null));
  const [kind, setKind] = useState<"whisper" | "reveal">("whisper");
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  const all = messages.data ?? [];
  const byPeer = useMemo(() => {
    const map = new Map<string, MessageDto[]>();
    for (const m of all) {
      const other = m.fromUserId === meId ? m.toUserId : m.toUserId === meId ? m.fromUserId : null;
      if (!other) continue;
      (map.get(other) ?? map.set(other, []).get(other)!).push(m);
    }
    for (const list of map.values()) list.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return map;
  }, [all, meId]);
  const thread = peer ? byPeer.get(peer) ?? [] : [];
  const unreadIn = (id: string) => (byPeer.get(id) ?? []).filter((m) => m.toUserId === meId && !m.readAt).length;

  useEffect(() => {
    const unread = thread.filter((m) => m.toUserId === meId && !m.readAt).map((m) => m.id);
    if (unread.length) markRead.mutate(unread);
    endRef.current?.scrollIntoView({ block: "end" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peer, thread.length]);

  const submit = () => {
    const body = draft.trim();
    if (!body || !peer) return;
    send.mutateAsync({ userId: peer, message: body, kind: isDm ? kind : "whisper" }).then(() => setDraft(""));
  };
  const peerName = campaign.members.find((m) => m.userId === peer)?.username ?? "—";

  return (
    <div className="flex h-full min-h-[420px] flex-col gap-2 text-sm" data-testid="chat-panel">
      {isDm && (
        <div className="flex flex-wrap gap-1">
          {others.map((m) => {
            const n = unreadIn(m.userId);
            return (
              <button key={m.userId} type="button" className={clsx("hud-tab flex items-center gap-1 !px-2 !py-1 !text-[0.55rem]", peer === m.userId && "active")} onClick={() => setPeer(m.userId)}>
                <span className={clsx("inline-block h-1.5 w-1.5 rounded-full", m.online ? "bg-ok" : "bg-dim")} />
                {m.username}
                {n > 0 && <span className="num rounded-sm bg-crimson px-1 text-[0.5rem] text-white">{n}</span>}
              </button>
            );
          })}
          {others.length === 0 && <span className="text-xs text-dim">Nobody else has joined yet.</span>}
        </div>
      )}
      <div className="hud-title text-[0.6rem]">{isDm ? `Thread with ${peerName}` : `Your line to the DM (${peerName})`}</div>
      <div className="hud-panel min-h-0 flex-1 overflow-y-auto p-2" style={{ ["--panel-accent" as string]: "var(--color-amber)" }}>
        {messages.isLoading && <div className="text-xs text-dim">Loading…</div>}
        {!messages.isLoading && thread.length === 0 && <div className="py-6 text-center text-xs text-dim">No messages yet. Say something.</div>}
        <ul className="space-y-1.5">
          {thread.map((m) => {
            const mine = m.fromUserId === meId;
            return (
              <li key={m.id} className={clsx("flex", mine ? "justify-end" : "justify-start")}>
                <div className={clsx("max-w-[85%] border px-2.5 py-1.5", mine ? "border-cyan/40 bg-cyan/10" : m.kind === "reveal" ? "border-violet/50 bg-violet/10" : "border-amber/40 bg-amber/10")}>
                  <div className="flex items-center gap-2 text-[0.58rem] uppercase tracking-wider text-dim">
                    <span>{mine ? "you" : m.fromName}</span>
                    {m.kind !== "whisper" && <span className={m.kind === "reveal" ? "text-violet" : "text-amber"}>{m.kind === "reveal" ? "revealed" : "to everyone"}</span>}
                    <span className="num ml-auto">{stamp(m.createdAt)}</span>
                    {mine && m.readAt && <Icon name="check-check" size={10} className="text-ok" />}
                  </div>
                  <div className="whitespace-pre-wrap break-words text-text">{m.body}</div>
                </div>
              </li>
            );
          })}
        </ul>
        <div ref={endRef} />
      </div>
      <div className="flex items-end gap-2">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          className="min-h-[44px] flex-1"
          placeholder={peer ? "Message… (Enter to send, Shift+Enter for a new line)" : "Pick a player first"}
          aria-label="Message"
        />
        {isDm && (
          <Select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} className="!w-28 !py-1 text-xs" aria-label="Message kind">
            <option value="whisper">Whisper</option>
            <option value="reveal">Reveal</option>
          </Select>
        )}
        <Button variant="solid" color="amber" icon="send" disabled={!draft.trim() || !peer || send.isPending} onClick={submit} aria-label="Send" />
      </div>
    </div>
  );
}
