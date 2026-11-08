import type { CampaignDto } from "@neom/shared";
import clsx from "clsx";
import { useState } from "react";
import { useSendMessage } from "@/api/hooks";
import { Button, Icon, Panel, Select, Textarea } from "@/components/ui";

/** DM → one, several or all players. Each recipient gets their own notification and read state. */
export function MessagePlayers({ campaign, meId }: { campaign: CampaignDto; meId: string }) {
  const send = useSendMessage(campaign.id);
  const players = campaign.members.filter((m) => m.userId !== meId);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [kind, setKind] = useState<"whisper" | "reveal">("whisper");
  const [body, setBody] = useState("");
  const all = picked.size === players.length && players.length > 0;
  const togglePick = (id: string) => setPicked((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });

  return (
    <Panel title="Message players" icon="message-square" color="amber">
      <div className="space-y-2 text-xs">
        <div className="flex flex-wrap items-center gap-1.5">
          <button type="button" className={clsx("hud-tab !px-2 !py-1 !text-[0.55rem]", all && "active")} onClick={() => setPicked(all ? new Set() : new Set(players.map((p) => p.userId)))}>
            Everyone
          </button>
          {players.map((p) => (
            <button key={p.userId} type="button" className={clsx("hud-tab flex items-center gap-1 !px-2 !py-1 !text-[0.55rem]", picked.has(p.userId) && "active")} onClick={() => togglePick(p.userId)} aria-pressed={picked.has(p.userId)}>
              <span className={clsx("inline-block h-1.5 w-1.5 rounded-full", p.online ? "bg-ok" : "bg-dim")} />
              {p.username}
              {p.role === "DM" && <span className="text-[0.5rem] text-crimson">DM</span>}
            </button>
          ))}
          {players.length === 0 && <span className="text-dim">No other members yet.</span>}
        </div>
        <Textarea value={body} onChange={(e) => setBody(e.target.value)} className="min-h-[56px]" placeholder={picked.size ? "The fixer wants to meet at dawn. Come alone." : "Pick who should receive it…"} />
        <div className="flex flex-wrap items-center gap-2">
          <Select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} className="!w-32 !py-1 text-xs" aria-label="Message kind">
            <option value="whisper">Whisper</option>
            <option value="reveal">Reveal info</option>
          </Select>
          <Button
            variant="solid"
            color="amber"
            icon="send"
            disabled={!body.trim() || picked.size === 0 || send.isPending}
            onClick={() => send.mutateAsync({ userIds: [...picked], message: body.trim(), kind }).then(() => setBody(""))}
          >
            {send.isPending ? "Sending…" : `Send to ${picked.size || "…"}`}
          </Button>
          <span className="flex items-center gap-1 text-[0.62rem] text-dim">
            <Icon name="bell" size={11} /> Lands in their notification bell, with a push when they are away.
          </span>
        </div>
      </div>
    </Panel>
  );
}
