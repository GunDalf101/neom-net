import { MISSION_KINDS, MISSION_KIND_META, type MissionDto, type MissionKind } from "@neom/shared";
import clsx from "clsx";
import { useState } from "react";
import { useCharacters, useItemDefinitions, useMissionOp, useRespondMission, useMissions } from "@/api/hooks";
import { Badge, Bar, Button, Empty, Icon, Input, Spinner, Toggle } from "@/components/ui";
import { useHud } from "./HudShell";

const STATUS_COLOR: Record<MissionDto["status"], string> = { available: "cyan", active: "amber", completed: "ok", failed: "crimson" };

/**
 * Missions by kind (Main / Secondary / Personal), one collapsed row per mission: the title until you tap it,
 * then the briefing, objectives, rewards and (secondary only) the accept / decline choice.
 */
export function MissionsPage() {
  const { view, campaign, isDm } = useHud();
  const missions = useMissions(campaign.id);
  const [kind, setKind] = useState<MissionKind>("main");
  const [openId, setOpenId] = useState<string | null>(null);
  const list = missions.data ?? [];
  const inTab = list.filter((m) => m.kind === kind);
  const order: MissionDto["status"][] = ["active", "available", "completed", "failed"];
  const sorted = [...inTab].sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status));
  const meta = MISSION_KIND_META[kind];

  return (
    <div className="mx-auto max-w-[1100px] space-y-3">
      <div className="flex flex-wrap items-center gap-1" data-testid="mission-tabs">
        {MISSION_KINDS.map((k) => {
          const m = MISSION_KIND_META[k];
          const count = list.filter((x) => x.kind === k).length;
          return (
            <button key={k} type="button" className={clsx("hud-tab flex items-center gap-2", kind === k && "active")} style={kind === k ? { background: `var(--color-${m.color})`, boxShadow: `0 0 12px var(--color-${m.color})` } : { color: `var(--color-${m.color})` }} onClick={() => setKind(k)}>
              {m.label}
              <span className="num text-[0.55rem] opacity-70">{count}</span>
            </button>
          );
        })}
        <span className="ml-auto text-[0.65rem] text-dim">{meta.blurb}</span>
      </div>

      {missions.isLoading && <Spinner />}
      {!missions.isLoading && sorted.length === 0 && (
        <Empty icon="target">{list.length === 0 ? "No missions posted yet." : `No ${meta.label.toLowerCase()} missions right now.`}</Empty>
      )}
      <div className="space-y-2">
        {sorted.map((m) => (
          <MissionRow key={m.id} m={m} open={openId === m.id} onToggle={() => setOpenId(openId === m.id ? null : m.id)} characterId={view.character.id} campaignId={campaign.id} isDm={isDm} />
        ))}
      </div>
    </div>
  );
}

