import type { CampaignDto, MessageDto } from "@neom/shared";
import clsx from "clsx";
import { useEffect, useMemo, useRef, useState } from "react";
import { CHAT_PAGE, useMarkMessagesRead, useMessageThread, useMessages, useSendMessage } from "@/api/hooks";
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

  // Unread counts per tab come from the inbox (latest 200); the open thread is paged separately.
  const unreadIn = (id: string) => (messages.data ?? []).filter((m) => m.fromUserId === id && m.toUserId === meId && !m.readAt).length;
  const paged = useMessageThread(campaign.id, peer);
  const thread = useMemo<MessageDto[]>(() => {
    const seen = new Set<string>();
    const out: MessageDto[] = [];
    for (const page of paged.data?.pages ?? []) for (const m of page) if (!seen.has(m.id)) { seen.add(m.id); out.push(m); }
    return out.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }, [paged.data]);
  const scrollBox = useRef<HTMLDivElement>(null);
  const newestId = thread[thread.length - 1]?.id;

  useEffect(() => {
    const unread = thread.filter((m) => m.toUserId === meId && !m.readAt).map((m) => m.id);
    if (unread.length) markRead.mutate(unread);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peer, newestId, thread.length]);
  // Stick to the bottom when a new message arrives or the thread changes (not when older pages are prepended).
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [peer, newestId]);

  const loadOlder = async () => {
    const box = scrollBox.current;
    const before = box ? box.scrollHeight - box.scrollTop : 0;
    await paged.fetchNextPage();
    requestAnimationFrame(() => {
      if (box) box.scrollTop = box.scrollHeight - before;
    });
  };
  // Lazy loading: when the sentinel above the oldest message scrolls into view, fetch the next page.
  const topRef = useRef<HTMLDivElement>(null);
  const { hasNextPage, isFetchingNextPage } = paged;
  useEffect(() => {
    const el = topRef.current;
    const root = scrollBox.current;
    if (!el || !root || !hasNextPage) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting) && !isFetchingNextPage) void loadOlder();
    }, { root, rootMargin: "120px 0px 0px 0px" });
    io.observe(el);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasNextPage, isFetchingNextPage, peer, thread.length]);

  const submit = () => {
    const body = draft.trim();
    if (!body || !peer) return;
    send.mutateAsync({ userId: peer, message: body, kind: isDm ? kind : "whisper" }).then(() => setDraft(""));
  };
  const peerName = campaign.members.find((m) => m.userId === peer)?.username ?? "—";

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 text-sm" data-testid="chat-panel">
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
      <div ref={scrollBox} className="hud-panel min-h-0 flex-1 overflow-y-auto p-2" style={{ ["--panel-accent" as string]: "var(--color-amber)" }} data-testid="chat-scroll">
        {paged.hasNextPage && (
          <div ref={topRef} className="mb-2 flex items-center justify-center gap-2 py-1 text-[0.6rem] uppercase tracking-wider text-dim" data-testid="chat-load-older" aria-live="polite">
            <Icon name="loader" size={11} className={paged.isFetchingNextPage ? "animate-spin" : ""} /> {paged.isFetchingNextPage ? "Loading older messages…" : "Scroll up for older messages"}
          </div>
        )}
        {!paged.hasNextPage && thread.length >= CHAT_PAGE && <div className="mb-2 text-center text-[0.6rem] uppercase tracking-wider text-dim">Beginning of the thread</div>}
        {paged.isLoading && <div className="text-xs text-dim">Loading…</div>}
        {!paged.isLoading && peer && thread.length === 0 && <div className="py-6 text-center text-xs text-dim">No messages yet. Say something.</div>}
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
