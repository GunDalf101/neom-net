import clsx from "clsx";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useCancelRollRequest, useDashboard, useResolvePending } from "@/api/hooks";
import { LiveControls } from "@/components/dm/LiveControls";
import { MessagePlayers } from "@/components/dm/MessagePlayers";
import { RollRow } from "@/components/hud/DicePanel";
import { Portrait } from "@/components/hud/Portrait";
import { Badge, Bar, Button, Empty, Icon, Panel, Spinner } from "@/components/ui";
import { EventRow } from "./EventsPage";
import { useDm } from "./DmShell";

export function DashboardPage() {
  const { campaign, me } = useDm();
  const dash = useDashboard(campaign.id);
  const resolve = useResolvePending(campaign.id);
  const cancelReq = useCancelRollRequest(campaign.id);
  const [selected, setSelected] = useState<string | null>(null);

  if (dash.isLoading || !dash.data) return <Spinner label="Loading dashboard" />;
  const d = dash.data;
  const sel = selected ?? d.characters[0]?.id ?? null;

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Tile icon="radio" label="Session" value={d.liveSession ? "LIVE" : "OFFLINE"} color={d.liveSession ? "ok" : "muted"} sub={d.liveSession ? `since ${new Date(d.liveSession.startedAt).toLocaleTimeString()}` : "Start one from the sidebar"} />
        <Tile icon="users" label="Online" value={`${d.onlineUserIds.length}/${d.campaign.memberCount}`} color="cyan" sub={d.campaign.members.filter((m) => d.onlineUserIds.includes(m.userId)).map((m) => m.username).join(", ") || "nobody connected"} />
        <Tile icon="swords" label="Encounter" value={d.activeEncounter ? `R${d.activeEncounter.round}` : "—"} color={d.activeEncounter ? "crimson" : "muted"} sub={d.activeEncounter ? `${d.activeEncounter.name} · ${d.activeEncounter.participants.length} combatants` : "No active encounter"} link={`/c/${campaign.id}/dm/encounters`} />
        <Tile icon="hourglass" label="Awaiting DM" value={String(d.pendingActions.length + d.pendingRollRequests.length)} color={d.pendingActions.length ? "amber" : "muted"} sub={`${d.pendingActions.length} rule approvals · ${d.pendingRollRequests.length} roll requests`} />
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(320px,1fr)_minmax(480px,1.6fr)]">
        <div className="min-w-0 space-y-3">
          <Panel title="Character roster" icon="users-round">
            {d.characters.length === 0 && <Empty>No characters in this campaign yet.</Empty>}
            <div className="space-y-2">
              {d.characters.map((ch) => (
                <button key={ch.id} type="button" onClick={() => setSelected(ch.id)} className={clsx("hud-panel flex w-full items-center gap-2 p-2 text-left transition", sel === ch.id ? "border-crimson" : "hover:brightness-125")} style={{ ["--panel-accent" as string]: sel === ch.id ? "var(--color-crimson)" : "var(--color-line-2)" }}>
                  <Portrait url={ch.portraitUrl} name={ch.name} size={44} />
                  <div className="min-w-0 flex-1 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="truncate font-semibold text-text">{ch.name}</span>
                      <span className="flex items-center gap-1 text-dim">
                        <span className={ch.online ? "text-ok" : ""}>●</span> {ch.ownerUsername}
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-2">
                      <span className="num text-crimson">
                        {ch.hpCurrent}/{ch.hpMax}
                        {ch.hpTemp ? `+${ch.hpTemp}` : ""}
                      </span>
                      <Bar value={ch.hpCurrent} max={ch.hpMax} color="crimson" className="flex-1" height={5} />
                      <span className="num text-blue">AC {ch.ac}</span>
                      <span className="num text-cyan">
                        {ch.capacityUsed}/{ch.capacity}
                      </span>
                      <span className={clsx("num", ch.cyberpsychosisPercent >= 75 ? "text-amber" : "text-violet")} title="Cyberpsychosis">
                        Ψ {ch.cyberpsychosisPercent}%
                      </span>
                    </div>
                    <div className="mt-0.5 flex flex-wrap gap-1">
                      {ch.conditions.map((c) => (
                        <Badge key={c} color="crimson">
                          {c}
                        </Badge>
                      ))}
                      {ch.overrideCount > 0 && <Badge color="amber">{ch.overrideCount} override</Badge>}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </Panel>

          <Panel title="Awaiting your ruling" icon="gavel" color="amber">
            {d.pendingActions.length === 0 && d.pendingRollRequests.length === 0 && <div className="text-xs text-dim">Nothing pending.</div>}
            <div className="space-y-2 text-xs">
              {d.pendingActions.map((p) => (
                <div key={p.id} className="hud-panel p-2" style={{ ["--panel-accent" as string]: "var(--color-amber)" }}>
                  <div className="text-text">
                    <span className="text-amber">{p.ruleName}</span> on {p.characterName}
                  </div>
                  <ul className="mt-1 text-muted">
                    {(p.actions as { kind: string; effect?: { kind: string; label?: string } }[]).map((a, i) => (
                      <li key={i}>• {a.kind === "instant" ? a.effect?.kind : a.kind === "temporary" ? `temporary: ${a.effect?.label}` : "cooldown use"}</li>
                    ))}
                  </ul>
                  <div className="mt-2 flex gap-2">
                    <Button size="xs" variant="solid" color="ok" icon="check" onClick={() => resolve.mutate({ id: p.id, decision: "approve" })}>
                      Approve
                    </Button>
                    <Button size="xs" color="crimson" icon="x" onClick={() => resolve.mutate({ id: p.id, decision: "reject", note: "DM ruling" })}>
                      Reject
                    </Button>
                  </div>
                </div>
              ))}
              {d.pendingRollRequests.map((r) => (
                <div key={r.id} className="flex items-center justify-between">
                  <span>
                    Waiting on <span className="text-text">{r.characterName}</span>: {r.label}
                    {r.dc ? ` (DC ${r.dc})` : ""}
                  </span>
                  <Button size="xs" variant="ghost" onClick={() => cancelReq.mutate(r.id)}>
                    Cancel
                  </Button>
                </div>
              ))}
            </div>
          </Panel>

          <MessagePlayers campaign={campaign} meId={me.id} />
        </div>

        <div className="min-w-0 space-y-3">
          {sel ? <LiveControls campaignId={campaign.id} characterId={sel} /> : <Empty>Select a character to control.</Empty>}
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <Panel title="Recent rolls" icon="dices" color="crimson">
              {d.recentRolls.length === 0 && <div className="text-xs text-dim">No rolls yet.</div>}
              {d.recentRolls.map((r) => (
                <RollRow key={r.id} r={r} showName />
              ))}
            </Panel>
            <Panel title="Recent events" icon="scroll-text" color="muted" actions={<Link to={`/c/${campaign.id}/dm/events`} className="text-[0.6rem] uppercase tracking-wider text-cyan hover:underline">All</Link>}>
              <ul className="divide-y divide-line/60">
                {d.recentEvents.slice(0, 12).map((e) => (
                  <EventRow key={e.id} e={e} compact />
                ))}
              </ul>
            </Panel>
          </div>
        </div>
      </div>
    </div>
  );
}

function Tile({ icon, label, value, color, sub, link }: { icon: string; label: string; value: string; color: string; sub: string; link?: string }) {
  const body = (
    <div className="hud-panel flex items-center gap-3 p-3" style={{ ["--panel-accent" as string]: `var(--color-${color})` }}>
      <span className="hud-clip-sm flex h-10 w-10 shrink-0 items-center justify-center border" style={{ borderColor: `var(--color-${color})`, color: `var(--color-${color})` }}>
        <Icon name={icon} size={18} />
      </span>
      <div className="min-w-0">
        <div className="font-display text-[0.55rem] uppercase tracking-[0.2em] text-muted">{label}</div>
        <div className="num text-xl font-bold leading-tight" style={{ color: `var(--color-${color})` }}>
          {value}
        </div>
        <div className="truncate text-[0.65rem] text-dim">{sub}</div>
      </div>
    </div>
  );
  return link ? <Link to={link}>{body}</Link> : body;
}