function MissionRow({ m, open, onToggle, characterId, campaignId, isDm }: { m: MissionDto; open: boolean; onToggle: () => void; characterId: string; campaignId: string; isDm: boolean }) {
  const op = useMissionOp(campaignId);
  const respond = useRespondMission(campaignId);
  const chars = useCharacters(campaignId);
  const items = useItemDefinitions(campaignId);
  const [declineNote, setDeclineNote] = useState("");
  const meta = MISSION_KIND_META[m.kind];
  const color = `var(--color-${meta.color})`;
  const assignedToMe = m.assignedCharacterIds.includes(characterId);
  const myAnswer = m.assignments.find((a) => a.characterId === characterId)?.response ?? "pending";
  const isOpen = m.status === "available" || m.status === "active";
  // Main and personal assignments are binding: the crew is in without an answer.
  const committed = assignedToMe && (!meta.refusable || myAnswer === "accepted");
  const done = m.objectives.filter((o) => o.done).length;

  return (
    <section className={clsx("hud-panel", open && "lit")} style={{ ["--panel-accent" as string]: color }} data-testid="mission-row" data-kind={m.kind} data-open={open}>
      <button type="button" className="flex w-full items-center gap-3 p-2.5 text-left" onClick={onToggle} aria-expanded={open}>
        <span className="tile tile-sm" style={{ ["--tile-color" as string]: color }}>
          <Icon name="target" size={12} />
        </span>
        <span className="min-w-0 flex-1 truncate font-display text-[0.9rem] font-bold uppercase tracking-[0.06em] text-text">{m.name}</span>
        {m.objectives.length > 0 && (
          <span className="num hidden text-[0.65rem] text-muted sm:inline">
            {done}/{m.objectives.length}
          </span>
        )}
        {assignedToMe && meta.refusable && <Badge color={myAnswer === "accepted" ? "ok" : myAnswer === "declined" ? "crimson" : "amber"}>{myAnswer === "pending" ? "offer" : myAnswer}</Badge>}
        <Badge color={STATUS_COLOR[m.status]}>{m.status}</Badge>
        <Icon name={open ? "chevron-up" : "chevron-down"} size={14} className="text-muted" />
      </button>
      {open && (
        <div className="space-y-2 border-t border-line/60 p-3 text-sm" data-testid="mission-details">
          <p className="whitespace-pre-wrap text-muted">{m.description || "No briefing."}</p>
          {assignedToMe && isOpen && meta.refusable && (
            <div className="flex flex-wrap items-center gap-2 border p-2 text-xs" style={{ borderColor: `color-mix(in srgb, ${color} 40%, transparent)`, background: `color-mix(in srgb, ${color} 6%, transparent)` }} data-testid="mission-response">
              {myAnswer === "pending" ? <span style={{ color }}>The DM offers you this mission.</span> : <span className="text-muted">You {myAnswer} this mission. You can change your answer until it closes.</span>}
              {myAnswer !== "accepted" && (
                <Button size="xs" variant="solid" color="ok" icon="check" disabled={respond.isPending} onClick={() => respond.mutate({ id: m.id, characterId, response: "accepted" })}>
                  Accept
                </Button>
              )}
              {myAnswer !== "declined" && (
                <Button size="xs" color="crimson" icon="x" disabled={respond.isPending} onClick={() => respond.mutate({ id: m.id, characterId, response: "declined", note: declineNote })}>
                  Decline
                </Button>
              )}
              {myAnswer !== "declined" && <Input placeholder="Reason (optional)" value={declineNote} onChange={(e) => setDeclineNote(e.target.value)} className="!w-44 !py-1 text-xs" />}
            </div>
          )}
          {assignedToMe && isOpen && !meta.refusable && (
            <div className="text-xs" style={{ color }}>
              {m.kind === "personal" ? "Your personal thread. Only you and the DM see it." : "You are on this job."}
            </div>
          )}
          {m.objectives.length > 0 && (
            <div>
              <div className="mb-1 flex items-center justify-between text-xs text-muted">
                <span>Objectives</span>
                <span className="num">
                  {done}/{m.objectives.length}
                </span>
              </div>
              <Bar value={done} max={m.objectives.length} color={meta.color} height={5} className="mb-1.5" />
              <ul className="space-y-0.5">
                {m.objectives.map((o) => (
                  <li key={o.id}>
                    <Toggle on={o.done} color={meta.color} disabled={!(committed || isDm) || !isOpen} onChange={(v) => op.mutate({ id: m.id, op: "objective", objectiveId: o.id, done: v })} label={<span className={clsx(o.done && "text-dim line-through")}>{o.text}</span>} />
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-1 text-[0.65rem]">
            <Icon name="gift" size={12} className="text-amber" />
            {m.rewards.xp > 0 && <Badge color="blue">{m.rewards.xp} XP</Badge>}
            {m.rewards.credits > 0 && <Badge color="amber">{m.rewards.credits} ₭</Badge>}
            {m.rewards.progressionPoints > 0 && <Badge color="cyan">{m.rewards.progressionPoints} pts</Badge>}
            {m.rewards.itemDefinitionIds.map((id) => (
              <Badge key={id} color="violet">
                {items.data?.find((d) => d.id === id)?.name ?? "item"}
              </Badge>
            ))}
            {m.rewards.xp + m.rewards.credits + m.rewards.progressionPoints === 0 && m.rewards.itemDefinitionIds.length === 0 && <span className="text-dim">No listed reward.</span>}
            {m.rewardsGrantedAt && <span className="text-ok">granted</span>}
          </div>
          {m.kind !== "personal" && m.assignedCharacterIds.length > 0 && (
            <div className="text-[0.65rem] text-dim">Crew: {m.assignedCharacterIds.map((id) => chars.data?.find((c) => c.id === id)?.name ?? "?").join(", ")}</div>
          )}
        </div>
      )}
    </section>
  );
}
