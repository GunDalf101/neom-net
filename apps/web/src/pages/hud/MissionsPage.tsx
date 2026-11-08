import type { MissionDto } from "@neom/shared";
import clsx from "clsx";
import { useState } from "react";
import { useCharacters, useItemDefinitions, useMissionOp, useRespondMission, useMissions } from "@/api/hooks";
import { Badge, Bar, Button, Empty, Icon, Input, Panel, Spinner, Toggle } from "@/components/ui";
import { useHud } from "./HudShell";

const STATUS_COLOR: Record<MissionDto["status"], string> = { available: "cyan", active: "amber", completed: "ok", failed: "crimson" };

export function MissionsPage() {
  const { view, campaign, isDm } = useHud();
  const missions = useMissions(campaign.id);
  const op = useMissionOp(campaign.id);
  const respond = useRespondMission(campaign.id);
  const [declineNote, setDeclineNote] = useState<Record<string, string>>({});
  const chars = useCharacters(campaign.id);
  const items = useItemDefinitions(campaign.id);
  const list = missions.data ?? [];
  const order: MissionDto["status"][] = ["active", "available", "completed", "failed"];

  return (
    <div className="mx-auto max-w-[1400px] space-y-3">
      {missions.isLoading && <Spinner />}
      {list.length === 0 && !missions.isLoading && <Empty icon="target">No missions posted yet.</Empty>}
      {order.map((status) => {
        const group = list.filter((m) => m.status === status);
        if (group.length === 0) return null;
        return (
          <div key={status}>
            <div className="hud-title mb-2" style={{ color: `var(--color-${STATUS_COLOR[status]})` }}>
              {status}
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {group.map((m) => {
                const assignedToMe = m.assignedCharacterIds.includes(view.character.id);
                const myAnswer = m.assignments.find((a) => a.characterId === view.character.id)?.response ?? "pending";
                const open = m.status === "available" || m.status === "active";
                const accepted = myAnswer === "accepted";
                const done = m.objectives.filter((o) => o.done).length;
                return (
                  <Panel
                    key={m.id}
                    title={m.name}
                    icon="target"
                    color={STATUS_COLOR[m.status]}
                    actions={assignedToMe ? <Badge color={myAnswer === "accepted" ? "ok" : myAnswer === "declined" ? "crimson" : "amber"}>{myAnswer === "pending" ? "Offered to you" : myAnswer}</Badge> : null}
                  >
                    <p className="whitespace-pre-wrap text-sm text-muted">{m.description}</p>
                    {assignedToMe && open && (
                      <div className="mt-2 flex flex-wrap items-center gap-2 border border-amber/40 bg-amber/5 p-2 text-xs" data-testid="mission-response">
                        {myAnswer === "pending" ? (
                          <span className="text-amber">The DM offers you this mission.</span>
                        ) : (
                          <span className="text-muted">You {myAnswer} this mission. You can change your answer until it closes.</span>
                        )}
                        {myAnswer !== "accepted" && (
                          <Button size="xs" variant="solid" color="ok" icon="check" disabled={respond.isPending} onClick={() => respond.mutate({ id: m.id, characterId: view.character.id, response: "accepted" })}>
                            Accept
                          </Button>
                        )}
                        {myAnswer !== "declined" && (
                          <Button size="xs" color="crimson" icon="x" disabled={respond.isPending} onClick={() => respond.mutate({ id: m.id, characterId: view.character.id, response: "declined", note: declineNote[m.id] ?? "" })}>
                            Decline
                          </Button>
                        )}
                        {myAnswer !== "declined" && <Input placeholder="Reason (optional)" value={declineNote[m.id] ?? ""} onChange={(e) => setDeclineNote({ ...declineNote, [m.id]: e.target.value })} className="!w-44 !py-1 text-xs" />}
                      </div>
                    )}
                    {m.objectives.length > 0 && (
                      <div className="mt-2">
                        <div className="mb-1 flex items-center justify-between text-xs text-muted">
                          <span>Objectives</span>
                          <span className="num">
                            {done}/{m.objectives.length}
                          </span>
                        </div>
                        <Bar value={done} max={m.objectives.length} color={STATUS_COLOR[m.status]} height={5} className="mb-1.5" />
                        <ul className="space-y-0.5">
                          {m.objectives.map((o) => (
                            <li key={o.id}>
                              <Toggle on={o.done} color={STATUS_COLOR[m.status]} disabled={!((assignedToMe && accepted) || isDm) || m.status === "completed"} onChange={(v) => op.mutate({ id: m.id, op: "objective", objectiveId: o.id, done: v })} label={<span className={clsx(o.done && "text-dim line-through")}>{o.text}</span>} />
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-1 text-[0.65rem]">
                      <Icon name="gift" size={12} className="text-amber" />
                      {m.rewards.xp > 0 && <Badge color="blue">{m.rewards.xp} XP</Badge>}
                      {m.rewards.credits > 0 && <Badge color="amber">{m.rewards.credits} ₭</Badge>}
                      {m.rewards.progressionPoints > 0 && <Badge color="cyan">{m.rewards.progressionPoints} pts</Badge>}
                      {m.rewards.itemDefinitionIds.map((id) => (
                        <Badge key={id} color="violet">
                          {items.data?.find((d) => d.id === id)?.name ?? "item"}
                        </Badge>
                      ))}
                      {m.rewardsGrantedAt && <span className="text-ok">granted</span>}
                    </div>
                    {m.assignedCharacterIds.length > 0 && (
                      <div className="mt-1 text-[0.65rem] text-dim">Crew: {m.assignedCharacterIds.map((id) => chars.data?.find((c) => c.id === id)?.name ?? "?").join(", ")}</div>
                    )}
                  </Panel>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
